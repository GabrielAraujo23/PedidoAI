import { NextRequest, NextResponse } from "next/server";
import {
    CLIENT_SESSION_COOKIE, clientSessionCookieOptions,
    signClientSession, verifyClientSession, ClientSessionPayload,
    TENANT_COOKIE, verifyTenant,
} from "@/lib/session-cookie";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { validatePhone, validateName, truncate, LIMITS } from "@/lib/validators";
import { checkOrigin } from "@/lib/csrf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { handleRouteError } from "@/lib/api-auth";
import { isTenantActive, listActiveAdminIds } from "@/lib/tenant";

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
        return handleRouteError(e, "GET /api/auth/client");
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

        if (action === "lookup")   return await handleLookup(request, body as Record<string, unknown>);
        if (action === "login")    return await handleLogin(request, body as Record<string, unknown>);
        if (action === "register") return await handleRegister(request, body as Record<string, unknown>, ip);

        return err("Unknown action", 400);
    } catch (e) {
        return handleRouteError(e, "POST /api/auth/client");
    }
}

// ── Resolução do tenant ───────────────────────────────────────────────────────

type TenantResult =
    | { ok: true; adminId: string }
    | { ok: false; response: NextResponse };

/**
 * Descobre em qual loja esta requisição acontece.
 *
 * Ordem, da pista mais explícita para a menos:
 *   1. `adminId` no corpo — só existe porque links `/login?admin=<uuid>` antigos
 *      continuam circulando. É o único lugar do sistema onde aceitamos tenant
 *      vindo do cliente, e ele não dá acesso a nada: apenas escolhe em qual
 *      loja o visitante vai se cadastrar ou procurar o próprio telefone, que é
 *      informação que ele já teria pelo link.
 *   2. cookie de tenant assinado, gravado por /loja/<slug>. Assinado com HMAC,
 *      então não dá para forjar uma loja.
 *   3. instalação com uma loja só — não há o que ambiguar.
 *   4. várias lojas e nenhuma pista → 409. Antes daqui saía a loja mais antiga,
 *      e o cliente era cadastrado na loja errada em silêncio.
 */
async function resolveTenant(request: NextRequest, bodyAdminId: unknown): Promise<TenantResult> {
    // Toda pista precisa apontar para uma loja ATIVA. Um link antigo
    // `?admin=<uuid>` de loja suspensa cadastraria cliente numa loja que não
    // pode vender — e o cliente só descobriria no checkout.
    if (typeof bodyAdminId === "string" && bodyAdminId.trim()) {
        const id = bodyAdminId.trim();
        if (await isTenantActive(id)) return { ok: true, adminId: id };
        return { ok: false, response: err("Esta loja não está disponível no momento.", 404) };
    }

    const cookie = request.cookies.get(TENANT_COOKIE)?.value;
    if (cookie) {
        const tenant = await verifyTenant(cookie);
        if (tenant?.adminId && (await isTenantActive(tenant.adminId))) {
            return { ok: true, adminId: tenant.adminId };
        }
    }

    // Pedimos 2 ids de propósito: precisamos saber se existe uma segunda loja
    // ativa, não apenas qual é a primeira.
    const ativos = await listActiveAdminIds(2);

    if (ativos.length === 1) return { ok: true, adminId: ativos[0] };

    if (ativos.length === 0) {
        return { ok: false, response: err("Nenhuma loja disponível para cadastro.", 503) };
    }

    return {
        ok: false,
        response: NextResponse.json(
            { needsStore: true, error: "Use o link da loja para entrar." },
            { status: 409 }
        ),
    };
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Diz apenas se um telefone já tem cadastro, e o primeiro nome para a saudação.
 *
 * A tela de login usava isto consultando a tabela `clients` direto do
 * navegador, o que devolvia o registro inteiro — endereço, id, tudo. Como o
 * login é só por telefone, alguém poderia varrer números e coletar dados.
 * Aqui devolvemos o mínimo, e o rate limit de client_auth já se aplica.
 */
async function handleLookup(request: NextRequest, { phone, adminId }: Record<string, unknown>) {
    const phoneVal = validatePhone(typeof phone === "string" ? phone : "", true);
    if (!phoneVal.ok) return err(phoneVal.error, 400);

    const tenant = await resolveTenant(request, adminId);
    if (!tenant.ok) return tenant.response;

    const { data } = await getSupabaseAdmin()
        .from("clients")
        .select("name, admin_id")
        .eq("phone", (phone as string).trim())
        .eq("admin_id", tenant.adminId)
        .limit(1);

    if (!data?.length) return ok({ exists: false });
    return ok({ exists: true, name: data[0].name, adminId: data[0].admin_id });
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(request: NextRequest, { phone, adminId }: Record<string, unknown>) {
    const phoneVal = validatePhone(typeof phone === "string" ? phone : "", true);
    if (!phoneVal.ok) return err(phoneVal.error, 400);

    const cleanPhone = (phone as string).trim();

    const tenant = await resolveTenant(request, adminId);
    if (!tenant.ok) return tenant.response;

    // A consulta é sempre escopada pela loja resolvida. Antes ela podia rodar
    // sem filtro, e um telefone cadastrado em duas lojas entrava numa delas por
    // sorte de ordenação — agora a loja é decidida antes de olhar o cliente.
    const { data: clients } = await getSupabaseAdmin()
        .from("clients")
        .select("id, name, phone, admin_id")
        .eq("phone", cleanPhone)
        .eq("admin_id", tenant.adminId)
        .limit(1);

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

async function handleRegister(
    request: NextRequest,
    { phone, name, adminId, address }: Record<string, unknown>,
    ip: string
) {
    // Stricter per-IP limit for registration (prevents spam account creation)
    const rl = rateLimit(`client_register:${ip}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) return tooMany();

    const phoneVal = validatePhone(typeof phone === "string" ? phone : "", true);
    if (!phoneVal.ok) return err(phoneVal.error, 400);

    const nameVal = validateName(typeof name === "string" ? name : "");
    if (!nameVal.ok) return err(nameVal.error, 400);

    const tenant = await resolveTenant(request, adminId);
    if (!tenant.ok) return tenant.response;
    const resolvedAdminId = tenant.adminId;

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
