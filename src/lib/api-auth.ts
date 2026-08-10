import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE, verifySession,
    CLIENT_SESSION_COOKIE, verifyClientSession, type ClientSessionPayload,
} from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAdminAuthState, type AdminAuthState } from "@/lib/tenant";
import { canUsePanel } from "@/lib/tenant-status";

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

/**
 * Converte um erro capturado em resposta, destacando falhas de configuração.
 *
 * Erro de variável de ambiente e erro de runtime têm causas e soluções
 * completamente diferentes, mas ambos caíam no mesmo "Erro interno. Tente
 * novamente." — que manda o usuário repetir uma ação que nunca vai funcionar.
 * Estes casos são de configuração e precisam dizer o que configurar.
 */
export function handleRouteError(e: unknown, context: string): NextResponse {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${context}] uncaught:`, msg);

    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        return jsonError(
            "Servidor mal configurado: defina SUPABASE_SERVICE_ROLE_KEY nas variáveis de " +
            "ambiente. Na Vercel, marque também o ambiente Preview, não apenas Production.",
            500
        );
    }
    if (msg.includes("SESSION_SECRET")) {
        return jsonError(
            "Servidor mal configurado: defina SESSION_SECRET nas variáveis de ambiente.",
            500
        );
    }
    return jsonError("Erro interno. Tente novamente.", 500);
}

type Guard<T> =
    | { ok: true; session: T }
    | { ok: false; response: NextResponse };

/**
 * Sessao de admin valida, SEM olhar o ciclo de vida.
 *
 * Existe para a tela de acompanhamento: uma conta `pendente` precisa entrar
 * para ver em que pe esta o pedido dela. Todo o resto do painel usa
 * requireAdmin(), que barra quem nao esta ativa.
 */
export async function requireAdminSession(request: NextRequest): Promise<Guard<AdminAuthState>> {
    if (request.method !== "GET" && !checkOrigin(request)) {
        return { ok: false, response: jsonError("Forbidden", 403) };
    }

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return { ok: false, response: jsonError("Não autenticado.", 401) };

    const session = await verifySession(cookie);
    if (!session) return { ok: false, response: jsonError("Sessão inválida.", 401) };

    // Estado vivo, nao o do cookie: e aqui que uma suspensao morde.
    const live = await getAdminAuthState(session.adminId);
    if (!live) return { ok: false, response: jsonError("Conta não encontrada.", 401) };

    return { ok: true, session: live };
}

/** Exige sessao de admin de uma tenant ATIVA. Portao padrao do painel. */
export async function requireAdmin(request: NextRequest): Promise<Guard<AdminAuthState>> {
    const auth = await requireAdminSession(request);
    if (!auth.ok) return auth;

    if (!canUsePanel(auth.session.status)) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: "Sua loja ainda não está liberada.",
                    code: "TENANT_INATIVA",
                    status: auth.session.status,
                },
                { status: 403 }
            ),
        };
    }

    return auth;
}

/**
 * Exige o dono do sistema.
 *
 * Um lojista ativo tem cookie perfeitamente valido — so o papel o separa da
 * fila de contratacoes. E o papel sai do banco, nunca do cookie.
 */
export async function requireOwner(request: NextRequest): Promise<Guard<AdminAuthState>> {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth;

    if (auth.session.role !== "owner") {
        // Sem NENHUM owner no banco, ninguém consegue aprovar contratação e a
        // fila fica inalcançável. Dizer exatamente o que rodar poupa a caçada.
        const { count } = await getSupabaseAdmin()
            .from("admins").select("id", { count: "exact", head: true }).eq("role", "owner");

        if (!count) {
            return {
                ok: false,
                response: jsonError(
                    "Nenhum dono definido. Execute no Supabase: " +
                    "UPDATE admins SET role = 'owner' WHERE email = '<seu e-mail>'; (migration 026)",
                    500
                ),
            };
        }
        return { ok: false, response: jsonError("Acesso restrito.", 403) };
    }

    return auth;
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
