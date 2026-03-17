import { NextRequest, NextResponse } from "next/server";

// Paths that don't require admin authentication
const PUBLIC_PREFIXES = ["/login", "/loginadmin", "/cliente/", "/_next/", "/favicon", "/api/"];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isPublicPath(pathname)) return NextResponse.next();

    const adminCookie = request.cookies.get("pedidoai_admin");
    if (!adminCookie?.value) {
        const loginUrl = new URL("/loginadmin", request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - static files (_next/static, _next/image, favicon, public/)
         */
        "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
