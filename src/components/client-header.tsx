"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import type { ClientSession } from "@/lib/auth-context";

const NAV = [
    { label: "Produtos", href: "/cliente/chat" },
    { label: "Meus Pedidos", href: "/cliente/perfil" },
    { label: "Ajuda", href: "#ajuda" },
];

interface ClientHeaderProps {
    searchValue?: string;
    onSearchChange?: (v: string) => void;
}

export function ClientHeader({ searchValue = "", onSearchChange }: ClientHeaderProps) {
    const [session, setSession] = useState<ClientSession | null>(null);
    const pathname = usePathname();
    const router = useRouter();
    const { clearCart } = useCart();

    useEffect(() => {
        const raw = localStorage.getItem("pedidoai_client_session");
        if (raw) setSession(JSON.parse(raw) as ClientSession);
    }, []);

    function handleLogout() {
        localStorage.removeItem("pedidoai_client_session");
        clearCart();
        router.push("/login");
    }

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] shadow-sm">
            <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center gap-4">

                {/* Logo + Nav */}
                <div className="flex items-center gap-5 shrink-0">
                    <Link href="/cliente/chat" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#F97316] rounded-lg flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-sm">P</span>
                        </div>
                        <span className="font-bold text-[#111827] hidden sm:block">PedidoAI</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-1">
                        {NAV.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={cn(
                                    "px-3 py-1.5 text-sm rounded-lg font-medium transition-colors",
                                    pathname === item.href || (item.href !== "#ajuda" && pathname.startsWith(item.href + "/"))
                                        ? "text-[#F97316]"
                                        : "text-[#6B7280] hover:text-[#111827]"
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Search */}
                {onSearchChange != null ? (
                    <div className="relative flex-1 max-w-lg mx-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                        <input
                            type="text"
                            value={searchValue}
                            placeholder="O que você está procurando hoje?"
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full h-9 pl-9 pr-3 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] text-sm text-[#111827] outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]"
                        />
                    </div>
                ) : (
                    <div className="flex-1" />
                )}

                {/* User + Logout */}
                <div className="flex items-center gap-3 shrink-0">
                    {session && (
                        <Link href="/cliente/perfil" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <div className="w-8 h-8 rounded-full bg-[#F97316]/10 flex items-center justify-center">
                                <span className="text-[#F97316] font-bold text-sm">
                                    {session.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="hidden sm:block text-right">
                                <p className="text-[10px] text-[#6B7280] leading-none">Bem-vindo,</p>
                                <p className="text-sm font-semibold text-[#111827] leading-none mt-0.5">
                                    {session.name.split(" ")[0]}
                                </p>
                            </div>
                        </Link>
                    )}
                    <button
                        onClick={handleLogout}
                        className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] rounded-lg transition-colors"
                        title="Sair"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </header>
    );
}
