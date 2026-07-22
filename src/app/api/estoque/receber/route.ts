// src/app/api/estoque/receber/route.ts
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

interface ReceiptItem {
    product_id: string | null;
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    barcode: string | null;
    category: string;
}

export async function POST(request: NextRequest) {
    if (!checkOrigin(request)) return err("Forbidden", 403);

    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { items, chave_acesso, supplier_name } = body as {
        items: ReceiptItem[];
        chave_acesso: string | null;
        supplier_name: string | null;
    };

    if (!Array.isArray(items) || items.length === 0) return err("items obrigatório.");

    const movements: object[] = [];
    let totalItems = 0;

    for (const item of items) {
        if (!item.name || item.quantity <= 0) continue;

        let productId = item.product_id;

        if (!productId) {
            const { data: newProduct, error: insertError } = await supabase
                .from("products")
                .insert({
                    name: item.name,
                    category: item.category || "Outros Produtos",
                    unit: item.unit || "por unidade",
                    price: item.unit_price || 0,
                    active: true,
                    stock_quantity: item.quantity,
                    barcode: item.barcode,
                    admin_id: session.adminId,
                })
                .select("id")
                .single();

            if (insertError || !newProduct) continue;
            productId = newProduct.id;
        } else {
            const { data: prod } = await supabase
                .from("products")
                .select("stock_quantity")
                .eq("id", productId)
                .eq("admin_id", session.adminId)
                .single();

            if (!prod) continue;

            await supabase
                .from("products")
                .update({ stock_quantity: prod.stock_quantity + item.quantity })
                .eq("id", productId)
                .eq("admin_id", session.adminId);

            if (item.barcode) {
                await supabase
                    .from("products")
                    .update({ barcode: item.barcode })
                    .eq("id", productId)
                    .eq("admin_id", session.adminId)
                    .is("barcode", null);
            }
        }

        movements.push({
            admin_id: session.adminId,
            product_id: productId,
            product_name: item.name,
            type: "entrada",
            quantity: item.quantity,
            reference: chave_acesso ?? "Recebimento manual",
            notes: null,
        });

        totalItems++;
    }

    if (movements.length > 0) {
        await supabase.from("stock_movements").insert(movements);
    }

    if (chave_acesso) {
        await supabase.from("nfe_imports").insert({
            admin_id: session.adminId,
            chave_acesso,
            supplier_name: supplier_name ?? null,
            total_items: totalItems,
            status: "completed",
        });
    }

    return NextResponse.json({ ok: true, processed: totalItems });
}
