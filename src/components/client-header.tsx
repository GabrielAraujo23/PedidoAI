"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search, X, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import type { ClientSession } from "@/lib/auth-context";

const NAV = [
    { label: "Catalogo", href: "/cliente/chat" },
    { label: "Meus Pedidos", href: "/cliente/perfil" },
];

interface ClientHeaderProps {
    searchValue?: string;
    onSearchChange?: (v: string) => void;
}

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ClientHeader({ searchValue = "", onSearchChange }: ClientHeaderProps) {
    const [session, setSession] = useState<ClientSession | null>(null);
    const pathname = usePathname();
    const router = useRouter();
    const { clearCart, totalItems, totalPrice } = useCart();

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
        <header className="sticky top-0 z-50">
            {/* Accent gradient bar */}
            <div className="h-[3px] bg-gradient-to-r from-[#F97316] via-[#FBBF24] to-[#F97316]" />

            <div className="bg-[#1C1917] backdrop-blur-xl">
                <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-[60px] flex items-center gap-4">

                    {/* Logo */}
                    <Link href="/cliente/chat" className="flex items-center gap-2.5 shrink-0 group">
                        <div className="w-9 h-9 bg-gradient-to-br from-[#F97316] to-[#EA580C] rounded-xl flex items-center justify-center shadow-lg shadow-[#F97316]/20 group-hover:shadow-[#F97316]/40 transition-shadow">
                            <span className="text-white font-black text-base tracking-tight">P</span>
                        </div>
                        <div className="hidden sm:block">
                            <span className="font-bold text-white text-[15px] tracking-tight">PedidoAI</span>
                            <span className="block text-[8px] text-white/30 -mt-0.5 uppercase tracking-[0.25em] font-semibold">MATERIAIS</span>
                        </div>
                    </Link>

                    {/* Nav */}
                    <nav className="hidden md:flex items-center gap-0.5 ml-3">
                        {NAV.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={cn(
                                        "relative px-3.5 py-2 text-[13px] font-medium rounded-lg transition-colors",
                                        isActive
                                            ? "text-[#F97316]"
                                            : "text-white/50 hover:text-white/80 hover:bg-white/5"
                                    )}
                                >
                                    {item.label}
                                    {isActive && (
                                        <motion.div
                                            layoutId="client-nav-indicator"
                                            className="absolute -bottom-[13px] left-3 right-3 h-[3px] bg-[#F97316] rounded-t-full"
                                            transition={{ type: "spring", damping: 30, stiffness: 400 }}
                                        />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Search */}
                    {onSearchChange != null && (
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                            <input
                                type="text"
                                value={searchValue}
                                placeholder="Buscar materiais..."
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full h-10 pl-10 pr-9 rounded-xl bg-white/[0.07] border border-white/[0.08] text-sm text-white placeholder-white/25 outline-none focus:bg-white/[0.12] focus:border-[#F97316]/40 focus:ring-1 focus:ring-[#F97316]/20 transition-all duration-200"
                            />
                            {searchValue && (
                                <button
                                    onClick={() => onSearchChange("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Cart pill (mobile shortcut) */}
                    {totalItems > 0 && (
                        <button
                            onClick={() => router.push("/cliente/checkout")}
                            className="lg:hidden flex items-center gap-2 bg-[#F97316]/15 border border-[#F97316]/20 text-[#F97316] px-3 py-1.5 rounded-full transition-colors hover:bg-[#F97316]/25 shrink-0"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            <span className="text-xs font-bold">{totalItems}</span>
                        </button>
                    )}

                    {/* User area */}
                    <div className="flex items-center gap-2 shrink-0">
                        {session && (
                            <Link
                                href="/cliente/perfil"
                                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                            >
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C] flex items-center justify-center ring-2 ring-white/[0.08]">
                                    <span className="text-white font-bold text-sm">
                                        {session.name.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="hidden sm:block">
                                    <p className="text-[10px] text-white/30 leading-none font-medium">Ola,</p>
                                    <p className="text-sm font-semibold text-white leading-tight mt-0.5">
                                        {session.name.split(" ")[0]}
                                    </p>
                                </div>
                            </Link>
                        )}
                        <button
                            onClick={handleLogout}
                            className="p-2 text-white/30 hover:text-white/70 hover:bg-white/5 rounded-lg transition-colors"
                            title="Sair"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
