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
    const itemErrors: string[] = [];
    let totalItems = 0;

    for (const item of items) {
        const qty = Number(item.quantity);
        if (!item.name || !(qty > 0)) {
            itemErrors.push(`Item ignorado (nome/qty inválido): ${item.name}`);
            continue;
        }

        let productId = item.product_id;

        if (!productId) {
            // Create new product
            const { data: newProduct, error: insertError } = await supabase
                .from("products")
                .insert({
                    name: item.name,
                    category: item.category || "Outros Produtos",
                    unit: item.unit || "por unidade",
                    price: item.unit_price || 0,
                    active: true,
                    stock_quantity: qty,
                    barcode: item.barcode || null,
                    admin_id: session.adminId,
                })
                .select("id")
                .single();

            if (insertError || !newProduct) {
                const msg = `Erro ao criar "${item.name}": ${insertError?.message ?? "sem retorno"}`;
                console.error("[receber]", msg);
                itemErrors.push(msg);
                continue;
            }
            productId = newProduct.id;
        } else {
            // Increment existing product stock
            const { data: prod, error: selectError } = await supabase
                .from("products")
                .select("stock_quantity")
                .eq("id", productId)
                .eq("admin_id", session.adminId)
                .single();

            if (selectError || !prod) {
                const msg = `Produto "${item.name}" não encontrado ou sem acesso: ${selectError?.message ?? "sem retorno"}`;
                console.error("[receber]", msg);
                itemErrors.push(msg);
                continue;
            }

            const { error: updateError } = await supabase
                .from("products")
                .update({ stock_quantity: prod.stock_quantity + qty })
                .eq("id", productId)
                .eq("admin_id", session.adminId);

            if (updateError) {
                const msg = `Erro ao atualizar estoque de "${item.name}": ${updateError.message}`;
                console.error("[receber]", msg);
                itemErrors.push(msg);
                continue;
            }

            // Backfill barcode if product has none
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
            quantity: qty,
            reference: chave_acesso ?? "Recebimento manual",
            notes: null,
        });

        totalItems++;
    }

    if (movements.length > 0) {
        const { error: movError } = await supabase.from("stock_movements").insert(movements);
        if (movError) {
            console.error("[receber] Erro ao inserir movimentos:", movError.message);
            return NextResponse.json(
                { error: `Estoque atualizado, mas falha ao registrar histórico: ${movError.message}`, processed: totalItems },
                { status: 500 }
            );
        }
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

    if (totalItems === 0) {
        return NextResponse.json(
            { error: "Nenhum item foi processado.", details: itemErrors },
            { status: 422 }
        );
    }

    return NextResponse.json({ ok: true, processed: totalItems, skipped: itemErrors.length });
}
