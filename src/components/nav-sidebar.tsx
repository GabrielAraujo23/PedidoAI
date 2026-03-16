"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Package,
    Users,
    Store,
    ChevronRight,
    LogOut,
    MessageSquare,
    ShieldCheck,
    ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Package, label: "Pedidos", href: "/pedidos" },
    { icon: Users, label: "Clientes", href: "/clientes" },
    { icon: ShoppingBag, label: "Produtos", href: "/produtos" },
    { icon: MessageSquare, label: "Chat Inteligente", href: "/chat" },
    { icon: Store, label: "Informações da Loja", href: "/loja" },
];

export function NavSidebar() {
    const pathname = usePathname();
    const { adminSession, signOut } = useAuth();

    const displayEmail = adminSession?.email ?? "";
    const initial = displayEmail.charAt(0).toUpperCase();

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white/50 backdrop-blur-lg border-r border-white/20 flex flex-col p-6 z-50">
            <div className="mb-10 flex items-center gap-2">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                    <span className="text-white font-bold text-xl">P</span>
                </div>
                <h1 className="text-xl font-bold text-secondary">PedidoAI</h1>
            </div>

            <nav className="flex-1 space-y-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link key={item.href} href={item.href}>
                            <div className={cn(
                                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300",
                                isActive
                                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                                    : "text-muted-foreground hover:bg-white/80 hover:text-secondary"
                            )}>
                                <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "group-hover:text-primary")} />
                                <span className="font-medium">{item.label}</span>
                                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto space-y-3 border-t border-white/20 pt-5">
                {/* Admin info */}
                <div className="flex items-center gap-3 px-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold text-sm">{initial}</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-secondary truncate">{displayEmail}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <ShieldCheck className="w-3 h-3 text-primary" />
                            <span className="text-[10px] text-muted-foreground">Administrador</span>
                        </div>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl"
                    onClick={signOut}
                >
                    <LogOut className="w-5 h-5" />
                    <span>Sair</span>
                </Button>
            </div>
        </aside>
    );
}
