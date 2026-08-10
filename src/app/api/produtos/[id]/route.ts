import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError } from "@/lib/api-auth";
import { sanitizeProduct } from "@/lib/product-schema";

/**
 * PATCH /api/produtos/[id] — edita um produto, ou alterna só o campo `active`
 * quando o corpo traz apenas `{ active }`.
 *
 * Todo filtro carrega admin_id junto do id: antes o update ia por `.eq("id")`
 * sozinho, o que deixava um lojista alterar o produto de outro se soubesse o
 * UUID.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const parsed = await readJson<Record<string, unknown>>(request);
    if (!parsed.ok) return parsed.response;

    const keys = Object.keys(parsed.body);
    const isToggleOnly = keys.length === 1 && keys[0] === "active";

    let patch: Record<string, unknown>;
    if (isToggleOnly) {
        if (typeof parsed.body.active !== "boolean") {
            return jsonError("Campo 'active' deve ser booleano.", 400);
        }
        patch = { active: parsed.body.active };
    } else {
        const clean = sanitizeProduct(parsed.body);
        if (!clean.ok) return jsonError(clean.error, 400);
        patch = clean.value;
    }

    const { data, error } = await getSupabaseAdmin()
        .from("products")
        .update(patch)
        .eq("id", id)
        .eq("admin_id", auth.session.adminId)
        .select("*");

    if (error) {
        console.error("[PATCH /api/produtos/:id]", error.message);
        return jsonError("Erro ao salvar produto.", 500);
    }
    if (!data || data.length === 0) {
        return jsonError("Produto não encontrado.", 404);
    }

    return NextResponse.json({ product: data[0] });
}

/** DELETE /api/produtos/[id] — remove um produto da loja autenticada. */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const { data, error } = await getSupabaseAdmin()
        .from("products")
        .delete()
        .eq("id", id)
        .eq("admin_id", auth.session.adminId)
        .select("id");

    if (error) {
        console.error("[DELETE /api/produtos/:id]", error.message);
        return jsonError("Erro ao excluir produto.", 500);
    }
    if (!data || data.length === 0) {
        return jsonError("Produto não encontrado.", 404);
    }

    return NextResponse.json({ ok: true });
}
