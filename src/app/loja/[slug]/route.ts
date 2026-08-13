import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TENANT_COOKIE, signTenant, tenantCookieOptions } from "@/lib/session-cookie";
import { PALETTE_COOKIE, serializarPaleta, paletteCookieOptions } from "@/lib/palette-cookie";
import { slugify } from "@/lib/slug";
import { handleRouteError } from "@/lib/api-auth";
import { isTenantActive } from "@/lib/tenant";

/**
 * GET /loja/<slug> — entrada pública da loja.
 *
 * Resolve o slug em `store_settings`, grava o cookie de tenant ASSINADO e
 * manda o visitante para /login. É este cookie que diz em qual loja um
 * cliente novo se cadastra; sem ele o sistema teria que adivinhar, que é
 * justamente o bug que esta feature remove.
 *
 * POR QUE UM ROUTE HANDLER E NÃO UMA PAGE:
 * no Next 16 um Server Component de página não pode escrever cookie — a
 * chamada a cookies().set() lança durante o render. Sobravam três caminhos:
 * Server Action (exige uma interação do usuário, e aqui o link tem que
 * funcionar no primeiro clique), middleware (rodaria uma consulta ao banco
 * no Edge em todas as requisições cobertas pelo matcher), ou este Route
 * Handler. O handler responde no próprio GET do link: uma consulta, um
 * Set-Cookie, um redirect — e, no caso de erro, um 404 de verdade no status
 * HTTP, coisa que um redirect para uma página de erro não daria.
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug: raw } = await context.params;

        // Normaliza antes de consultar: o link pode chegar do WhatsApp com
        // maiúsculas ou com a barra final, e o banco só guarda a forma limpa.
        const slug = slugify(decodeURIComponent(raw ?? ""));
        if (!slug) return notFoundPage(raw);

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .select("admin_id, store_name, slug, palette_family, accent_color")
            .eq("slug", slug)
            .maybeSingle();

        if (error) {
            console.error("[GET /loja/[slug]]", error.message);
            return notFoundPage(slug);
        }

        // Loja inexistente NÃO cai na loja padrão. Mandar o visitante para uma
        // loja qualquer é exatamente o palpite silencioso que estamos matando:
        // ele acabaria fazendo pedido no lugar errado sem perceber.
        if (!data?.admin_id) return notFoundPage(slug);

        // Loja não liberada (ou suspensa) responde o MESMO 404 de loja
        // inexistente. Bloquear só o painel deixaria uma loja cortada
        // recebendo pedidos por este link — e não é ao cliente final que se
        // explica que o lojista não pagou.
        if (!(await isTenantActive(data.admin_id))) return notFoundPage(slug);

        const res = NextResponse.redirect(new URL("/login", request.url));
        const signed = await signTenant({
            adminId:   data.admin_id,
            slug:      data.slug ?? slug,
            storeName: data.store_name ?? "",
        });
        res.cookies.set(TENANT_COOKIE, signed, tenantCookieOptions());
        res.cookies.set(
            PALETTE_COOKIE,
            serializarPaleta(data.palette_family, data.accent_color),
            paletteCookieOptions()
        );
        return res;
    } catch (e) {
        return handleRouteError(e, "GET /loja/[slug]");
    }
}

/** Escapa o slug antes de devolvê-lo no HTML — ele vem da URL do visitante. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * 404 amigável em português. É HTML montado aqui porque um Route Handler não
 * renderiza um componente React; em compensação o status 404 é real, e não um
 * 200 disfarçado como aconteceria redirecionando para uma página de erro.
 */
function notFoundPage(slug: string): NextResponse {
    const shown = escapeHtml(slug.slice(0, 60));
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Loja não encontrada · PedidoAI</title>
<style>
    :root { color-scheme: light; }
    body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        padding: 24px; background: #FAF7F2; color: #1C1917;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    main { max-width: 420px; text-align: center; }
    p.kicker { margin: 0 0 12px; font-size: 11px; letter-spacing: .25em; text-transform: uppercase; color: #78716C; }
    h1 { margin: 0; font-size: 34px; line-height: 1.1; font-weight: 500; letter-spacing: -.02em; }
    p.msg { margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #57534E; }
    code { background: #EFE9E1; border-radius: 6px; padding: 2px 6px; font-size: 14px; word-break: break-all; }
    a {
        display: inline-flex; align-items: center; justify-content: center; margin-top: 28px;
        height: 46px; padding: 0 22px; border-radius: 12px; background: #1C1917; color: #fff;
        font-size: 14px; font-weight: 600; text-decoration: none;
    }
</style>
</head>
<body>
<main>
    <p class="kicker">Endereço inválido</p>
    <h1>Não encontramos essa loja.</h1>
    <p class="msg">
        O endereço <code>/loja/${shown}</code> não pertence a nenhuma loja.
        Confira o link com a loja — pode ter mudado ou vindo cortado na mensagem.
    </p>
    <a href="/">Voltar ao início</a>
</main>
</body>
</html>`;

    return new NextResponse(html, {
        status: 404,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}
