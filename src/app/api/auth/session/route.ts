import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, verifySession } from "@/lib/session-cookie";
import { checkOrigin } from "@/lib/csrf";

/** GET /api/auth/session — read and verify the httpOnly session cookie */
export async function GET(request: NextRequest) {
    try {
        const cookie = request.cookies.get(SESSION_COOKIE)?.value;
        if (!cookie) {
            return NextResponse.json({ error: "No session" }, { status: 401 });
        }
        const session = await verifySession(cookie);
        if (!session) {
            const res = NextResponse.json({ error: "Invalid session" }, { status: 401 });
            res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
            return res;
        }
        return NextResponse.json(session);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[GET /api/auth/session] uncaught:", msg);
        if (msg.includes("SESSION_SECRET")) {
            return NextResponse.json(
                { error: "Servidor mal configurado: defina SESSION_SECRET no Vercel." },
                { status: 500 }
            );
        }
        return NextResponse.json({ error: "Erro interno." }, { status: 500 });
    }
}

/** DELETE /api/auth/session — clear the session cookie (logout) */
export async function DELETE(request: NextRequest) {
    if (!checkOrigin(request)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return res;
}
