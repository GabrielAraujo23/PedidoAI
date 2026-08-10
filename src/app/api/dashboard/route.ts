import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/dashboard — números da tela inicial em uma única chamada.
 *
 * A tela fazia três consultas ao banco direto do navegador (pedidos, clientes
 * e pedidos dos últimos 7 dias). Agrupar aqui evita três idas à rede e garante
 * que as três usem exatamente o mesmo tenant.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { adminId } = auth.session;
        const db = getSupabaseAdmin();

        // Janela de 7 dias terminando hoje, em UTC — igual ao gráfico da tela.
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 6);
        since.setUTCHours(0, 0, 0, 0);

        const [ordersRes, clientsRes, weekRes] = await Promise.all([
            db.from("orders").select("id, client, products, status").eq("admin_id", adminId),
            db.from("clients").select("id", { count: "exact", head: true }).eq("admin_id", adminId),
            db.from("orders").select("created_at").eq("admin_id", adminId).gte("created_at", since.toISOString()),
        ]);

        if (ordersRes.error || weekRes.error) {
            console.error("[GET /api/dashboard]", ordersRes.error?.message ?? weekRes.error?.message);
            return jsonError("Erro ao carregar o painel.", 500);
        }

        return NextResponse.json({
            orders:       ordersRes.data ?? [],
            clientsCount: clientsRes.count ?? 0,
            weekOrders:   weekRes.data ?? [],
        });
    } catch (e) {
        return handleRouteError(e, "GET /api/dashboard");
    }
}
