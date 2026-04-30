"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Package,
    Users,
    Store,
    LogOut,
    MessageSquare,
    ShieldCheck,
    ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const menuItems = [
    { icon: LayoutDashboard,  label: "Dashboard",        href: "/" },
    { icon: Package,          label: "Pedidos",          href: "/pedidos" },
    { icon: Users,            label: "Clientes",         href: "/clientes" },
    { icon: ShoppingBag,      label: "Produtos",         href: "/produtos" },
    { icon: MessageSquare,    label: "Chat Inteligente", href: "/chat" },
    { icon: Store,            label: "Loja",             href: "/loja" },
];

export function NavSidebar() {
    const pathname = usePathname();
    const { adminSession, signOut } = useAuth();

    const displayEmail = adminSession?.email ?? "";
    const initial = displayEmail.charAt(0).toUpperCase();

    return (
        <aside
            className="fixed left-0 top-0 h-screen w-64 flex flex-col p-5 z-50"
            style={{
                background: "rgba(247, 242, 234, 0.96)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderRight: "1px solid rgba(120, 113, 108, 0.16)",
                fontFamily: "var(--font-body), ui-sans-serif, system-ui",
            }}
        >
            {/* Brand */}
            <Link href="/" className="mb-10 flex items-center group">
                <img src="/Logo_PedidoAi.png" alt="PedidoAI" className="h-24 w-auto object-contain transition-transform group-hover:scale-105" />
            </Link>

            {/* Section label */}
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-stone-400 px-2 mb-2">
                Menu
            </p>

            <nav className="flex-1 space-y-0.5">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-[13.5px]",
                                isActive
                                    ? "bg-stone-900 text-white shadow-[0_2px_10px_rgba(28,25,23,0.18)]"
                                    : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                            )}
                        >
                            <Icon className={cn(
                                "w-4 h-4 shrink-0 transition-colors",
                                isActive ? "text-orange-400" : "text-stone-400 group-hover:text-stone-700"
                            )} />
                            <span className="font-medium flex-1">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="mt-6 pt-5 border-t border-stone-200/60 space-y-3">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-9 h-9 rounded-full bg-stone-900 flex items-center justify-center shrink-0">
                        <span
                            className="text-white text-[13px] font-medium"
                            style={{ fontFamily: "var(--font-display)" }}
                        >
                            {initial}
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-stone-900 truncate">{displayEmail}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <ShieldCheck className="w-3 h-3 text-orange-700" />
                            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-semibold">
                                Administrador
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={signOut}
                    className="w-full inline-flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12.5px] text-stone-500 hover:text-red-700 hover:bg-red-50/60 transition-colors"
                >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span className="font-medium">Sair</span>
                </button>
            </div>
        </aside>
    );
}
