"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ClientSession } from "@/lib/auth-context";

async function fetchClientSession(): Promise<ClientSession | null> {
    return fetch("/api/auth/client")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
}

/**
 * Reads the client session from an httpOnly cookie via GET /api/auth/client.
 * Redirects to /login if no valid session is found.
 *
 * @param redirectOnMissing - Set to false to suppress redirect (e.g. in shared headers).
 */
export function useClientSession(redirectOnMissing = true) {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchClientSession()
            .then((data) => {
                if (!data?.clientId) {
                    if (redirectOnMissing) router.push("/login");
                } else {
                    setSession(data);
                }
            })
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function logout() {
        await fetch("/api/auth/client", { method: "DELETE" }).catch(() => {});
        setSession(null);
        router.push("/login");
    }

    async function refresh() {
        const data = await fetchClientSession();
        if (data?.clientId) setSession(data);
    }

    return { session, loading, logout, refresh };
}
