import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE, verifySession, type SessionPayload,
    CLIENT_SESSION_COOKIE, verifyClientSession, type ClientSessionPayload,
} from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";

/**
 * Guardas de autenticação para as rotas de API.
 *
 * A partir da Fase 0 o navegador não fala mais direto com o Postgres: toda
 * leitura e escrita passa por uma rota que usa a service role. Como a service
 * role ignora RLS, o isolamento entre lojas depende inteiramente de derivar o
 * tenant do cookie assinado — nunca de um campo que o cliente possa mandar.
 *
 * Por isso `adminId` sai sempre da sessão verificada, e as queries filtram por
 * ele. Um `adminId` vindo do corpo da requisição seria trivialmente forjável.
 */

export function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

type Guard<T> =
    | { ok: true; session: T }
    | { ok: false; response: NextResponse };

/** Exige sessão de administrador. Valida CSRF em requisições que alteram estado. */
export async function requireAdmin(request: NextRequest): Promise<Guard<SessionPayload>> {
    if (request.method !== "GET" && !checkOrigin(request)) {
        return { ok: false, response: jsonError("Forbidden", 403) };
    }

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return { ok: false, response: jsonError("Não autenticado.", 401) };

    const session = await verifySession(cookie);
    if (!session) return { ok: false, response: jsonError("Sessão inválida.", 401) };

    return { ok: true, session };
}

/** Exige sessão de cliente final. Valida CSRF em requisições que alteram estado. */
export async function requireClient(request: NextRequest): Promise<Guard<ClientSessionPayload>> {
    if (request.method !== "GET" && !checkOrigin(request)) {
        return { ok: false, response: jsonError("Forbidden", 403) };
    }

    const cookie = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
    if (!cookie) return { ok: false, response: jsonError("Não autenticado.", 401) };

    const session = await verifyClientSession(cookie);
    if (!session) return { ok: false, response: jsonError("Sessão inválida.", 401) };

    return { ok: true, session };
}

/** Lê o corpo JSON, devolvendo erro padronizado quando malformado. */
export async function readJson<T = Record<string, unknown>>(
    request: NextRequest
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
    try {
        return { ok: true, body: (await request.json()) as T };
    } catch {
        return { ok: false, response: jsonError("JSON inválido.", 400) };
    }
}
