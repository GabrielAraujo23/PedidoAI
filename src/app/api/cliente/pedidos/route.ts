import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireClient, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/cliente/pedidos — pedidos do cliente autenticado.
 *
 * `?withItems=1` inclui os itens de cada pedido, usado pelo perfil para
 * montar o "repetir pedido" sem uma chamada por pedido.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const { clientId, adminId } = auth.session;
        const db = getSupabaseAdmin();

        const { data: orders, error } = await db
            .from("orders")
            .select("*")
            .eq("client_id", clientId)
            .eq("admin_id", adminId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[GET /api/cliente/pedidos]", error.message);
            return jsonError("Erro ao carregar pedidos.", 500);
        }

        const list = orders ?? [];

        if (request.nextUrl.searchParams.get("withItems") !== "1" || list.length === 0) {
            return NextResponse.json({ orders: list, items: [] });
        }

        // Itens de todos os pedidos numa consulta só. O escopo já está garantido
        // porque os order_id vêm de pedidos que acabamos de filtrar pelo cliente.
        const { data: items, error: itemsErr } = await db
            .from("order_items")
            .select("*")
            .in("order_id", list.map((o) => o.id));

        if (itemsErr) {
            console.error("[GET /api/cliente/pedidos items]", itemsErr.message);
            return jsonError("Erro ao carregar itens.", 500);
        }

        return NextResponse.json({ orders: list, items: items ?? [] });
    } catch (e) {
        return handleRouteError(e, "GET /api/cliente/pedidos");
    }
}
