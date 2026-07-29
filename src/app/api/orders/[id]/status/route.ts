import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, verifySession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import type { Status } from "@/lib/types";
import { isNotifiableStatus, buildMessage, sendWhatsApp, NotifiableStatus } from "@/lib/whatsapp";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

const VALID_STATUSES: Status[] = ["novo", "confirmado", "rota", "entregue"];

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

    const { status } = body as { status: unknown };
    if (!VALID_STATUSES.includes(status as Status)) {
        return err("Status inválido.");
    }

    const { id: orderId } = await params;

    const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, status, admin_id, client_id")
        .eq("id", orderId)
        .eq("admin_id", session.adminId)
        .single();

    if (orderErr || !order) return err("Pedido não encontrado.", 404);

    const { error: updateError } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId)
        .eq("admin_id", session.adminId);

    if (updateError) return err("Erro ao atualizar status.", 500);

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

    // Notificação WhatsApp (fire-and-forget)
    if (isNotifiableStatus(status as string)) {
        void (async () => {
            const { data: client } = await supabase
                .from("clients")
                .select("name, phone")
                .eq("id", order.client_id)
                .single();
            if (client?.phone) {
                const message = buildMessage(status as NotifiableStatus, client.name, orderId);
                try {
                    await sendWhatsApp(client.phone, message);
                } catch (e) {
                    console.error("[status] sendWhatsApp threw:", e);
                }
            }
        })().catch(() => {});
    }

    return NextResponse.json({ ok: true, status });
}
