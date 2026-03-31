/**
 * Server-only crypto utilities.
 * Uses Node.js `node:crypto` — never import this in client components.
 * Compatible with the saltHex:hashHex format written by the browser PBKDF2 implementation.
 */
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

const ITERATIONS = 100_000;
const KEY_LEN    = 32; // bytes → 256-bit output
const DIGEST     = "sha256";

export async function hashPasswordServer(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await pbkdf2Async(password, salt, ITERATIONS, KEY_LEN, DIGEST);
    return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPasswordServer(password: string, stored: string): Promise<boolean> {
    const parts = stored.split(":");
    if (parts.length !== 2) return false;

    const [saltHex, storedHashHex] = parts;
    try {
        const salt = Buffer.from(saltHex, "hex");
        const hash = await pbkdf2Async(password, salt, ITERATIONS, KEY_LEN, DIGEST);

        // Constant-time comparison to prevent timing attacks
        const hashBuf   = Buffer.from(hash.toString("hex"));
        const storedBuf = Buffer.from(storedHashHex);
        if (hashBuf.length !== storedBuf.length) return false;
        return timingSafeEqual(hashBuf, storedBuf);
    } catch {
        return false;
    }
}

export function generateSecureTokenServer(): string {
    return randomBytes(32).toString("hex"); // 64-char hex string
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings are converted to UTF-8 buffers and compared with timingSafeEqual.
 * Returns false (not throwing) if lengths differ, to avoid length-based timing leaks.
 */
export function safeCompareStrings(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}
