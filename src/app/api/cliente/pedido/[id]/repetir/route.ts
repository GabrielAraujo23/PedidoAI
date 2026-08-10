import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireClient, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/cliente/pedido/[id]/repetir — itens de um pedido anterior que ainda
 * podem ser comprados.
 *
 * Cruza os itens com o catálogo atual da loja e devolve dois grupos: `items`
 * (produto ainda ativo, com nome, unidade e preço de hoje) e `skipped` (saiu do
 * catálogo ou foi desativado). O preço vem do produto atual, não do pedido
 * antigo — repetir um pedido de meses atrás não deve congelar o preço de então.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const { clientId, adminId } = auth.session;
        const { id } = await params;
        const db = getSupabaseAdmin();

        // Confirma que o pedido é deste cliente antes de ler qualquer item.
        const { data: order } = await db
            .from("orders")
            .select("id")
            .eq("id", id)
            .eq("client_id", clientId)
            .maybeSingle();

        if (!order) return jsonError("Pedido não encontrado.", 404);

        const { data: orderItems, error: itemsErr } = await db
            .from("order_items")
            .select("product_id, product_name, quantity")
            .eq("order_id", id);

        if (itemsErr) {
            console.error("[GET repetir] items:", itemsErr.message);
            return jsonError("Erro ao carregar itens do pedido.", 500);
        }
        if (!orderItems?.length) {
            return jsonError("Este pedido não tem itens registrados.", 404);
        }

        const { data: products, error: prodErr } = await db
            .from("products")
            .select("id, name, unit, price")
            .in("id", orderItems.map((i) => i.product_id))
            .eq("active", true)
            .eq("admin_id", adminId);

        if (prodErr) {
            console.error("[GET repetir] products:", prodErr.message);
            return jsonError("Erro ao verificar produtos disponíveis.", 500);
        }

        const available = new Map((products ?? []).map((p) => [p.id, p]));

        const items = orderItems
            .filter((i) => available.has(i.product_id))
            .map((i) => {
                const p = available.get(i.product_id)!;
                return {
                    product_id: p.id,
                    name:       p.name,
                    unit:       p.unit,
                    price:      p.price,
                    quantity:   i.quantity as number,
                };
            });

        const skipped = orderItems
            .filter((i) => !available.has(i.product_id))
            .map((i) => i.product_name as string);

        return NextResponse.json({ items, skipped });
    } catch (e) {
        return handleRouteError(e, "GET /api/cliente/pedido/:id/repetir");
    }
}
