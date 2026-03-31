import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, verifySession } from "@/lib/session-cookie";

/** GET /api/auth/session — read and verify the httpOnly session cookie */
export async function GET(request: NextRequest) {
    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) {
        return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    const session = await verifySession(cookie);
    if (!session) {
        // Cookie exists but signature is invalid — clear it
        const res = NextResponse.json({ error: "Invalid session" }, { status: 401 });
        res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
        return res;
    }

    return NextResponse.json(session);
}

/** DELETE /api/auth/session — clear the session cookie (logout) */
export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return res;
}
