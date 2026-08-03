import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import { notifyOrderStatus } from "@/lib/notify-order";

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

    await notifyOrderStatus(orderId, "novo");

    return NextResponse.json({ ok: true });
}
