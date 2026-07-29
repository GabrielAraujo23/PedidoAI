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
    console.log("[notify] request received");

    if (!checkOrigin(request)) {
        console.log("[notify] BLOCKED: checkOrigin failed, origin:", request.headers.get("origin"), "host:", request.headers.get("host"));
        return err("Forbidden", 403);
    }

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) {
        console.log("[notify] BLOCKED: no session cookie");
        return err("Nao autenticado.", 401);
    }

    const session = await verifySession(cookie);
    if (!session) {
        console.log("[notify] BLOCKED: invalid session");
        return err("Sessao invalida.", 401);
    }

    console.log("[notify] auth ok, adminId:", session.adminId);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON invalido."); }

    const { status } = body as { status: unknown };
    console.log("[notify] status received:", status);

    if (typeof status !== "string" || !isNotifiableStatus(status)) {
        console.log("[notify] status not notifiable, skipping");
        return NextResponse.json({ ok: true });
    }

    const { id: orderId } = await params;
    console.log("[notify] orderId:", orderId);

    const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, client_id, admin_id")
        .eq("id", orderId)
        .eq("admin_id", session.adminId)
        .single();

    console.log("[notify] order lookup — found:", !!order, "admin_id in order:", (order as { admin_id?: string } | null)?.admin_id, "error:", orderErr?.message);

    if (!order) return NextResponse.json({ ok: true });

    const { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("name, phone")
        .eq("id", order.client_id)
        .single();

    console.log("[notify] client lookup — found:", !!client, "phone:", client?.phone, "error:", clientErr?.message);

    if (!client?.phone) return NextResponse.json({ ok: true });

    const message = buildMessage(status as NotifiableStatus, client.name, orderId);
    console.log("[notify] sending WhatsApp to:", client.phone);

    sendWhatsApp(client.phone, message).catch((e) =>
        console.error("[notify] sendWhatsApp threw:", e)
    );

    return NextResponse.json({ ok: true });
}
