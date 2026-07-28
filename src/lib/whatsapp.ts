export type NotifiableStatus = "confirmado" | "rota" | "entregue" | "cancelado";

const TEMPLATES: Record<NotifiableStatus, string> = {
    confirmado: "✅ Olá, {nome}! Seu pedido #{id} foi *confirmado*. Em breve será enviado para entrega.",
    rota:       "🚚 Olá, {nome}! Seu pedido #{id} está a *caminho*! Fique atento à entrega.",
    entregue:   "🎉 Olá, {nome}! Seu pedido #{id} foi *entregue*. Obrigado pela preferência!",
    cancelado:  "❌ Olá, {nome}! Seu pedido #{id} foi *cancelado*. Entre em contato para mais informações.",
};

export function isNotifiableStatus(status: string): status is NotifiableStatus {
    return status in TEMPLATES;
}

export function buildMessage(status: NotifiableStatus, nome: string, id: string): string {
    return TEMPLATES[status]
        .replace("{nome}", nome)
        .replace("{id}", id.padStart(4, "0"));
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
