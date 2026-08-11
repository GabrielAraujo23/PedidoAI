import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, jsonError, handleRouteError } from "@/lib/api-auth";

/**
 * POST /api/loja/logo — envia a logo da loja autenticada.
 *
 * POR QUE PELO SERVIDOR E NÃO PELO NAVEGADOR:
 * a tela antiga mandava o arquivo direto para o Supabase Storage com a anon
 * key, que vive no bundle JavaScript público. Para aquilo funcionar, o bucket
 * precisaria aceitar escrita anônima — e então qualquer visitante do site
 * poderia despejar arquivos no storage até estourar a cota. Aqui o upload usa
 * a service role, que só existe no servidor, e o tenant sai da sessão
 * assinada: ninguém escreve na pasta de outra loja.
 *
 * O requireAdmin também valida a origem em requisições que alteram estado, e
 * exige tenant ativa — loja suspensa não troca a marca.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, igual ao limite do bucket
const TIPOS_ACEITOS = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const form = await request.formData().catch(() => null);
        const file = form?.get("file");

        if (!(file instanceof File)) return jsonError("Nenhum arquivo enviado.", 400);
        if (!TIPOS_ACEITOS.has(file.type)) {
            return jsonError("Formato não aceito. Envie PNG, JPG, WEBP ou SVG.", 400);
        }
        // O bucket também recusa acima de 2 MB, mas responder aqui dá uma
        // mensagem em português em vez do erro cru do Storage.
        if (file.size > MAX_BYTES) return jsonError("A logo deve ter no máximo 2 MB.", 400);

        const db = getSupabaseAdmin();
        // Uma logo por loja, sempre no mesmo caminho: trocar sobrescreve em vez
        // de acumular arquivo órfão a cada envio.
        const path = `${auth.session.adminId}/logo`;

        const { error: upErr } = await db.storage
            .from("store-logos")
            .upload(path, file, { upsert: true, contentType: file.type });

        if (upErr) {
            console.error("[POST /api/loja/logo] upload", upErr.message);
            return jsonError(
                upErr.message.toLowerCase().includes("not found")
                    ? "Bucket 'store-logos' não encontrado no Supabase."
                    : "Erro ao enviar a logo. Tente novamente.",
                500
            );
        }

        const { data } = db.storage.from("store-logos").getPublicUrl(path);
        // O caminho não muda entre envios, então a URL também não. Sem o
        // parâmetro de versão o navegador continuaria exibindo a logo antiga
        // que já está no cache dele.
        const logoUrl = `${data.publicUrl}?v=${Date.now()}`;

        const { error: dbErr } = await db
            .from("store_settings")
            .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
            .eq("admin_id", auth.session.adminId);

        if (dbErr) {
            console.error("[POST /api/loja/logo] update", dbErr.message);
            return jsonError("Logo enviada, mas não foi possível salvá-la. Tente novamente.", 500);
        }

        return NextResponse.json({ logoUrl });
    } catch (e) {
        return handleRouteError(e, "POST /api/loja/logo");
    }
}

/**
 * DELETE /api/loja/logo — remove a logo da loja autenticada.
 *
 * Apaga o arquivo além de limpar a referência. O bucket é público: deixar o
 * arquivo para trás manteria a logo antiga acessível por URL para quem já a
 * tivesse, o que não é o que "remover" significa.
 */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const db = getSupabaseAdmin();
        const path = `${auth.session.adminId}/logo`;

        const { error: rmErr } = await db.storage.from("store-logos").remove([path]);
        // Arquivo já inexistente não é erro para quem pediu para remover:
        // o estado final desejado é o mesmo.
        if (rmErr) console.error("[DELETE /api/loja/logo] remove", rmErr.message);

        const { error: dbErr } = await db
            .from("store_settings")
            .update({ logo_url: null, updated_at: new Date().toISOString() })
            .eq("admin_id", auth.session.adminId);

        if (dbErr) {
            console.error("[DELETE /api/loja/logo] update", dbErr.message);
            return jsonError("Erro ao remover a logo.", 500);
        }

        return NextResponse.json({ logoUrl: null });
    } catch (e) {
        return handleRouteError(e, "DELETE /api/loja/logo");
    }
}
