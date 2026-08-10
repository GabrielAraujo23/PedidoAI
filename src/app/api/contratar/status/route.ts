import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/contratar/status — o estado do próprio pedido de contratação.
 *
 * Usa requireAdminSession() e NÃO requireAdmin(): quem consulta esta rota é,
 * por definição, quem ainda não está ativa. Com o guarda padrão ela
 * responderia 403 para exatamente o público a que serve.
 */
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
            return NextResponse.json({
                email:  auth.session.email,
                status: auth.session.status,
                storeName: null,
                slug: null,
                reason: null,
            });
        }

        // store_settings vem como array no embed do PostgREST (1-para-1 pelo
        // UNIQUE(admin_id), mas o formato é o de coleção).
        const loja = Array.isArray(data?.store_settings) ? data?.store_settings[0] : data?.store_settings;

        return NextResponse.json({
            email:     data?.email ?? auth.session.email,
            status:    auth.session.status,
            reason:    data?.status_reason ?? null,
            changedAt: data?.status_changed_at ?? null,
            createdAt: data?.created_at ?? null,
            storeName: loja?.store_name ?? null,
            slug:      loja?.slug ?? null,
        });
    } catch (e) {
        return handleRouteError(e, "GET /api/contratar/status");
    }
}
