"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search, X, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { resolverCopy } from "@/lib/copy";
import { useCart } from "@/context/CartContext";
import type { ClientSession } from "@/lib/auth-context";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
    { label: resolverCopy("cabecalho.catalogo", null), href: "/cliente/catalogo" },
    { label: resolverCopy("cabecalho.meus_pedidos", null), href: "/cliente/perfil" },
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
                background: "var(--sidebar)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderBottom: "1px solid var(--sidebar-border)",
                fontFamily: "var(--font-body), ui-sans-serif, system-ui",
            }}
        >
            {/* ── Main bar ── */}
            <div className="max-w-[1320px] mx-auto px-4 sm:px-8 h-[76px] flex items-center gap-3">

                {/* Logo */}
                <Link href="/cliente/catalogo" className="flex items-center shrink-0 group py-1">
                    <BrandMark className="h-8 max-w-[160px]" textClassName="text-[17px]" />
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
                                        ? "text-foreground font-semibold"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {item.label}
                                {isActive && (
                                    <motion.div
                                        layoutId="client-nav-underline"
                                        className="absolute -bottom-[19px] left-3 right-3 h-[2px] bg-primary rounded-full"
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
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            value={searchValue}
                            placeholder={resolverCopy("cabecalho.buscar", null)}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full h-9 pl-9 pr-9 rounded-full bg-background/70 border border-input text-[13px] text-foreground placeholder-muted-foreground outline-none focus:bg-background focus:border-ring focus:ring-4 focus:ring-ring/20 transition-all duration-200"
                        />
                        {searchValue && (
                            <button
                                onClick={() => onSearchChange("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
                            >
                                <X className="w-3 h-3 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                )}

                {/* Mobile search icon */}
                {onSearchChange != null && (
                    <button
                        onClick={() => setMobileSearchOpen((v) => !v)}
                        className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        aria-label={resolverCopy("cabecalho.buscar_rotulo", null)}
                    >
                        <Search className="w-4.5 h-4.5" />
                    </button>
                )}

                {/* Mobile cart badge */}
                {totalItems > 0 && (
                    <button
                        onClick={() => router.push("/cliente/checkout")}
                        className="md:hidden flex items-center gap-1.5 bg-foreground text-background px-3 h-8 rounded-full text-[12px] font-semibold shrink-0"
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
                            className="flex items-center gap-2 px-1 py-1 rounded-full hover:bg-muted/40 transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center">
                                <span
                                    className="text-background text-[12px] font-medium"
                                    style={{ fontFamily: "var(--font-display)" }}
                                >
                                    {session.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <span className="hidden lg:block text-[13px] font-medium text-muted-foreground pr-1">
                                {session.name.split(" ")[0]}
                            </span>
                        </Link>
                    )}
                    <ThemeToggle />
                    <button
                        onClick={handleLogout}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-colors"
                        title={resolverCopy("cabecalho.sair", null)}
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
                        className="md:hidden overflow-hidden border-t border-border/60"
                    >
                        <div className="px-4 py-3">
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={searchValue}
                                    placeholder={resolverCopy("cabecalho.buscar", null)}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    className="w-full h-10 pl-9 pr-9 rounded-full bg-background border border-input text-[14px] text-foreground placeholder-muted-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/20 transition-all duration-200"
                                />
                                {searchValue ? (
                                    <button
                                        onClick={() => onSearchChange("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setMobileSearchOpen(false)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5 text-muted-foreground" />
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
