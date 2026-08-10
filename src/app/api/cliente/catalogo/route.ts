import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireClient, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/cliente/catalogo — produtos ativos da loja do cliente autenticado.
 *
 * A loja vem do adminId gravado na sessão assinada, não de query string: o
 * cliente não escolhe de qual loja quer ver o catálogo.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const { data, error } = await getSupabaseAdmin()
            .from("products")
            .select("id, name, description, category, subcategory, unit, price, active")
            .eq("admin_id", auth.session.adminId)
            .eq("active", true)
            .order("category", { ascending: true })
            .order("name", { ascending: true });

        if (error) {
            console.error("[GET /api/cliente/catalogo]", error.message);
            return jsonError("Erro ao carregar produtos.", 500);
        }

        return NextResponse.json({ products: data ?? [] });
    } catch (e) {
        return handleRouteError(e, "GET /api/cliente/catalogo");
    }
}
