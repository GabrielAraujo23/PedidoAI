"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search, X, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import type { ClientSession } from "@/lib/auth-context";

const NAV = [
    { label: "Catálogo", href: "/cliente/catalogo" },
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
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

    async function handleLogout() {
        await fetch("/api/auth/client", { method: "DELETE" }).catch(() => { });
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
            {/* ── Main bar ── */}
            <div className="max-w-[1320px] mx-auto px-4 sm:px-8 h-[76px] flex items-center gap-3">

                {/* Logo */}
                <Link href="/cliente/catalogo" className="flex items-center shrink-0 group py-1">
                    <Image
                        src="/Logo_PedidoAi.png"
                        alt="PedidoAI"
                        width={220}
                        height={120}
                        className="h-14 w-auto object-contain transition-transform group-hover:scale-105"
                        priority
                    />
                </Link>

                {/* Desktop nav */}
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

                {/* Desktop search */}
                {onSearchChange != null && (
                    <div className="relative flex-1 max-w-[400px] hidden md:block">
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

                {/* Mobile search icon */}
                {onSearchChange != null && (
                    <button
                        onClick={() => setMobileSearchOpen((v) => !v)}
                        className="md:hidden p-2 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/40 transition-colors"
                        aria-label="Buscar"
                    >
                        <Search className="w-4.5 h-4.5" />
                    </button>
                )}

                {/* Mobile cart badge */}
                {totalItems > 0 && (
                    <button
                        onClick={() => router.push("/cliente/checkout")}
                        className="md:hidden flex items-center gap-1.5 bg-stone-900 text-white px-3 h-8 rounded-full text-[12px] font-semibold shrink-0"
                    >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {totalItems}
                    </button>
                )}

                {/* User + logout */}
                <div className="flex items-center gap-1 shrink-0">
                    {session && (
                        <Link
                            href="/cliente/perfil"
                            className="flex items-center gap-2 px-1 py-1 rounded-full hover:bg-stone-200/40 transition-colors"
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

            {/* ── Mobile search drawer ── */}
            <AnimatePresence>
                {mobileSearchOpen && onSearchChange != null && (
                    <motion.div
                        key="mobile-search"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="md:hidden overflow-hidden border-t border-stone-200/60"
                    >
                        <div className="px-4 py-3">
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={searchValue}
                                    placeholder="Buscar materiais…"
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    className="w-full h-10 pl-9 pr-9 rounded-full bg-white border border-stone-300/60 text-[14px] text-stone-900 placeholder-stone-400 outline-none focus:border-stone-500 focus:ring-4 focus:ring-stone-900/5 transition-all duration-200"
                                />
                                {searchValue ? (
                                    <button
                                        onClick={() => onSearchChange("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-stone-200 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5 text-stone-500" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setMobileSearchOpen(false)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-stone-200 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5 text-stone-500" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}
