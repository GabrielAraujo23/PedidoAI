import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, verifySession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import type { Status } from "@/lib/types";
import { isNotifiableStatus, type NotifiableStatus } from "@/lib/whatsapp";
import { notifyOrderStatus } from "@/lib/notify-order";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

const VALID_STATUSES: Status[] = ["novo", "confirmado", "rota", "entregue", "cancelado"];
const VALID_PAYMENTS = ["pix", "credito", "debito", "dinheiro"];
const VALID_DELIVERY_TYPES = ["delivery", "retirada"];

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!checkOrigin(request)) return err("Forbidden", 403);

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { status, position, payment_method, delivery_type, delivery_fee } = body as {
        status: unknown;
        position?: unknown;
        payment_method?: unknown;
        delivery_type?: unknown;
        delivery_fee?: unknown;
    };

    if (!VALID_STATUSES.includes(status as Status)) {
        return err("Status inválido.");
    }
    if (position !== undefined && (typeof position !== "number" || !Number.isFinite(position))) {
        return err("Posição inválida.");
    }
    if (payment_method !== undefined && !VALID_PAYMENTS.includes(payment_method as string)) {
        return err("Forma de pagamento inválida.");
    }
    if (delivery_type !== undefined && !VALID_DELIVERY_TYPES.includes(delivery_type as string)) {
        return err("Tipo de entrega inválido.");
    }
    if (delivery_fee !== undefined && (typeof delivery_fee !== "number" || !Number.isFinite(delivery_fee) || delivery_fee < 0)) {
        return err("Taxa de entrega inválida.");
    }

    const { id: orderId } = await params;

    const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, status, admin_id, client_id")
        .eq("id", orderId)
        .eq("admin_id", session.adminId)
        .single();

    if (orderErr || !order) return err("Pedido não encontrado.", 404);

    const patch: Record<string, unknown> = { status };
    if (position !== undefined)       patch.position       = position;
    if (payment_method !== undefined) patch.payment_method = payment_method;
    if (delivery_type !== undefined)  patch.delivery_type  = delivery_type;
    if (delivery_fee !== undefined)   patch.delivery_fee   = delivery_fee;

    const { error: updateError } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", orderId)
        .eq("admin_id", session.adminId);

    if (updateError) {
        console.error("[status] update error:", updateError.message);
        return err("Erro ao atualizar status.", 500);
    }

    if (status === "entregue" && order.status !== "entregue") {
        const { data: orderItems } = await supabase
            .from("order_items")
            .select("product_id, product_name, quantity")
            .eq("order_id", orderId);

        if (orderItems && orderItems.length > 0) {
            const stockMovements: object[] = [];

            for (const item of orderItems) {
                if (!item.product_id) continue;

                const { data: prod } = await supabase
                    .from("products")
                    .select("stock_quantity")
                    .eq("id", item.product_id)
                    .eq("admin_id", session.adminId)
                    .single();

                if (prod) {
                    const debited = Math.min(prod.stock_quantity, Number(item.quantity));
                    await supabase
                        .from("products")
                        .update({ stock_quantity: prod.stock_quantity - debited })
                        .eq("id", item.product_id)
                        .eq("admin_id", session.adminId);

                    stockMovements.push({
                        admin_id: session.adminId,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        type: "saida",
                        quantity: -debited,
                        reference: `Pedido #${String(orderId).padStart(4, "0")}`,
                        notes: null,
                    });
                }
            }

            if (stockMovements.length > 0) {
                await supabase.from("stock_movements").insert(stockMovements);
            }
        }
    }

    // Notificação WhatsApp (fire-and-forget) — apenas quando o status realmente mudou
    if (order.status !== status && isNotifiableStatus(status as string)) {
        void notifyOrderStatus(orderId, status as NotifiableStatus).catch(() => {});
    }

    return NextResponse.json({ ok: true, status });
}
