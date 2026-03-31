// Password hashing using PBKDF2 via Web Crypto API (built-in, no extra packages).
// Format stored: "saltHex:hashHex" — 16-byte random salt + 256-bit PBKDF2-SHA-256 hash.
// 100,000 iterations (NIST recommended minimum as of 2023).

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

// Access subtle lazily to avoid SSR evaluation on Node.js 18 where crypto.subtle may be absent
function getSubtle() {
    return (window.crypto ?? globalThis.crypto).subtle;
}

async function importKey(password: string) {
    return getSubtle().importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
}

export async function hashPassword(password: string): Promise<string> {
    const salt = (window.crypto ?? globalThis.crypto).getRandomValues(new Uint8Array(16));
    const key = await importKey(password);
    const hashBits = await getSubtle().deriveBits(
        { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, hash: "SHA-256", iterations: 100_000 },
        key,
        256
    );
    return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(hashBits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split(":");
    if (parts.length !== 2) return false;

    const salt = hexToBytes(parts[0]);
    const storedHash = parts[1];

    const key = await importKey(password);
    const hashBits = await getSubtle().deriveBits(
        { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, hash: "SHA-256", iterations: 100_000 },
        key,
        256
    );
    return bytesToHex(new Uint8Array(hashBits)) === storedHash;
}

export function generateResetToken(): string {
    const bytes = (window.crypto ?? globalThis.crypto).getRandomValues(new Uint8Array(4));
    const num = (new DataView(bytes.buffer).getUint32(0) % 900_000) + 100_000;
    return String(num);
}
