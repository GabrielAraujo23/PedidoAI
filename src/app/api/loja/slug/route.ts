import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, jsonError, handleRouteError } from "@/lib/api-auth";
import { slugify, isValidSlug } from "@/lib/slug";

/**
 * GET /api/loja/slug?valor=<slug> — o endereço está livre?
 *
 * Serve a validação ao vivo do campo em /loja. Existe como rota admin (e não
 * pública) porque responde "quem já usa este endereço": aberta, viraria um
 * enumerador de lojas cadastradas para qualquer visitante.
 *
 * O tenant sai do cookie, nunca do querystring — é ele que decide o que NÃO é
 * conflito: reencontrar o próprio slug ao reeditar o formulário é o caso
 * normal, não uma colisão.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const raw = request.nextUrl.searchParams.get("valor") ?? "";

        // Normaliza antes de validar: o que o lojista digita ("Depósito Izomar")
        // não é o que vai para a URL, e é sobre a forma final que a resposta fala.
        const slug = slugify(raw);
        if (!slug) {
            return NextResponse.json({
                available: false,
                slug: "",
                error: "Escolha um endereço para a sua loja.",
            });
        }

        const check = isValidSlug(slug);
        if (!check.ok) {
            return NextResponse.json({ available: false, slug, error: check.error });
        }

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .select("admin_id")
            .eq("slug", slug)
            .maybeSingle();

        if (error) {
            console.error("[GET /api/loja/slug]", error.message);
            // 42703 = coluna inexistente: a migration 025 ainda não rodou aqui.
            const detail = error.code === "42703"
                ? "Coluna 'slug' não encontrada. Execute a migration 025 no Supabase."
                : "Erro ao verificar o endereço.";
            return jsonError(detail, 500);
        }

        // A própria loja não conflita consigo mesma.
        if (data && data.admin_id !== auth.session.adminId) {
            return NextResponse.json({
                available: false,
                slug,
                error: "Este endereço já está em uso por outra loja.",
            });
        }

        return NextResponse.json({ available: true, slug });
    } catch (e) {
        return handleRouteError(e, "GET /api/loja/slug");
    }
}
