import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireClient, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/cliente/pedido/[id] — um pedido do cliente autenticado, com itens
 * e os dados do próprio cliente (o recibo imprime nome, telefone e endereço).
 *
 * O pedido é buscado por id + client_id: pedir o id de outra pessoa devolve
 * 404, não os dados dela.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const { clientId } = auth.session;
        const { id } = await params;
        const db = getSupabaseAdmin();

        const { data: order, error } = await db
            .from("orders")
            .select("*")
            .eq("id", id)
            .eq("client_id", clientId)
            .maybeSingle();

        if (error) {
            console.error("[GET /api/cliente/pedido/:id]", error.message);
            return jsonError("Erro ao carregar pedido.", 500);
        }
        if (!order) return jsonError("Pedido não encontrado.", 404);

        const [itemsRes, clientRes] = await Promise.all([
            db.from("order_items").select("*").eq("order_id", id),
            db.from("clients").select("name, phone, address").eq("id", clientId).maybeSingle(),
        ]);

        return NextResponse.json({
            order,
            items:  itemsRes.data ?? [],
            client: clientRes.data ?? null,
        });
    } catch (e) {
        return handleRouteError(e, "GET /api/cliente/pedido/:id");
    }
}
