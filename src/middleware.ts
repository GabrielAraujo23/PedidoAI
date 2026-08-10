import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-cookie";
import { canUsePanel } from "@/lib/tenant-status";

/**
 * Caminhos que NÃO exigem sessão de administrador.
 *
 * "Público" aqui significa apenas "não é o admin quem autentica". As rotas em
 * /api/cliente/ fazem a própria checagem com requireClient() e o cookie de
 * sessão do cliente; se ficassem de fora desta lista, o middleware pediria
 * sessão de admin e o app do cliente receberia 401 em tudo.
 *
 * /api/loja/publica devolve só coordenadas e taxa de entrega, necessárias na
 * tela de login antes de existir qualquer sessão. O /api/loja (sem /publica)
 * continua protegido.
 *
 * "/loja/" (COM a barra final) é a entrada pública por slug — o link que o
 * lojista compartilha. A barra é o que separa as duas coisas: a tela de
 * configuração da loja é "/loja", e "/loja".startsWith("/loja/") é false,
 * então ela continua exigindo sessão de admin. Parece frágil e não é; só não
 * remova essa barra.
 */
const PUBLIC_PREFIXES = [
    "/login",
    "/acesso",
    "/cliente/",
    "/api/auth/",
    "/api/cliente/",
    "/api/loja/publica",
    "/loja/",
    "/register",
    "/loginadmin",
];

/**
 * Público por caminho EXATO, não por prefixo.
 *
 * "/contratar" é a página de cadastro e não pode exigir sessão — quem a abre
 * ainda não tem conta. Mas "/contratar/status" é a tela de acompanhamento e
 * exige login. Se "/contratar" entrasse na lista de prefixos, a tela de
 * acompanhamento viraria pública junto. Mesma coisa entre POST
 * /api/contratar (cadastro, público) e GET /api/contratar/status (do dono do
 * próprio pedido).
 */
const PUBLIC_EXACT = new Set(["/contratar", "/api/contratar"]);

/** Única página alcançável por uma tenant que não está ativa. */
const STATUS_PAGE = "/contratar/status";

function isPublicPath(pathname: string): boolean {
    if (PUBLIC_EXACT.has(pathname)) return true;
    return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    // Rotas de API respondem 401 em JSON. Redirecionar um fetch() para /login
    // faria o navegador seguir o redirect e devolver o HTML da tela de login
    // com status 200 — o código chamador tentaria dar JSON.parse nisso e
    // mostraria "erro ao carregar" em vez de mandar o usuário reautenticar.
    const isApi = pathname.startsWith("/api/");

    function deny(clearCookie: boolean) {
        const res = isApi
            ? NextResponse.json({ error: "Não autenticado." }, { status: 401 })
            : NextResponse.redirect(new URL("/login", request.url));
        if (clearCookie) res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
        return res;
    }

    const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookieValue) return deny(false);

    // Verify HMAC signature — rejects any tampered or forged cookie.
    // Também rejeita cookie emitido antes da migration 026, que não carrega
    // role/status: sem eles não há portão de ciclo de vida.
    const session = await verifySession(cookieValue);
    if (!session) return deny(true);

    // ── Portão de ciclo de vida ──────────────────────────────────────────
    // Barato: lê o status de dentro do cookie assinado, sem tocar no banco
    // (isto roda no Edge). A palavra final é do requireAdmin(), que consulta
    // o banco em toda chamada de API — um cookie vale 24h e uma suspensão
    // não pode esperar por isso.
    if (!canUsePanel(session.status)) {
        if (pathname === STATUS_PAGE || pathname === "/api/contratar/status") {
            return NextResponse.next();
        }
        if (isApi) {
            return NextResponse.json(
                { error: "Sua loja ainda não está liberada.", code: "TENANT_INATIVA" },
                { status: 403 }
            );
        }
        return NextResponse.redirect(new URL(STATUS_PAGE, request.url));
    }

    // Tenant ativa não fica presa na tela de acompanhamento.
    if (pathname === STATUS_PAGE) {
        return NextResponse.redirect(new URL("/", request.url));
    }

    // ── Portão de papel ──────────────────────────────────────────────────
    // Gate barato pelo cookie; requireOwner() confere o papel no banco.
    if (pathname.startsWith("/pedido-ai-admin") && session.role !== "owner") {
        return isApi
            ? NextResponse.json({ error: "Acesso restrito." }, { status: 403 })
            : NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
}

export const config = {
    // Exclude Next.js internals, static files and all public assets (images, fonts, etc.)
    matcher: [
        "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf)).*)",
    ],
};
