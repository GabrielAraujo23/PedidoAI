"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { AuthContext, AdminSession } from "@/lib/auth-context";

// Public paths: no admin session required
const PUBLIC_PREFIXES = ["/login", "/acesso", "/cliente/"];

function isPublicPath(pathname: string) {
    return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
    const [loading, setLoading] = useState(true);
    const pathname = usePathname();
    const router = useRouter();

    const isPublic = isPublicPath(pathname);

    // Read admin session from httpOnly cookie via server API on mount
    useEffect(() => {
        fetch("/api/auth/session")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data?.adminId) setAdminSession(data as AdminSession); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    // Route protection
    useEffect(() => {
        if (loading) return;
        if (!isPublic && !adminSession) {
            // Redireciona para /login sem revelar a URL admin oculta
            router.push("/login");
        }
        if (pathname === "/acesso" && adminSession) {
            router.push("/");
        }
    }, [loading, isPublic, adminSession, router, pathname]);

    function signOut() {
        fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
        setAdminSession(null);
        router.push("/login");
    }

    // Loading spinner while checking session on admin routes
    if (loading && !isPublic) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-orange-50/30">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <span className="text-white font-bold text-2xl">P</span>
                    </div>
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
            </div>
        );
    }

    // Public / client routes — pass through without sidebar
    if (isPublic) {
        return (
            <AuthContext.Provider value={{ adminSession, loading, signOut, setAdminSession }}>
                {children}
            </AuthContext.Provider>
        );
    }

    // Admin route without session — nothing (redirect in progress)
    if (!adminSession) return null;

    // Admin route with session — full layout with sidebar
    return (
        <AuthContext.Provider value={{ adminSession, loading, signOut, setAdminSession }}>
            <div className="flex h-screen overflow-hidden">
                <NavSidebar />
                <main className="flex-1 overflow-y-auto ml-64 bg-[#F9FAFB] p-4 md:p-8">
                    {children}
                </main>
            </div>
        </AuthContext.Provider>
    );
}
