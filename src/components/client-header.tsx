"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search, X, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import type { ClientSession } from "@/lib/auth-context";

const NAV = [
    { label: "Catálogo",     href: "/cliente/catalogo" },
    { label: "Meus Pedidos", href: "/cliente/perfil" },
];

interface ClientHeaderProps {
    session?: ClientSession | null;
    searchValue?: string;
    onSearchChange?: (v: string) => void;
}

export function ClientHeader({ session = null, searchValue = "", onSearchChange }: ClientHeaderProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { clearCart, totalItems } = useCart();

    async function handleLogout() {
        await fetch("/api/auth/client", { method: "DELETE" }).catch(() => {});
        clearCart();
        router.push("/login");
    }

    return (
        <header
            className="sticky top-0 z-50"
            style={{
                background: "rgba(247, 242, 234, 0.96)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderBottom: "1px solid rgba(120, 113, 108, 0.14)",
                fontFamily: "var(--font-body), ui-sans-serif, system-ui",
            }}
        >
            <div className="max-w-[1320px] mx-auto px-5 sm:px-8 h-[64px] flex items-center gap-4">

                {/* Logo */}
                <Link href="/cliente/catalogo" className="flex items-center shrink-0 group">
                    <Image src="/Logo_PedidoAi.png" alt="PedidoAI" width={180} height={98} className="w-[180px] h-auto object-contain transition-transform group-hover:scale-105" />
                </Link>

                {/* Nav */}
                <nav className="hidden md:flex items-center gap-1 ml-4">
                    {NAV.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={cn(
                                    "relative px-3 py-1.5 text-[13px] rounded-lg transition-colors",
                                    isActive
                                        ? "text-stone-900 font-semibold"
                                        : "text-stone-500 hover:text-stone-900"
                                )}
                            >
                                {item.label}
                                {isActive && (
                                    <motion.div
                                        layoutId="client-nav-underline"
                                        className="absolute -bottom-[19px] left-3 right-3 h-[2px] bg-orange-700 rounded-full"
                                        transition={{ type: "spring", damping: 28, stiffness: 380 }}
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex-1" />

                {/* Search */}
                {onSearchChange != null && (
                    <div className="relative flex-1 max-w-[420px] hidden sm:block">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                        <input
                            type="text"
                            value={searchValue}
                            placeholder="Buscar materiais…"
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full h-9 pl-9 pr-9 rounded-full bg-white/70 border border-stone-300/60 text-[13px] text-stone-900 placeholder-stone-400 outline-none focus:bg-white focus:border-stone-500 focus:ring-4 focus:ring-stone-900/5 transition-all duration-200"
                        />
                        {searchValue && (
                            <button
                                onClick={() => onSearchChange("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-stone-200 transition-colors"
                            >
                                <X className="w-3 h-3 text-stone-500" />
                            </button>
                        )}
                    </div>
                )}

                {/* Mobile cart */}
                {totalItems > 0 && (
                    <button
                        onClick={() => router.push("/cliente/checkout")}
                        className="md:hidden flex items-center gap-1.5 bg-stone-900 text-white px-3 h-9 rounded-full text-[12px] font-semibold shrink-0"
                    >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {totalItems}
                    </button>
                )}

                {/* User */}
                <div className="flex items-center gap-1 shrink-0">
                    {session && (
                        <Link
                            href="/cliente/perfil"
                            className="flex items-center gap-2.5 px-1 py-1 rounded-full hover:bg-stone-200/40 transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center">
                                <span
                                    className="text-white text-[12px] font-medium"
                                    style={{ fontFamily: "var(--font-display)" }}
                                >
                                    {session.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <span className="hidden lg:block text-[13px] font-medium text-stone-700 pr-1">
                                {session.name.split(" ")[0]}
                            </span>
                        </Link>
                    )}
                    <button
                        onClick={handleLogout}
                        className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-200/40 rounded-lg transition-colors"
                        title="Sair"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </header>
    );
}
