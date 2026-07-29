import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import { sendWhatsApp, buildMessage } from "@/lib/whatsapp";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!checkOrigin(request)) return NextResponse.json({ ok: true });

    const cookie = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
    if (!cookie) return NextResponse.json({ ok: true });

    const session = await verifyClientSession(cookie);
    if (!session) return NextResponse.json({ ok: true });

    const { id: orderId } = await params;

    const { data: order } = await supabase
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .eq("client_id", session.clientId)
        .single();

    if (!order) return NextResponse.json({ ok: true });

    const { data: client } = await supabase
        .from("clients")
        .select("name, phone")
        .eq("id", session.clientId)
        .single();

    if (!client?.phone) return NextResponse.json({ ok: true });

    const message = buildMessage("novo", client.name, orderId);

    sendWhatsApp(client.phone, message).catch((e) =>
        console.error("[notificar] sendWhatsApp threw:", e)
    );

    return NextResponse.json({ ok: true });
}
