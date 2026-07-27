import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, verifySession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

interface OrderItem {
    product_id: string;
    product_name: string;
    unit: string;
    unit_price: number;
    quantity: number;
}

export async function POST(request: NextRequest) {
    if (!checkOrigin(request)) return err("Forbidden", 403);

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { client_id, client_name, notes, items } = body as {
        client_id: string;
        client_name: string;
        notes: string | null;
        items: OrderItem[];
    };

    if (!client_id?.trim()) return err("client_id obrigatório.");
    if (!client_name?.trim()) return err("client_name obrigatório.");
    if (!Array.isArray(items) || items.length === 0) return err("items obrigatório.");
    for (const item of items) {
        if (!item.product_id || item.quantity < 1) return err(`Item inválido: ${item.product_name}`);
    }

    // Verify client belongs to this admin
    const { data: clientRow, error: clientErr } = await supabase
        .from("clients")
        .select("id")
        .eq("id", client_id)
        .eq("admin_id", session.adminId)
        .single();

    if (clientErr || !clientRow) return err("Cliente não encontrado.", 404);

    // Compute next position for kanban ordering
    const { data: posData } = await supabase
        .from("orders")
        .select("position")
        .eq("admin_id", session.adminId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

    const position = (posData?.position ?? 0) + 1;

    // Build products summary string (displayed in kanban card)
    const productsSummary = items
        .map((i) => `${i.product_name} (x${i.quantity})`)
        .join(", ");

    // Insert order
    const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
            client: client_name,
            client_id,
            products: productsSummary,
            status: "novo",
            position,
            notes: notes || null,
            admin_id: session.adminId,
        })
        .select("id")
        .single();

    if (orderErr || !order) {
        console.error("[atendimento/pedido] insert order:", orderErr?.message);
        return err("Erro ao criar pedido.", 500);
    }

    // Insert order_items — do NOT include total_price (GENERATED column)
    const { error: itemsErr } = await supabase.from("order_items").insert(
        items.map((i) => ({
            order_id: order.id,
            product_id: i.product_id,
            product_name: i.product_name,
            unit: i.unit,
            quantity: i.quantity,
            unit_price: i.unit_price,
        }))
    );

    if (itemsErr) {
        console.error("[atendimento/pedido] insert items:", itemsErr.message);
        // Roll back the orphaned order
        await supabase.from("orders").delete().eq("id", order.id);
        return err("Erro ao inserir itens.", 500);
    }

    return NextResponse.json({ ok: true, order_id: order.id });
}
