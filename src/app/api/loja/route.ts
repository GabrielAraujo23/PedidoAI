import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError, handleRouteError } from "@/lib/api-auth";

/** GET /api/loja — configurações da loja autenticada (null se ainda não existir). */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .select("*")
            .eq("admin_id", auth.session.adminId)
            .maybeSingle();

        if (error) {
            console.error("[GET /api/loja]", error.message);
            return jsonError("Erro ao carregar configurações.", 500);
        }

        return NextResponse.json({ settings: data ?? null });
    } catch (e) {
        return handleRouteError(e, "GET /api/loja");
    }
}

/**
 * PUT /api/loja — grava as configurações da loja autenticada.
 *
 * Faz upsert pelo admin_id em vez de aceitar um id vindo do navegador: o
 * caminho antigo mandava `.eq("id", settingId)` com um id guardado em estado
 * de tela, o que permitiria sobrescrever a configuração de outra loja se esse
 * valor fosse trocado. Aqui o tenant é sempre o do cookie.
 */
export async function PUT(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        // admin_id, id e created_at nunca vêm do corpo.
        const { admin_id: _a, id: _i, created_at: _c, ...fields } = parsed.body;
        void _a; void _i; void _c;

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .upsert(
                { ...fields, admin_id: auth.session.adminId, updated_at: new Date().toISOString() },
                { onConflict: "admin_id" }
            )
            .select("*")
            .single();

        if (error) {
            console.error("[PUT /api/loja]", error.message);
            const detail = error.code === "42P01"
                ? "Tabela não encontrada. Execute a migration 005 no Supabase."
                : "Erro ao salvar configurações.";
            return jsonError(detail, 500);
        }

        return NextResponse.json({ settings: data });
    } catch (e) {
        return handleRouteError(e, "PUT /api/loja");
    }
}
