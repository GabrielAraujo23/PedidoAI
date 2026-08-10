import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/clientes/[id]/pedidos — histórico de pedidos de um cliente.
 *
 * Filtra por admin_id além do client_id: sem isso, bastaria conhecer o id de um
 * cliente de outra loja para ler os pedidos dele.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { id } = await params;

        const { data, error } = await getSupabaseAdmin()
            .from("orders")
            .select("*")
            .eq("client_id", id)
            .eq("admin_id", auth.session.adminId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[GET /api/clientes/:id/pedidos]", error.message);
            return jsonError("Erro ao carregar histórico.", 500);
        }

        return NextResponse.json({ orders: data ?? [] });
    } catch (e) {
        return handleRouteError(e, "GET /api/clientes/:id/pedidos");
    }
}
