import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPasswordServer, verifyPasswordServer, generateSecureTokenServer, safeCompareStrings } from "@/lib/server-crypto";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session-cookie";
import { rateLimit, getClientIP, LIMITS } from "@/lib/rate-limit";

/**
 * Server-side admin authentication.
 * Password hash NEVER leaves the server — the client only receives { adminId, email }.
 * On success, sets an httpOnly signed session cookie.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY when available (bypasses RLS safely on the server).
 * Falls back to anon key only if the service role key is not configured.
 */
const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function ok(data: object)               { return NextResponse.json(data); }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }); }

function tooMany(resetAt: number) {
    const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
        { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
}

async function okWithSession(data: { adminId: string; email: string }) {
    const signed = await signSession(data);
    const res = NextResponse.json(data);
    res.cookies.set(SESSION_COOKIE, signed, sessionCookieOptions());
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
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return err("Invalid JSON", 400);
    }

    if (typeof body !== "object" || body === null) return err("Invalid request", 400);
    const { action } = body as Record<string, unknown>;

    const ip = getClientIP(request);

    switch (action) {
        case "signin":         return handleSignIn(body as Record<string, unknown>, ip);
        case "signup":         return handleSignUp(body as Record<string, unknown>, ip);
        case "forgot_request": return handleForgotRequest(body as Record<string, unknown>, ip);
        case "forgot_verify":  return handleForgotVerify(body as Record<string, unknown>, ip);
        case "forgot_reset":   return handleForgotReset(body as Record<string, unknown>, ip);
        default:               return err("Unknown action", 400);
    }
}

// ── Sign in ───────────────────────────────────────────────────────────────────

async function handleSignIn({ email, password }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`signin:${ip}`, LIMITS.signin.max, LIMITS.signin.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email) || !isValidPassword(password)) {
        return err("Credenciais inválidas.", 401);
    }

    const { data: admin } = await supabaseServer
        .from("admins")
        .select("id, email, password_hash")
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

    return okWithSession({ adminId: admin.id, email: admin.email });
}

// ── Sign up ───────────────────────────────────────────────────────────────────

async function handleSignUp({ email, password }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`signup:${ip}`, LIMITS.signup.max, LIMITS.signup.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email) || !isValidPassword(password)) {
        return err("Dados inválidos.", 400);
    }

    const { data: existing } = await supabaseServer
        .from("admins")
        .select("id, email, password_hash")
        .eq("email", email.trim().toLowerCase())
        .single();

    if (!existing) {
        return err("Email não autorizado. Contate o administrador do sistema.", 403);
    }
    if (existing.password_hash) {
        return err("Este email já possui uma senha cadastrada. Use a opção de login.", 409);
    }

    const password_hash = await hashPasswordServer(password);

    const { error: updateError } = await supabaseServer
        .from("admins")
        .update({ password_hash })
        .eq("id", existing.id);

    if (updateError) {
        return err("Erro ao definir senha. Tente novamente.", 500);
    }

    return okWithSession({ adminId: existing.id, email: existing.email });
}

// ── Forgot: request reset code ────────────────────────────────────────────────

async function handleForgotRequest({ email }: Record<string, unknown>, ip: string) {
    const rl = rateLimit(`forgot_req:${ip}`, LIMITS.forgot_request.max, LIMITS.forgot_request.windowMs);
    if (!rl.allowed) return tooMany(rl.resetAt);

    if (!isValidEmail(email)) return ok({ ok: true }); // Always 200 — no enumeration

    const { data: admin } = await supabaseServer
        .from("admins")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .single();

    if (admin) {
        const token   = generateSecureTokenServer();
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        await supabaseServer
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

    const { data: admin } = await supabaseServer
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
    const { data: admin } = await supabaseServer
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

    const { error: updateError } = await supabaseServer
        .from("admins")
        .update({ password_hash, reset_token: null, reset_expires: null })
        .eq("id", admin.id);

    if (updateError) {
        return err("Erro ao atualizar senha. Tente novamente.", 500);
    }

    return ok({ ok: true });
}
