import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, verifySession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import { sendWhatsApp, buildMessage, isNotifiableStatus, NotifiableStatus } from "@/lib/whatsapp";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

export async function POST(
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

    // Status não notificável (ex: "novo") — retorna ok sem fazer nada
    if (typeof status !== "string" || !isNotifiableStatus(status)) {
        return NextResponse.json({ ok: true });
    }

    const { id: orderId } = await params;

    const { data: order } = await supabase
        .from("orders")
        .select("id, client_id")
        .eq("id", orderId)
        .eq("admin_id", session.adminId)
        .single();

    if (!order) return NextResponse.json({ ok: true });

    const { data: client } = await supabase
        .from("clients")
        .select("name, phone")
        .eq("id", order.client_id)
        .eq("admin_id", session.adminId)
        .single();

    if (!client?.phone) return NextResponse.json({ ok: true });

    const message = buildMessage(status as NotifiableStatus, client.name, orderId);

    // Fire-and-forget: resposta volta antes do envio concluir
    sendWhatsApp(client.phone, message).catch((e) =>
        console.error("[notify] sendWhatsApp threw:", e)
    );

    return NextResponse.json({ ok: true });
}
