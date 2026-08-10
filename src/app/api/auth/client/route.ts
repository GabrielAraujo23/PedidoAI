import { NextRequest, NextResponse } from "next/server";
import {
    CLIENT_SESSION_COOKIE, clientSessionCookieOptions,
    signClientSession, verifyClientSession, ClientSessionPayload,
} from "@/lib/session-cookie";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { validatePhone, validateName, truncate, LIMITS } from "@/lib/validators";
import { checkOrigin } from "@/lib/csrf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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
    try {
        const cookie = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
        if (!cookie) return NextResponse.json({ error: "No session" }, { status: 401 });

        const session = await verifyClientSession(cookie);
        if (!session) {
            const res = NextResponse.json({ error: "Invalid session" }, { status: 401 });
            res.cookies.set(CLIENT_SESSION_COOKIE, "", { ...clientSessionCookieOptions(), maxAge: 0 });
            return res;
        }
        return NextResponse.json(session);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[GET /api/auth/client] uncaught:", msg);
        return NextResponse.json({ error: "Erro interno." }, { status: 500 });
    }
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

/**
 * Loja padrão para cadastros que chegam sem `?admin=` na URL.
 *
 * LIMITAÇÃO CONHECIDA (multi-tenant): isto devolve o admin mais antigo. Com
 * uma loja só está correto; com várias, um cliente novo que abra a URL sem o
 * parâmetro é cadastrado na loja errada em silêncio. A correção de verdade é
 * dar a cada tenant um slug/subdomínio próprio (loja.pedidoai.com) para que
 * nunca exista pedido sem loja definida — está previsto para a Fase 1.
 */
async function getDefaultAdminId(): Promise<string | null> {
    const { data: admins, error: adminsErr } = await getSupabaseAdmin()
        .from("admins")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1);
    if (adminsErr) console.error("[getDefaultAdminId] admins query error:", adminsErr.message);
    if (admins?.[0]?.id) return admins[0].id;

    // Fallback: derive admin from store_settings (covers cases where admins
    // table is locked by RLS or empty but a store is configured)
    const { data: stores, error: storesErr } = await getSupabaseAdmin()
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
    const wantedAdminId = typeof adminId === "string" && adminId ? adminId : "";

    // Sem .limit(1): antes pegávamos o primeiro registro que voltasse, então um
    // telefone cadastrado em duas lojas caía numa delas por sorte de ordenação.
    // Buscamos todos os cadastros e decidimos explicitamente.
    let query = getSupabaseAdmin()
        .from("clients")
        .select("id, name, phone, admin_id")
        .eq("phone", cleanPhone);
    if (wantedAdminId) query = query.eq("admin_id", wantedAdminId);

    const { data: clients } = await query;

    if (!clients?.length) return err("Cliente não encontrado.", 404);

    const byTenant = new Map<string, (typeof clients)[number]>();
    for (const c of clients) {
        if (c.admin_id && !byTenant.has(c.admin_id)) byTenant.set(c.admin_id, c);
    }

    // Mesmo telefone em mais de uma loja: quem escolhe é o cliente, não a
    // ordenação do banco. Devolvemos as lojas para a tela montar a escolha.
    if (byTenant.size > 1) {
        const { data: stores } = await getSupabaseAdmin()
            .from("store_settings")
            .select("admin_id, store_name")
            .in("admin_id", [...byTenant.keys()]);

        const nameOf = new Map((stores ?? []).map((s) => [s.admin_id, s.store_name]));
        return NextResponse.json(
            {
                needsStoreChoice: true,
                stores: [...byTenant.keys()].map((id) => ({
                    adminId: id,
                    storeName: nameOf.get(id) || "Loja",
                })),
            },
            { status: 409 }
        );
    }

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
    const { data: existing } = await getSupabaseAdmin()
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

    const { error: insertError } = await getSupabaseAdmin()
        .from("clients")
        .insert({ id: clientId, name: cleanName, phone: cleanPhone, address: cleanAddress, admin_id: resolvedAdminId });

    if (insertError) {
        // Duplicate key race — retry read
        if (insertError.code === "23505") {
            const { data: retry } = await getSupabaseAdmin()
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
