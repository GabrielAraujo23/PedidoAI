import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-cookie";

/**
 * Paths that do NOT require an admin session.
 * - /login       — client login
 * - /acesso      — admin login
 * - /cliente/    — all client-facing pages
 * - /api/auth/   — auth endpoints (login, session management)
 * - /register    — legacy redirect page
 * - /loginadmin  — legacy redirect page
 */
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

function isPublicPath(pathname: string): boolean {
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

    // Verify HMAC signature — rejects any tampered or forged cookie
    const session = await verifySession(cookieValue);
    if (!session) return deny(true);

    return NextResponse.next();
}

export const config = {
    // Exclude Next.js internals, static files and all public assets (images, fonts, etc.)
    matcher: [
        "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf)).*)",
    ],
};
