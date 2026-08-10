/**
 * Session cookie signing/verification using HMAC-SHA-256 via Web Crypto API.
 * Compatible with both Edge runtime (middleware) and Node.js (API routes).
 * Never import this in client components.
 */

import { isTenantStatus, isAdminRole, type TenantStatus, type AdminRole } from "@/lib/tenant-status";

export const SESSION_COOKIE        = "pedidoai_session";
export const CLIENT_SESSION_COOKIE = "pedidoai_client";
export const TENANT_COOKIE         = "pedidoai_tenant";

const MAX_AGE        = 60 * 60 * 24;      // Admin session: 24 hours
const CLIENT_MAX_AGE = 60 * 60 * 24 * 30; // Client session: 30 days
const TENANT_MAX_AGE = 60 * 60 * 24 * 30; // Tenant do visitante: 30 days

export interface SessionPayload {
    adminId: string;
    email:   string;
    role:    AdminRole;
    status:  TenantStatus;
}

export interface ClientSessionPayload {
    clientId: string;
    name: string;
    phone: string;
    adminId: string;
}

/**
 * Loja que o visitante escolheu ao abrir /loja/<slug>, antes de existir
 * qualquer sessão. É o que diz em qual loja um cliente novo se cadastra.
 */
export interface TenantPayload {
    adminId: string;
    slug: string;
    storeName: string;
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

/**
 * Verifica a assinatura E o formato do payload.
 *
 * Um cookie emitido antes da migration 026 tem assinatura perfeitamente
 * valida e nenhum `status` — aceitá-lo deixaria uma sessão sem portão de
 * ciclo de vida circulando por até 24h. Melhor tratar como inválido: o
 * middleware limpa o cookie e a pessoa faz login de novo.
 */
export async function verifySession(cookie: string): Promise<SessionPayload | null> {
    const payload = await verifyPayload<SessionPayload>(cookie);
    if (!payload || typeof payload.adminId !== "string" || typeof payload.email !== "string") {
        return null;
    }
    if (!isAdminRole(payload.role) || !isTenantStatus(payload.status)) return null;
    return payload;
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

// ── Tenant (loja escolhida pelo visitante) ────────────────────────────────────

export async function signTenant(data: TenantPayload): Promise<string> {
    return signPayload(data);
}

export async function verifyTenant(cookie: string): Promise<TenantPayload | null> {
    return verifyPayload<TenantPayload>(cookie);
}

export function tenantCookieOptions(maxAge = TENANT_MAX_AGE) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // "lax", e não "strict" como as sessões: o link da loja chega por
        // WhatsApp, Instagram ou QR code. Com "strict" o navegador não
        // mandaria o cookie na primeira navegação vinda de fora, e o cliente
        // cairia em /login sem saber de que loja se trata — justamente o que
        // esta feature existe para evitar. O conteúdo é assinado por HMAC,
        // então "lax" não abre espaço para forjar loja.
        sameSite: "lax" as const,
        path: "/",
        maxAge,
    };
}
