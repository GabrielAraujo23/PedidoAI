import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError, handleRouteError } from "@/lib/api-auth";
import { slugify, isValidSlug } from "@/lib/slug";
import { isPaletteFamily, isHex } from "@/lib/palette";
import { PALETTE_COOKIE, serializarPaleta, paletteCookieOptions } from "@/lib/palette-cookie";

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
        // white_label também não: quem concede white-label é o dono, pela fila
        // de contratações. Aceitá-lo aqui deixaria o lojista remover o crédito
        // sozinho, e o "plano superior" não significaria nada.
        const { admin_id: _a, id: _i, created_at: _c, white_label: _w, ...fields } = parsed.body;
        void _a; void _i; void _c; void _w;

        const db = getSupabaseAdmin();

        if ("palette_family" in fields && !isPaletteFamily(fields.palette_family)) {
            return jsonError("Família de cores inválida.", 400);
        }
        // Aviso de contraste é conselho e fica na tela. Formato é integridade e
        // fica aqui: "azul" chegaria ao CSS e o navegador ignoraria em silêncio,
        // deixando a cor anterior sem ninguém entender por quê.
        if ("accent_color" in fields && fields.accent_color !== null && !isHex(fields.accent_color)) {
            return jsonError("Cor de acento inválida.", 400);
        }

        // ── Slug ──────────────────────────────────────────────────────────
        // O slug é o endereço público da loja e tem índice único no banco.
        // Gravá-lo sem validar deixaria passar coisas como "Depósito Izomar",
        // que geraria um /loja/<slug> impossível de acertar, ou um valor
        // reservado que colidiria com outra rota. E a colisão entre lojas
        // precisa virar 409 com mensagem, não o erro cru do índice único.
        if ("slug" in fields) {
            const raw = fields.slug;

            if (raw === null || raw === "") {
                // Loja opta por não ter endereço público (a coluna é nullable).
                fields.slug = null;
            } else if (typeof raw !== "string") {
                return jsonError("Endereço da loja inválido.", 400);
            } else {
                const slug = slugify(raw);
                const check = isValidSlug(slug);
                if (!check.ok) return jsonError(check.error, 400);

                const { data: taken, error: slugError } = await db
                    .from("store_settings")
                    .select("admin_id")
                    .eq("slug", slug)
                    .maybeSingle();

                if (slugError) {
                    console.error("[PUT /api/loja] slug", slugError.message);
                    // 42703 = coluna inexistente: a migration 025 não rodou aqui.
                    const detail = slugError.code === "42703"
                        ? "Coluna 'slug' não encontrada. Execute a migration 025 no Supabase."
                        : "Erro ao verificar o endereço.";
                    return jsonError(detail, 500);
                }
                if (taken && taken.admin_id !== auth.session.adminId) {
                    return jsonError("Este endereço já está em uso por outra loja.", 409);
                }

                // Grava a forma normalizada, não a digitada.
                fields.slug = slug;
            }
        }

        const { data, error } = await db
            .from("store_settings")
            .upsert(
                { ...fields, admin_id: auth.session.adminId, updated_at: new Date().toISOString() },
                { onConflict: "admin_id" }
            )
            .select("*")
            .single();

        if (error) {
            console.error("[PUT /api/loja]", error.message);
            // Duas lojas salvando o mesmo endereço no mesmo instante passam
            // pela checagem acima e só esbarram no índice único; o índice é a
            // garantia real, então traduzimos o erro dele para o mesmo 409.
            if (error.code === "23505") {
                return jsonError("Este endereço já está em uso por outra loja.", 409);
            }
            const detail = error.code === "42P01"
                ? "Tabela não encontrada. Execute a migration 005 no Supabase."
                : "Erro ao salvar configurações.";
            return jsonError(detail, 500);
        }

        const res = NextResponse.json({ settings: data });
        // Regrava a cor na hora: sem isto o lojista escolheria a paleta, veria a
        // prévia mudar e o resto do painel continuar igual até o cookie expirar.
        res.cookies.set(
            PALETTE_COOKIE,
            serializarPaleta(data.palette_family, data.accent_color),
            paletteCookieOptions()
        );
        return res;
    } catch (e) {
        return handleRouteError(e, "PUT /api/loja");
    }
}
