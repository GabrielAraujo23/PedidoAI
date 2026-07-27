import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status: number) {
    return NextResponse.json({ error: msg }, { status });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!checkOrigin(request)) return err("Forbidden", 403);

    const ip = getClientIP(request);
    const rl = rateLimit(`cancelar_pedido:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) return err("Muitas tentativas. Tente novamente em breve.", 429);

    const cookie = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifyClientSession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    const { id } = await params;

    // Fetch order to verify ownership and current status
    const { data: orderRow, error: fetchErr } = await supabase
        .from("orders")
        .select("id, status")
        .eq("id", id)
        .eq("client_id", session.clientId)
        .single();

    if (fetchErr || !orderRow) return err("Pedido não encontrado.", 404);

    if (orderRow.status !== "novo") {
        return err("Pedido não pode ser cancelado neste status.", 409);
    }

    // Race-safe UPDATE: triple condition guards against concurrent requests
    const { data: updated, error: updateErr } = await supabase
        .from("orders")
        .update({ status: "cancelado" })
        .eq("id", id)
        .eq("client_id", session.clientId)
        .eq("status", "novo")
        .select("id");

    if (updateErr) {
        console.error("[cancelar] update error:", updateErr.message);
        return err("Erro ao cancelar pedido.", 500);
    }

    if (!updated || updated.length === 0) {
        return err("Pedido não pode ser cancelado neste status.", 409);
    }

    return NextResponse.json({ ok: true });
}
