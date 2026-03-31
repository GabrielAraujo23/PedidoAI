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
const PUBLIC_PREFIXES = [
    "/login",
    "/acesso",
    "/cliente/",
    "/api/auth/",
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

    const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;

    if (!cookieValue) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // Verify HMAC signature — rejects any tampered or forged cookie
    const session = await verifySession(cookieValue);
    if (!session) {
        const res = NextResponse.redirect(new URL("/login", request.url));
        res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
        return res;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon\\.ico).*)",
    ],
};
