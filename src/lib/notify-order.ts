import { createClient } from "@supabase/supabase-js";
import {
    sendWhatsApp, buildMessage,
    type NotifiableStatus, type MessageContext, type PaymentMethod, type DeliveryType,
} from "@/lib/whatsapp";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

interface OrderRow {
    client_id: string | null;
    products: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    delivery_fee: number | string | null;
    payment_method: string | null;
    delivery_type: string | null;
    admin_id: string | null;
}

function buildAddress(order: OrderRow, clientAddress: string | null): string | null {
    const line = [
        [order.street, order.number ? `Nº ${order.number}` : null].filter(Boolean).join(", "),
        order.complement,
        order.neighborhood,
        [order.city, order.state].filter(Boolean).join(" - "),
    ].filter((p) => p && String(p).trim()).join(", ");

    return line.trim() || clientAddress?.trim() || null;
}

/**
 * Monta o contexto do pedido a partir do banco e dispara a mensagem.
 * Nunca lança — falhas são registradas e engolidas (fire-and-forget).
 */
export async function notifyOrderStatus(orderId: string, status: NotifiableStatus): Promise<void> {
    try {
        const { data: order } = await supabase
            .from("orders")
            .select("client_id, products, street, number, complement, neighborhood, city, state, delivery_fee, payment_method, delivery_type, admin_id")
            .eq("id", orderId)
            .single<OrderRow>();

        if (!order?.client_id) return;

        const { data: client } = await supabase
            .from("clients")
            .select("name, phone, address")
            .eq("id", order.client_id)
            .single();

        if (!client?.phone) return;

        const ctx: MessageContext = { nome: client.name, orderId };

        if (status === "novo" || status === "confirmado") {
            const [itemsRes, settingsRes] = await Promise.all([
                supabase
                    .from("order_items")
                    .select("product_name, quantity, unit, total_price")
                    .eq("order_id", orderId),
                order.admin_id
                    ? supabase
                        .from("store_settings")
                        .select("delivery_time_min, delivery_time_max")
                        .eq("admin_id", order.admin_id)
                        .maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);

            const items = itemsRes.data ?? [];
            const itemsTotal = items.reduce((sum, i) => sum + (Number(i.total_price) || 0), 0);
            const fee = Number(order.delivery_fee) || 0;

            ctx.items = items;
            ctx.productsFallback = order.products;
            ctx.address = order.delivery_type === "retirada" ? null : buildAddress(order, client.address);
            ctx.paymentMethod = (order.payment_method as PaymentMethod) ?? null;
            ctx.deliveryType = (order.delivery_type as DeliveryType) ?? null;
            ctx.deliveryFee = fee;
            ctx.total = itemsTotal + fee;

            const settings = settingsRes.data as { delivery_time_min: number | null; delivery_time_max: number | null } | null;
            ctx.estimateMin = settings?.delivery_time_min ?? null;
            ctx.estimateMax = settings?.delivery_time_max ?? null;
        }

        await sendWhatsApp(client.phone, buildMessage(status, ctx));
    } catch (e) {
        console.error("[notify-order] falha ao notificar", orderId, status, e);
    }
}
