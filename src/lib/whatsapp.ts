export type NotifiableStatus = "novo" | "confirmado" | "rota" | "entregue" | "cancelado";

export type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro";
export type DeliveryType = "delivery" | "retirada";

export interface MessageItem {
    product_name: string;
    quantity: number;
    unit?: string | null;
    total_price?: number | string | null;
}

export interface MessageContext {
    nome: string;
    orderId: string;
    items?: MessageItem[];
    productsFallback?: string | null;
    address?: string | null;
    paymentMethod?: PaymentMethod | null;
    deliveryType?: DeliveryType | null;
    deliveryFee?: number | null;
    total?: number | null;
    estimateMin?: number | null;
    estimateMax?: number | null;
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
    pix:      "Pix",
    credito:  "Cartão de Crédito",
    debito:   "Cartão de Débito",
    dinheiro: "Dinheiro",
};

const SHORT_TEMPLATES: Record<"rota" | "entregue" | "cancelado", string> = {
    rota:      "🚚 Olá, {nome}! Seu pedido *nº {id}* está a *caminho*! Fique atento à entrega.",
    entregue:  "🎉 Olá, {nome}! Seu pedido *nº {id}* foi *entregue*. Obrigado pela preferência!",
    cancelado: "❌ Olá, {nome}! Seu pedido *nº {id}* foi *cancelado*. Entre em contato se precisar de ajuda.",
};

const RICH_HEADER: Record<"novo" | "confirmado", string> = {
    novo:       "🔔 Olá, {nome}! Recebemos o seu pedido e já estamos preparando tudo.",
    confirmado: "✅ Olá, {nome}! Seu pedido foi *confirmado* e já entrou em produção.",
};

export function isNotifiableStatus(status: string): status is NotifiableStatus {
    return status === "novo" || status === "confirmado" || status === "rota"
        || status === "entregue" || status === "cancelado";
}

function formatOrderId(id: string): string {
    return id.padStart(4, "0");
}

function formatBRL(value: number): string {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function buildItemsBlock(ctx: MessageContext): string | null {
    if (ctx.items && ctx.items.length > 0) {
        const lines = ctx.items.map((i) => {
            const unit = i.unit ? ` (${i.unit})` : "";
            return "➡ ```" + `${i.quantity}x ${i.product_name}${unit}` + "```";
        });
        return `*Itens:*\n${lines.join("\n")}`;
    }
    if (ctx.productsFallback?.trim()) {
        return "*Itens:*\n➡ ```" + ctx.productsFallback.trim() + "```";
    }
    return null;
}

function buildRichMessage(status: "novo" | "confirmado", ctx: MessageContext): string {
    const blocks: string[] = [];

    blocks.push(RICH_HEADER[status].replace("{nome}", ctx.nome));
    blocks.push(`Pedido *nº ${formatOrderId(ctx.orderId)}*`);

    const items = buildItemsBlock(ctx);
    if (items) blocks.push(items);

    if (ctx.paymentMethod) {
        blocks.push(`💳 *${PAYMENT_LABEL[ctx.paymentMethod]}*`);
    }

    const deliveryLines: string[] = [];
    if (ctx.deliveryType === "retirada") {
        deliveryLines.push("🏪 *Retirada na loja*");
    } else if (ctx.deliveryType === "delivery") {
        const fee = ctx.deliveryFee != null && ctx.deliveryFee > 0
            ? ` (taxa de: *${formatBRL(ctx.deliveryFee)}*)`
            : "";
        deliveryLines.push(`🛵 *Delivery*${fee}`);
    }
    if (ctx.address?.trim()) {
        deliveryLines.push(`🏠 ${ctx.address.trim()}`);
    }
    if (ctx.estimateMin != null && ctx.estimateMax != null) {
        deliveryLines.push(`(Estimativa: *entre ${ctx.estimateMin}~${ctx.estimateMax} minutos*)`);
    }
    if (deliveryLines.length > 0) blocks.push(deliveryLines.join("\n"));

    if (ctx.total != null && ctx.total > 0) {
        blocks.push(`Total: *${formatBRL(ctx.total)}*`);
    }

    blocks.push("Obrigado pela preferência, se precisar de algo é só chamar! 😉");

    return blocks.join("\n\n");
}

export function buildMessage(status: NotifiableStatus, ctx: MessageContext): string {
    if (status === "novo" || status === "confirmado") {
        return buildRichMessage(status, ctx);
    }
    return SHORT_TEMPLATES[status]
        .replace("{nome}", ctx.nome)
        .replace("{id}", formatOrderId(ctx.orderId));
}

export function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function sendWhatsApp(phone: string, message: string): Promise<void> {
    const instanceId  = process.env.ZAPI_INSTANCE_ID;
    const token       = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN; // opcional

    if (!instanceId || !token) {
        console.warn("[whatsapp] ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurado.");
        return;
    }

    const formatted = formatPhone(phone);
    if (!formatted) {
        console.warn("[whatsapp] Número de telefone inválido, mensagem não enviada.");
        return;
    }

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    try {
        const res = await fetch(url, {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                ...(clientToken ? { "Client-Token": clientToken } : {}),
            },
            body:    JSON.stringify({ phone: formatted, message }),
            signal:  controller.signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`[whatsapp] Z-API erro ${res.status}: ${text}`);
        }
    } catch (err) {
        console.error("[whatsapp] Falha/timeout ao enviar WhatsApp:", err);
    } finally {
        clearTimeout(timer);
    }
}
