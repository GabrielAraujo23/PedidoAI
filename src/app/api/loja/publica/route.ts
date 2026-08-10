import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { handleRouteError } from "@/lib/api-auth";

/**
 * GET /api/loja/publica?admin=<uuid> — dados de entrega da loja, sem sessão.
 *
 * A tela de login precisa disto antes de existir sessão, para estimar frete
 * durante o cadastro. Devolve só o necessário para o cálculo: coordenadas,
 * raio e taxa por km. Nada de CNPJ, telefone, e-mail ou faturamento.
 *
 * Sem `?admin=`, usa a loja mais antiga — mesma convenção do cadastro de
 * cliente. Vale a mesma ressalva: com várias lojas isso vira ambíguo e a
 * solução é o slug por tenant, previsto para a Fase 1.
 */
export async function GET(request: NextRequest) {
    try {
        const adminId = request.nextUrl.searchParams.get("admin")?.trim();
        const db = getSupabaseAdmin();

        let query = db
            .from("store_settings")
            .select("admin_id, store_name, latitude, longitude, delivery_radius_km, delivery_rate_per_km")
            .order("created_at", { ascending: true })
            .limit(1);

        if (adminId) query = query.eq("admin_id", adminId);

        const { data, error } = await query.maybeSingle();

        if (error) {
            console.error("[GET /api/loja/publica]", error.message);
            return NextResponse.json({ store: null });
        }

        return NextResponse.json({ store: data ?? null });
    } catch (e) {
        return handleRouteError(e, "GET /api/loja/publica");
    }
}
