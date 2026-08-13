import { NextRequest, NextResponse } from "next/server";
import { hashPasswordServer, verifyPasswordServer, generateSecureTokenServer, safeCompareStrings } from "@/lib/server-crypto";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session-cookie";
import { PALETTE_COOKIE, serializarPaleta, paletteCookieOptions } from "@/lib/palette-cookie";
import { rateLimit, getClientIP, LIMITS } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { handleRouteError } from "@/lib/api-auth";
import { isTenantStatus, isAdminRole, type TenantStatus, type AdminRole } from "@/lib/tenant-status";

/**
 * Server-side admin authentication.
 * Password hash NEVER leaves the server — the client only receives { adminId, email }.
 * On success, sets an httpOnly signed session cookie.
 *
 * Exige SUPABASE_SERVICE_ROLE_KEY: a tabela admins é inacessível para anon
 * desde a migration 022. Não há fallback para a anon key — sem a chave, a
 * rota falha com uma mensagem que diz exatamente o que configurar.
 */

function ok(data: object)               { return NextResponse.json(data); }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }); }

function tooMany(resetAt: number) {
    const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
        { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
}

async function okWithSession(data: {
    adminId: string; email: string; role: AdminRole; status: TenantStatus;
}) {
    const signed = await signSession(data);
    // `role` vai no corpo porque a sidebar precisa dele para decidir se mostra
    // o item de Contratações, e sem isso ele só chegaria no reload seguinte.
    // Não é segredo — a pessoa sabe se é dona do sistema. `status` fica só no
    // cookie: nenhuma tela do painel precisa dele (quem não está ativa nem
    // chega ao painel).
    const res = NextResponse.json({ adminId: data.adminId, email: data.email, role: data.role });
    res.cookies.set(SESSION_COOKIE, signed, sessionCookieOptions());

    // Sem isto, o lojista veria o painel na cor do PedidoAI até abrir a própria
    // loja pelo link público — que ele quase nunca faz.
    const { data: loja } = await getSupabaseAdmin()
        .from("store_settings")
        .select("palette_family, accent_color")
        .eq("admin_id", data.adminId)
        .maybeSingle();

    res.cookies.set(
        PALETTE_COOKIE,
        serializarPaleta(loja?.palette_family, loja?.accent_color),
        paletteCookieOptions()
    );

    return res;
}

// ── Shared input validation ───────────────────────────────────────────────────

function isValidEmail(email: unknown): email is string {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPassword(password: unknown): password is string {
    return typeof password === "string" && password.length >= 6 && password.length <= 256;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        if (!checkOrigin(request)) return err("Forbidden", 403);

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return err("Invalid JSON", 400);
        }

        if (typeof body !== "object" || body === null) return err("Invalid request", 400);
        const { action } = body as Record<string, unknown>;

        const ip = getClientIP(request);

        // Não existe "signup" aqui. Criar conta é contratar o serviço, e isso
        // acontece em POST /api/contratar — que coleta dados da loja, endereço
        // público e aceite de contrato, e deixa a conta pendente de aprovação.
        // O antigo signup apenas definia a senha de uma linha inserida à mão no
        // Supabase, e respondia 403 para todo mundo que não estivesse lá.
        switch (action) {
            case "signin":         return await handleSignIn(body as Record<string, unknown>, ip);
            case "forgot_request": return await handleForgotRequest(body as Record<string, unknown>, ip);
            case "forgot_verify":  return await handleForgotVerify(body as Record<string, unknown>, ip);
            case "forgot_reset":   return await handleForgotReset(body as Record<string, unknown>, ip);
            default:               return err("Unknown action", 400);
        }
    } catch (e) {
        return handleRouteError(e, "POST /api/auth/admin");
    }
}

// ── Sign in ───────────────────────────────────────────────────────────────────

