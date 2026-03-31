/**
 * Session cookie signing/verification using HMAC-SHA-256 via Web Crypto API.
 * Compatible with both Edge runtime (middleware) and Node.js (API routes).
 * Never import this in client components.
 */

export const SESSION_COOKIE = "pedidoai_session";
const MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

export interface SessionPayload {
    adminId: string;
    email: string;
}

function getSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret && process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET env variable is required in production.");
    }
    return secret ?? "dev-only-secret-set-SESSION_SECRET-in-production";
}

async function getKey(usage: "sign" | "verify"): Promise<CryptoKey> {
    const raw = new TextEncoder().encode(getSecret());
    return globalThis.crypto.subtle.importKey(
        "raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [usage]
    );
}

function toBase64url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(str: string): Uint8Array {
    return Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

export async function signSession(data: SessionPayload): Promise<string> {
    const payload = toBase64url(new TextEncoder().encode(JSON.stringify(data)));
    const key     = await getKey("sign");
    const sig     = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return `${payload}.${toBase64url(sig)}`;
}

export async function verifySession(cookie: string): Promise<SessionPayload | null> {
    const dot = cookie.lastIndexOf(".");
    if (dot === -1) return null;

    const payload = cookie.slice(0, dot);
    const sig     = cookie.slice(dot + 1);

    try {
        const key   = await getKey("verify");
        const valid = await globalThis.crypto.subtle.verify(
            "HMAC", key, fromBase64url(sig), new TextEncoder().encode(payload)
        );
        if (!valid) return null;
        return JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as SessionPayload;
    } catch {
        return null;
    }
}

export function sessionCookieOptions(maxAge = MAX_AGE) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict" as const,
        path: "/",
        maxAge,
    };
}
