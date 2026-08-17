import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError, handleRouteError } from "@/lib/api-auth";
import { sanitizarOverrides } from "@/lib/copy/sanitizar";
import { COPY_PADRAO } from "@/lib/copy/padrao";

/**
 * Texto da loja: os overrides do catálogo padrão.
 *
 * A loja é SEMPRE a da sessão. `admin_id` nunca vem do corpo da requisição —
 * aceitá-lo deixaria um lojista reescrever as telas da loja de outro. É o
 * mesmo motivo que fez o PUT /api/loja fazer upsert por admin_id.
 *
 * `requireAdmin`, e não `requireAdminSession`: loja suspensa não edita texto.
 */

/** Mensagem de coluna ausente, para quem esqueceu a migration. */
function erroDeColuna(code: string | undefined): string | null {
    // 42703 = coluna inexistente.
    return code === "42703"
        ? "Coluna 'copy_overrides' não encontrada. Execute a migration 030 no Supabase."
        : null;
}

/** GET /api/loja/textos — os overrides da própria loja. */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .select("copy_overrides")
            .eq("admin_id", auth.session.adminId)
            .maybeSingle();

        if (error) {
            console.error("[GET /api/loja/textos]", error.message);
            return jsonError(erroDeColuna(error.code) ?? "Erro ao carregar os textos.", 500);
        }

        // Higieniza na leitura também: o banco pode ter dado gravado por uma
        // versão anterior das regras — um limite que mudou, uma chave que foi
        // renomeada — e a tela de edição mostraria isso como texto válido.
        return NextResponse.json({ overrides: sanitizarOverrides(data?.copy_overrides) });
    } catch (e) {
        return handleRouteError(e, "GET /api/loja/textos");
    }
}

/**
 * PUT /api/loja/textos — grava o conjunto inteiro de overrides.
 *
 * Substitui, não mescla. A tela de edição sempre manda o estado completo, e
 * mesclar tornaria impossível apagar uma chave por este caminho — o lojista
 * removeria o texto do campo, salvaria, e o antigo voltaria.
 */
export async function PUT(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const parsed = await readJson<{ overrides?: unknown }>(request);
        if (!parsed.ok) return parsed.response;

        const limpos = sanitizarOverrides(parsed.body?.overrides);

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .upsert(
                {
                    admin_id: auth.session.adminId,
                    copy_overrides: limpos,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "admin_id" }
            )
            .select("copy_overrides")
            .single();

        if (error) {
            console.error("[PUT /api/loja/textos]", error.message);
            return jsonError(erroDeColuna(error.code) ?? "Erro ao salvar os textos.", 500);
        }

        return NextResponse.json({ overrides: sanitizarOverrides(data?.copy_overrides) });
    } catch (e) {
        return handleRouteError(e, "PUT /api/loja/textos");
    }
}

/**
 * DELETE /api/loja/textos[?chave=<x>] — reverter.
 *
 * Sem `chave`, volta tudo ao padrão. Reverter APAGA a chave em vez de gravar o
 * texto padrão por cima: gravar por cima congelaria a loja na redação de hoje,
 * e quando o produto melhorasse uma frase, quem "reverteu" ficaria com a antiga.
 */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const db = getSupabaseAdmin();
        const chave = request.nextUrl.searchParams.get("chave")?.trim();

        let novos: Record<string, string> = {};

        if (chave) {
            if (!Object.prototype.hasOwnProperty.call(COPY_PADRAO, chave)) {
                return jsonError("Chave de texto desconhecida.", 400);
            }

            const { data, error } = await db
                .from("store_settings")
                .select("copy_overrides")
                .eq("admin_id", auth.session.adminId)
                .maybeSingle();

            if (error) {
                console.error("[DELETE /api/loja/textos]", error.message);
                return jsonError(erroDeColuna(error.code) ?? "Erro ao carregar os textos.", 500);
            }

            novos = sanitizarOverrides(data?.copy_overrides);
            delete novos[chave];
        }

        const { data, error } = await db
            .from("store_settings")
            .upsert(
                {
                    admin_id: auth.session.adminId,
                    copy_overrides: novos,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "admin_id" }
            )
            .select("copy_overrides")
            .single();

        if (error) {
            console.error("[DELETE /api/loja/textos]", error.message);
            return jsonError(erroDeColuna(error.code) ?? "Erro ao reverter os textos.", 500);
        }

        return NextResponse.json({ overrides: sanitizarOverrides(data?.copy_overrides) });
    } catch (e) {
        return handleRouteError(e, "DELETE /api/loja/textos");
    }
}