async function handleSignIn({ email, password }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`signin:${ip}`, LIMITS.signin.max, LIMITS.signin.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email) || !isValidPassword(password)) {
        return err("Credenciais inválidas.", 401);
    }

    const { data: admin } = await getSupabaseAdmin()
        .from("admins")
        .select("id, email, password_hash, role, status")
        .eq("email", email.trim().toLowerCase())
        .single();

    // Use same error for wrong email and wrong password to prevent enumeration
    if (!admin?.password_hash) {
        return err("Credenciais inválidas.", 401);
    }

    const valid = await verifyPasswordServer(password, admin.password_hash);
    if (!valid) {
        return err("Credenciais inválidas.", 401);
    }

    if (!isAdminRole(admin.role) || !isTenantStatus(admin.status)) {
        console.error("[handleSignIn] role/status inválido:", admin.id, admin.role, admin.status);
        return err("Conta em estado inconsistente. Contate o suporte.", 500);
    }

    // O login FUNCIONA para conta pendente/suspensa: ela precisa entrar para
    // ver a tela de acompanhamento. Quem barra e o portao seguinte.
    return okWithSession({
        adminId: admin.id, email: admin.email, role: admin.role, status: admin.status,
    });
}

// ── Forgot: request reset code ────────────────────────────────────────────────

async function handleForgotRequest({ email }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`forgot_req:${ip}`, LIMITS.forgot_request.max, LIMITS.forgot_request.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email)) return ok({ ok: true }); // Always 200 — no enumeration

    // Per-email rate limit (prevents targeting a specific account repeatedly)
    const emailKey = email.trim().toLowerCase();
    const rlEmail = rateLimit(`forgot_req_email:${emailKey}`, 3, 60 * 60 * 1000);
    if (!rlEmail.allowed) return ok({ ok: true }); // Silent — no enumeration

    const { data: admin } = await getSupabaseAdmin()
        .from("admins")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .single();

    if (admin) {
        const token   = generateSecureTokenServer();
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        await getSupabaseAdmin()
            .from("admins")
            .update({ reset_token: token, reset_expires: expires })
            .eq("id", admin.id);

        // TODO: send `token` via email to `email`
        // e.g. await sendResetEmail(email, token);
    }

    // Always return success regardless of whether the email exists
    return ok({ ok: true });
}

// ── Forgot: verify code ───────────────────────────────────────────────────────

async function handleForgotVerify({ email, code }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`forgot_verify:${ip}`, LIMITS.forgot_verify.max, LIMITS.forgot_verify.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email) || typeof code !== "string" || code.length < 16) {
        return err("Código inválido ou expirado.", 400);
    }

    const { data: admin } = await getSupabaseAdmin()
        .from("admins")
        .select("reset_token, reset_expires")
        .eq("email", email.trim().toLowerCase())
        .single();

    if (
        !admin ||
        !safeCompareStrings(admin.reset_token ?? "", code.trim()) ||
        new Date(admin.reset_expires) < new Date()
    ) {
        return err("Código inválido ou expirado.", 400);
    }

    return ok({ ok: true });
}

// ── Forgot: set new password ──────────────────────────────────────────────────

async function handleForgotReset({ email, code, password }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`forgot_reset:${ip}`, LIMITS.forgot_reset.max, LIMITS.forgot_reset.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email) || typeof code !== "string" || !isValidPassword(password)) {
        return err("Dados inválidos.", 400);
    }

    // Re-verify code server-side before allowing password reset
    const { data: admin } = await getSupabaseAdmin()
        .from("admins")
        .select("id, reset_token, reset_expires")
        .eq("email", email.trim().toLowerCase())
        .single();

    if (
        !admin ||
        !safeCompareStrings(admin.reset_token ?? "", code.trim()) ||
        new Date(admin.reset_expires) < new Date()
    ) {
        return err("Código inválido ou expirado.", 400);
    }

    const password_hash = await hashPasswordServer(password);

    const { error: updateError } = await getSupabaseAdmin()
        .from("admins")
        .update({ password_hash, reset_token: null, reset_expires: null })
        .eq("id", admin.id);

    if (updateError) {
        return err("Erro ao atualizar senha. Tente novamente.", 500);
    }

    return ok({ ok: true });
}
