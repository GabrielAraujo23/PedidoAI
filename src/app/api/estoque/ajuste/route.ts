// src/app/api/estoque/ajuste/route.ts
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

export async function POST(request: NextRequest) {
    if (!checkOrigin(request)) return err("Forbidden", 403);

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { product_id, quantity, mode, notes } = body as Record<string, unknown>;

    if (typeof product_id !== "string" || !product_id) return err("product_id obrigatório.");
    if (typeof quantity !== "number" || quantity < 0) return err("quantity deve ser número >= 0.");
    if (mode !== "set" && mode !== "add" && mode !== "remove") return err("mode deve ser 'set', 'add' ou 'remove'.");
    if (!notes || typeof notes !== "string" || notes.trim().length < 3) return err("notes obrigatório (mín. 3 caracteres).");

    const { data: product, error: fetchErr } = await supabase
        .from("products")
        .select("id, name, stock_quantity, admin_id")
        .eq("id", product_id)
        .eq("admin_id", session.adminId)
        .single();

    if (fetchErr || !product) return err("Produto não encontrado.", 404);

    let newQty: number;
    let movementQty: number;

    if (mode === "set") {
        newQty = Math.max(0, quantity as number);
        movementQty = newQty - product.stock_quantity;
    } else if (mode === "add") {
        newQty = product.stock_quantity + (quantity as number);
        movementQty = quantity as number;
    } else {
        newQty = Math.max(0, product.stock_quantity - (quantity as number));
        movementQty = -(product.stock_quantity - newQty);
    }

    const { error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newQty })
        .eq("id", product_id)
        .eq("admin_id", session.adminId);

    if (updateError) return err("Erro ao atualizar estoque.", 500);

    await supabase.from("stock_movements").insert({
        admin_id: session.adminId,
        product_id,
        product_name: product.name,
        type: "ajuste",
        quantity: movementQty,
        reference: "Ajuste manual",
        notes: notes.trim(),
    });

    return NextResponse.json({ ok: true, stock_quantity: newQty });
}
