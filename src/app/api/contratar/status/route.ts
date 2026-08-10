import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession, handleRouteError } from "@/lib/api-auth";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session-cookie";
import type { AdminAuthState } from "@/lib/tenant";

/**
 * GET /api/contratar/status — o estado do próprio pedido de contratação.
 *
 * Usa requireAdminSession() e NÃO requireAdmin(): quem consulta esta rota é,
 * por definição, quem ainda não está ativa. Com o guarda padrão ela
 * responderia 403 para exatamente o público a que serve.
 */

/**
 * Reemite o cookie com o estado vivo antes de responder.
 *
 * O middleware decide pelo status que está DENTRO do cookie, e o cookie vale
 * 24h. Isso é de propósito para negar (uma suspensão morde no requireAdmin, que
 * consulta o banco), mas a checagem autoritativa só sabe apertar, nunca
 * afrouxar: sem esta reemissão, um lojista aprovado continuaria com um cookie
 * dizendo "pendente" e ficaria preso na tela de análise até o cookie expirar —
 * vendo "estamos conferindo seus dados" por um dia depois de já ter sido
 * liberado.
 *
 * Esta rota é o único lugar que a tela de acompanhamento chama, então é aqui
 * que a boa notícia alcança o cookie.
 */
async function comCookieAtualizado(body: object, live: AdminAuthState) {
    const res = NextResponse.json(body);
    const signed = await signSession({
        adminId: live.adminId,
        email:   live.email,
        role:    live.role,
        status:  live.status,
    });
    res.cookies.set(SESSION_COOKIE, signed, sessionCookieOptions());
    return res;
}
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdminSession(request);
        if (!auth.ok) return auth.response;

        const { data, error } = await getSupabaseAdmin()
            .from("admins")
            .select("email, status, status_reason, status_changed_at, created_at, store_settings(store_name, slug)")
            .eq("id", auth.session.adminId)
            .maybeSingle();

        if (error) {
            console.error("[GET /api/contratar/status]", error.message);
            return await comCookieAtualizado({
                email:  auth.session.email,
                status: auth.session.status,
                storeName: null,
                slug: null,
                reason: null,
            }, auth.session);
        }

        // store_settings vem como array no embed do PostgREST (1-para-1 pelo
        // UNIQUE(admin_id), mas o formato é o de coleção).
        const loja = Array.isArray(data?.store_settings) ? data?.store_settings[0] : data?.store_settings;

        return await comCookieAtualizado({
            email:     data?.email ?? auth.session.email,
            status:    auth.session.status,
            reason:    data?.status_reason ?? null,
            changedAt: data?.status_changed_at ?? null,
            createdAt: data?.created_at ?? null,
            storeName: loja?.store_name ?? null,
            slug:      loja?.slug ?? null,
        }, auth.session);
    } catch (e) {
        return handleRouteError(e, "GET /api/contratar/status");
    }
}
