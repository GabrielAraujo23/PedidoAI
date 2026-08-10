import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError } from "@/lib/api-auth";
import { sanitizeProduct, type ProductInput } from "@/lib/product-schema";

/** GET /api/produtos — lista os produtos da loja autenticada. */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    // ?active=1 — usado pelo Atendimento, que só oferece produtos vendáveis.
    let query = getSupabaseAdmin()
        .from("products")
        .select("*")
        .eq("admin_id", auth.session.adminId);
    if (request.nextUrl.searchParams.get("active") === "1") query = query.eq("active", true);

    const { data, error } = await query
        .order("category", { ascending: true })
        .order("name", { ascending: true });

    if (error) {
        console.error("[GET /api/produtos]", error.message);
        return jsonError("Erro ao carregar produtos.", 500);
    }

    return NextResponse.json({ products: data ?? [] });
}

/** POST /api/produtos — cria um produto na loja autenticada. */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const parsed = await readJson<ProductInput>(request);
    if (!parsed.ok) return parsed.response;

    const clean = sanitizeProduct(parsed.body);
    if (!clean.ok) return jsonError(clean.error, 400);

    const { data, error } = await getSupabaseAdmin()
        .from("products")
        .insert({ ...clean.value, admin_id: auth.session.adminId })
        .select("*")
        .single();

    if (error) {
        console.error("[POST /api/produtos]", error.message);
        return jsonError("Erro ao criar produto.", 500);
    }

    return NextResponse.json({ product: data }, { status: 201 });
}
