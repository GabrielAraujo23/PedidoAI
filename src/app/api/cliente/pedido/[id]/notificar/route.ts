import { NextRequest, NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import { notifyOrderStatus } from "@/lib/notify-order";
import { getSupabaseAdmin } from "@/lib/supabase-admin";


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

    const { data: order } = await getSupabaseAdmin()
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .eq("client_id", session.clientId)
        .single();

    if (!order) return NextResponse.json({ ok: true });

    await notifyOrderStatus(orderId, "novo");

    return NextResponse.json({ ok: true });
}
