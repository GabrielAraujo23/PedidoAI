"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Package,
    Users,
    Store,
    LogOut,
    ShieldCheck,
    ShoppingBag,
    Warehouse,
    X,
    PhoneCall,
    ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { BrandMark } from "@/components/brand-mark";
import { PoweredBy } from "@/components/powered-by";

const menuItems = [
    { icon: LayoutDashboard,  label: "Dashboard",        href: "/" },
    { icon: Package,          label: "Pedidos",          href: "/pedidos" },
    { icon: Users,            label: "Clientes",         href: "/clientes" },
    { icon: ShoppingBag,      label: "Produtos",         href: "/produtos" },
    { icon: Warehouse,        label: "Estoque",          href: "/estoque" },
    { icon: PhoneCall,        label: "Atendimento",      href: "/atendimento" },
    { icon: Store,            label: "Loja",             href: "/loja" },
];

/**
 * Item exclusivo do dono do sistema. Fica fora de `menuItems` porque não é
 * "mais uma tela do painel": é a administração do PedidoAI em si, e um lojista
 * não deve nem descobrir que ela existe. Esconder é cosmético — quem impede o
 * acesso é o requireOwner() no servidor, que confere o papel no banco.
 */
const OWNER_ITEM = {
    icon: ClipboardCheck, label: "Contratações", href: "/pedido-ai-admin/contratacoes",
};

interface NavSidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export function NavSidebar({ isOpen = false, onClose }: NavSidebarProps) {
    const pathname = usePathname();
    const { adminSession, signOut } = useAuth();

    const displayEmail = adminSession?.email ?? "";
    const initial = displayEmail.charAt(0).toUpperCase();
    const isOwner = adminSession?.role === "owner";

    // Contratações esperando decisão. Não existe e-mail neste projeto, então
    // este número é o único aviso de que alguém pediu para contratar — sem ele
    // o dono só descobre um pedido novo se lembrar de abrir a fila.
    const [pendentes, setPendentes] = useState(0);

    useEffect(() => {
        if (!isOwner) return;
        fetch("/api/pedido-ai-admin/contratacoes?status=pendente")
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { contratacoes?: unknown[] } | null) => setPendentes(d?.contratacoes?.length ?? 0))
            .catch(() => { /* o menu funciona sem o contador */ });
        // `pathname` na dependência: o número é relido a cada navegação, então
        // aprovar alguém na fila e sair da tela já mostra o contador certo.
    }, [isOwner, pathname]);

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 h-screen w-64 flex flex-col p-5 z-50 transition-transform duration-300",
                "lg:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
            style={{
                background: "rgba(247, 242, 234, 0.96)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderRight: "1px solid rgba(120, 113, 108, 0.16)",
                fontFamily: "var(--font-body), ui-sans-serif, system-ui",
            }}
        >
            {/* Close button — mobile only */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>

            {/* Brand */}
            <Link href="/" onClick={onClose} className="mb-10 flex items-center group">
                <BrandMark className="w-[220px] max-h-[60px] transition-transform group-hover:scale-105" textClassName="text-[22px]" />
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
                            onClick={onClose}
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

                {isOwner && (
                    <>
                        <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-stone-400 px-2 pt-5 pb-2">
                            Sistema
                        </p>
                        <Link
                            href={OWNER_ITEM.href}
                            onClick={onClose}
                            className={cn(
                                "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-[13.5px]",
                                pathname === OWNER_ITEM.href
                                    ? "bg-stone-900 text-white shadow-[0_2px_10px_rgba(28,25,23,0.18)]"
                                    : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                            )}
                        >
                            <OWNER_ITEM.icon className={cn(
                                "w-4 h-4 shrink-0 transition-colors",
                                pathname === OWNER_ITEM.href ? "text-orange-400" : "text-stone-400 group-hover:text-stone-700"
                            )} />
                            <span className="font-medium flex-1">{OWNER_ITEM.label}</span>
                            {pendentes > 0 && (
                                <span
                                    className="min-w-[20px] h-5 px-1.5 rounded-full bg-orange-600 text-white text-[11px] font-semibold flex items-center justify-center"
                                    title={`${pendentes} contratação(ões) aguardando decisão`}
                                >
                                    {pendentes}
                                </span>
                            )}
                        </Link>
                    </>
                )}
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

                <PoweredBy className="justify-center pt-1" />
            </div>
        </aside>
    );
}
