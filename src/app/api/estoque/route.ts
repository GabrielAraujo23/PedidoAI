import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/estoque — leituras da tela de estoque.
 *
 * `?view=produtos` devolve os produtos ativos.
 * `?view=movimentacoes&page=N` devolve uma página do histórico com o total,
 * para a paginação do lado do cliente.
 * `?view=todos-produtos` devolve todos os produtos (ativos e inativos), usado
 * pela tela de recebimento de NF-e para casar itens por código de barras.
 */
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { adminId } = auth.session;
        const db = getSupabaseAdmin();
        const view = request.nextUrl.searchParams.get("view") ?? "produtos";

        if (view === "movimentacoes") {
            const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "0");
            const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
            const from = page * PAGE_SIZE;

            const { data, count, error } = await db
                .from("stock_movements")
                .select("*", { count: "exact" })
                .eq("admin_id", adminId)
                .order("created_at", { ascending: false })
                .range(from, from + PAGE_SIZE - 1);

            if (error) {
                console.error("[GET /api/estoque movimentacoes]", error.message);
                return jsonError("Erro ao carregar movimentações.", 500);
            }
            return NextResponse.json({ movements: data ?? [], total: count ?? 0 });
        }

        let query = db.from("products").select("*").eq("admin_id", adminId);
        if (view !== "todos-produtos") query = query.eq("active", true);

        const { data, error } = await query.order("name");

        if (error) {
            console.error("[GET /api/estoque produtos]", error.message);
            return jsonError("Erro ao carregar produtos.", 500);
        }
        return NextResponse.json({ products: data ?? [] });
    } catch (e) {
        return handleRouteError(e, "GET /api/estoque");
    }
}
