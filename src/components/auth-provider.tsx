"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Menu } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { AuthContext, AdminSession } from "@/lib/auth-context";
import { BrandMark } from "@/components/brand-mark";

// Public paths: no admin session required
// "/contratar" cobre a página de cadastro E a tela de acompanhamento. Aqui
// "público" significa apenas "sem sidebar e sem redirecionar para /login" —
// quem policia o acesso a /contratar/status é o middleware, que já exige
// sessão. Um lojista pendente não deve ver a sidebar do painel que ainda não
// pode usar.
const PUBLIC_PREFIXES = ["/login", "/acesso", "/cliente/", "/contratar"];

function isPublicPath(pathname: string) {
    return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
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
            <div className="h-screen flex items-center justify-center bg-warm">
                <div className="flex flex-col items-center gap-3">
                    <Image src="/Logo_PedidoAi.png" alt="PedidoAI" width={280} height={153} className="w-[280px] h-auto object-contain" />
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
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
                {/* Mobile overlay */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                <NavSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                <main
                    className="flex-1 overflow-y-auto lg:ml-64 bg-warm"
                    style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
                >
                    {/* Mobile top bar */}
                    <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-sidebar-border/60"
                        style={{ background: "var(--sidebar)", backdropFilter: "blur(10px)" }}
                    >
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <Link href="/" className="flex-1">
                            <BrandMark className="h-7 max-w-[140px]" textClassName="text-[15px]" />
                        </Link>
                    </div>

                    <div className="p-5 md:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </AuthContext.Provider>
    );
}
