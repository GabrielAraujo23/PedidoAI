import { NextRequest } from "next/server";

/**
 * Validates that the request Origin matches the Host header.
 * Prevents cross-site request forgery on state-mutating endpoints.
 *
 * Returns true (allow) if:
 * - No Origin header is present (server-to-server request)
 * - Origin host exactly matches the Host header
 */
export function checkOrigin(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return true; // Non-browser / server-to-server — no Origin
    const host = request.headers.get("host");
    if (!host) return false;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}
