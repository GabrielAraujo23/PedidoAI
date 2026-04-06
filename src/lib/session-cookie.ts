/**
 * Session cookie signing/verification using HMAC-SHA-256 via Web Crypto API.
 * Compatible with both Edge runtime (middleware) and Node.js (API routes).
 * Never import this in client components.
 */

export const SESSION_COOKIE        = "pedidoai_session";
export const CLIENT_SESSION_COOKIE = "pedidoai_client";

const MAX_AGE        = 60 * 60 * 24;      // Admin session: 24 hours
const CLIENT_MAX_AGE = 60 * 60 * 24 * 30; // Client session: 30 days

export interface SessionPayload {
    adminId: string;
    email: string;
}

export interface ClientSessionPayload {
    clientId: string;
    name: string;
    phone: string;
    adminId: string;
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

async function signPayload<T>(data: T): Promise<string> {
    const payload = toBase64url(new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer);
    const key     = await getKey("sign");
    const sig     = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload).buffer as ArrayBuffer);
    return `${payload}.${toBase64url(sig)}`;
}

async function verifyPayload<T>(cookie: string): Promise<T | null> {
    const dot = cookie.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = cookie.slice(0, dot);
    const sig     = cookie.slice(dot + 1);
    try {
        const key   = await getKey("verify");
        const valid = await globalThis.crypto.subtle.verify(
            "HMAC", key, fromBase64url(sig).buffer as ArrayBuffer, new TextEncoder().encode(payload).buffer as ArrayBuffer
        );
        if (!valid) return null;
        return JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as T;
    } catch {
        return null;
    }
}

// ── Admin session ─────────────────────────────────────────────────────────────

export async function signSession(data: SessionPayload): Promise<string> {
    return signPayload(data);
}

export async function verifySession(cookie: string): Promise<SessionPayload | null> {
    return verifyPayload<SessionPayload>(cookie);
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

// ── Client session ────────────────────────────────────────────────────────────

export async function signClientSession(data: ClientSessionPayload): Promise<string> {
    return signPayload(data);
}

export async function verifyClientSession(cookie: string): Promise<ClientSessionPayload | null> {
    return verifyPayload<ClientSessionPayload>(cookie);
}

export function clientSessionCookieOptions(maxAge = CLIENT_MAX_AGE) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict" as const,
        path: "/",
        maxAge,
    };
}
