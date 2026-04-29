import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    CLIENT_SESSION_COOKIE, clientSessionCookieOptions,
    signClientSession, verifyClientSession, ClientSessionPayload,
} from "@/lib/session-cookie";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { validatePhone, validateName, truncate, LIMITS } from "@/lib/validators";
import { checkOrigin } from "@/lib/csrf";

const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function ok(data: object)               { return NextResponse.json(data); }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }); }
function tooMany()                       { return NextResponse.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429 }); }

async function withCookie(res: NextResponse, payload: ClientSessionPayload): Promise<NextResponse> {
    const signed = await signClientSession(payload);
    res.cookies.set(CLIENT_SESSION_COOKIE, signed, clientSessionCookieOptions());
    return res;
}

/** GET /api/auth/client — verify client session cookie, return session payload */
export async function GET(request: NextRequest) {
    const cookie = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
    if (!cookie) return NextResponse.json({ error: "No session" }, { status: 401 });

    const session = await verifyClientSession(cookie);
    if (!session) {
        const res = NextResponse.json({ error: "Invalid session" }, { status: 401 });
        res.cookies.set(CLIENT_SESSION_COOKIE, "", { ...clientSessionCookieOptions(), maxAge: 0 });
        return res;
    }

    return NextResponse.json(session);
}

/** DELETE /api/auth/client — clear client session cookie (logout) */
export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(CLIENT_SESSION_COOKIE, "", { ...clientSessionCookieOptions(), maxAge: 0 });
    return res;
}

/** POST /api/auth/client — login (returning client) or register (new client) */
export async function POST(request: NextRequest) {
    try {
        if (!checkOrigin(request)) return err("Forbidden", 403);

        const ip = getClientIP(request);
        const rl = rateLimit(`client_auth:${ip}`, 10, 15 * 60 * 1000);
        if (!rl.allowed) return tooMany();

        let body: unknown;
        try { body = await request.json(); }
        catch { return err("Invalid JSON", 400); }

        if (typeof body !== "object" || body === null) return err("Invalid request", 400);
        const { action } = body as Record<string, unknown>;

        if (action === "login")    return await handleLogin(body as Record<string, unknown>);
        if (action === "register") return await handleRegister(body as Record<string, unknown>, ip);

        return err("Unknown action", 400);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[/api/auth/client] uncaught:", msg);
        // Surface the SESSION_SECRET misconfig clearly so it's not just a blind 500
        if (msg.includes("SESSION_SECRET")) {
            return err("Servidor mal configurado: defina a variável SESSION_SECRET no Vercel.", 500);
        }
        return err("Erro interno. Tente novamente.", 500);
    }
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function getDefaultAdminId(): Promise<string | null> {
    const { data: admins, error: adminsErr } = await supabaseServer
        .from("admins")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1);
    if (adminsErr) console.error("[getDefaultAdminId] admins query error:", adminsErr.message);
    if (admins?.[0]?.id) return admins[0].id;

    // Fallback: derive admin from store_settings (covers cases where admins
    // table is locked by RLS or empty but a store is configured)
    const { data: stores, error: storesErr } = await supabaseServer
        .from("store_settings")
        .select("admin_id")
        .not("admin_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(1);
    if (storesErr) console.error("[getDefaultAdminId] store_settings query error:", storesErr.message);
    return stores?.[0]?.admin_id ?? null;
}

async function handleLogin({ phone, adminId }: Record<string, unknown>) {
    const phoneVal = validatePhone(typeof phone === "string" ? phone : "", true);
    if (!phoneVal.ok) return err(phoneVal.error, 400);

    const cleanPhone = (phone as string).trim();
    let query = supabaseServer
        .from("clients")
        .select("id, name, phone, admin_id")
        .eq("phone", cleanPhone)
        .limit(1);
    if (typeof adminId === "string" && adminId) query = query.eq("admin_id", adminId);

    const { data: clients } = await query;

    if (!clients?.length) return err("Cliente não encontrado.", 404);

    const c = clients[0];
    const payload: ClientSessionPayload = {
        clientId: c.id,
        name:     c.name,
        phone:    c.phone,
        adminId:  c.admin_id,
    };

    return withCookie(ok(payload), payload);
}

// ── Register ──────────────────────────────────────────────────────────────────

async function handleRegister({ phone, name, adminId, address }: Record<string, unknown>, ip: string) {
    // Stricter per-IP limit for registration (prevents spam account creation)
    const rl = rateLimit(`client_register:${ip}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) return tooMany();

    const phoneVal = validatePhone(typeof phone === "string" ? phone : "", true);
    if (!phoneVal.ok) return err(phoneVal.error, 400);

    const nameVal = validateName(typeof name === "string" ? name : "");
    if (!nameVal.ok) return err(nameVal.error, 400);

    let resolvedAdminId = typeof adminId === "string" && adminId ? adminId : "";
    if (!resolvedAdminId) {
        const fallback = await getDefaultAdminId();
        if (!fallback) return err("Nenhuma loja disponível para cadastro.", 503);
        resolvedAdminId = fallback;
    }

    const cleanPhone   = truncate((phone as string).trim(), LIMITS.phone);
    const cleanName    = truncate((name as string).trim(), LIMITS.name);
    const cleanAddress = typeof address === "string" && address.trim()
        ? truncate(address.trim(), 255)
        : null;

    // Idempotency: if phone already registered for this admin, return existing session
    const { data: existing } = await supabaseServer
        .from("clients")
        .select("id, name, phone, admin_id")
        .eq("phone", cleanPhone)
        .eq("admin_id", resolvedAdminId)
        .limit(1);

    if (existing?.length) {
        const c = existing[0];
        const payload: ClientSessionPayload = {
            clientId: c.id, name: c.name, phone: c.phone, adminId: c.admin_id,
        };
        return withCookie(ok(payload), payload);
    }

    // Generate unique client ID (random 8-char hex)
    const randomBytes = crypto.getRandomValues(new Uint8Array(4));
    const clientId = "CL" + Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join("");

    const { error: insertError } = await supabaseServer
        .from("clients")
        .insert({ id: clientId, name: cleanName, phone: cleanPhone, address: cleanAddress, admin_id: resolvedAdminId });

    if (insertError) {
        // Duplicate key race — retry read
        if (insertError.code === "23505") {
            const { data: retry } = await supabaseServer
                .from("clients").select("id, name, phone, admin_id")
                .eq("phone", cleanPhone).eq("admin_id", resolvedAdminId).limit(1);
            if (retry?.length) {
                const c = retry[0];
                const payload: ClientSessionPayload = {
                    clientId: c.id, name: c.name, phone: c.phone, adminId: c.admin_id,
                };
                return withCookie(ok(payload), payload);
            }
        }
        return err("Erro ao cadastrar. Tente novamente.", 500);
    }

    const payload: ClientSessionPayload = {
        clientId, name: cleanName, phone: cleanPhone, adminId: resolvedAdminId,
    };

    return withCookie(ok(payload), payload);
}
