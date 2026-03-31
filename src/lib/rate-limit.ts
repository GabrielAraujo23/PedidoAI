/**
 * In-memory sliding-window rate limiter.
 *
 * Works for single-instance deployments (Vercel hobby, VPS, etc.).
 * For multi-instance / serverless scale: replace the store with
 * Upstash Redis (@upstash/ratelimit) — the API surface is identical.
 *
 * NOTE: state resets on cold starts. That is acceptable for this app —
 * it only means a brief window of elevated tolerance after a restart.
 */

interface Entry {
    count:   number;
    resetAt: number; // Unix ms timestamp
}

const store = new Map<string, Entry>();

// Prune expired entries every minute to prevent unbounded memory growth
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
    }
}, 60_000).unref?.(); // .unref() so this timer doesn't keep the process alive in tests

export interface RateLimitResult {
    allowed:   boolean;
    remaining: number;
    resetAt:   number; // Unix ms — use for Retry-After header
}

/**
 * Check (and increment) a rate limit counter.
 *
 * @param key       Unique key, e.g. `"signin:203.0.113.1"`
 * @param limit     Max requests allowed per window
 * @param windowMs  Window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now   = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    if (entry.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract the client IP from a Next.js request.
 * Trusts X-Forwarded-For only when behind a known proxy (Vercel sets this).
 */
export function getClientIP(request: Request): string {
    const xff = (request.headers as Headers).get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return (request.headers as Headers).get("x-real-ip") ?? "unknown";
}

/**
 * Pre-defined limit profiles for the auth endpoints.
 *
 * Tune these values based on expected legitimate traffic.
 */
export const LIMITS = {
    /** Sign-in: 8 attempts per 15 min per IP */
    signin:         { max: 8,  windowMs: 15 * 60 * 1000 },
    /** Sign-up: 5 attempts per hour per IP */
    signup:         { max: 5,  windowMs: 60 * 60 * 1000 },
    /** Forgot request: 5 per hour per IP (already returns 200 always) */
    forgot_request: { max: 5,  windowMs: 60 * 60 * 1000 },
    /** Forgot verify: 10 per 15 min per IP */
    forgot_verify:  { max: 10, windowMs: 15 * 60 * 1000 },
    /** Forgot reset: 5 per 15 min per IP */
    forgot_reset:   { max: 5,  windowMs: 15 * 60 * 1000 },
} as const;
