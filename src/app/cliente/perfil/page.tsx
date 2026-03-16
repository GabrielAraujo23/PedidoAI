"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    User, Package, MapPin, Settings,
    ChevronRight, Bell, Moon, LogOut, Star,
    CheckCircle, Truck, Clock, Home, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientHeader } from "@/components/client-header";
import type { ClientSession } from "@/lib/auth-context";
import type { Status } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderSummary {
    id: string;
    products: string;
    status: Status;
    created_at: string;
}

interface ClientData {
    id: string;
    name: string;
    phone: string;
    address: string | null;
    created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "short", year: "numeric",
    });
}

function formatShortDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "short",
    });
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; Icon: typeof Clock }> = {
    novo:       { label: "Pendente",    color: "bg-yellow-100 text-yellow-700", Icon: Clock },
    confirmado: { label: "Confirmado",  color: "bg-orange-100 text-orange-700", Icon: CheckCircle },
    rota:       { label: "Em Entrega",  color: "bg-blue-100 text-blue-700",     Icon: Truck },
    entregue:   { label: "Entregue",    color: "bg-green-100 text-green-700",   Icon: Star },
};

// ── Sidebar nav ────────────────────────────────────────────────────────────────

type NavItem = "perfil" | "pedidos" | "enderecos" | "configuracoes";

const NAV_ITEMS: { id: NavItem; label: string; Icon: typeof User }[] = [
    { id: "perfil",        label: "Meu Perfil",    Icon: User },
    { id: "pedidos",       label: "Meus Pedidos",  Icon: Package },
    { id: "enderecos",     label: "Endereços",     Icon: MapPin },
    { id: "configuracoes", label: "Configurações", Icon: Settings },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [client, setClient] = useState<ClientData | null>(null);
    const [orders, setOrders] = useState<OrderSummary[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [activeNav, setActiveNav] = useState<NavItem>("perfil");
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(false);

    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const raw = localStorage.getItem("pedidoai_client_session");
        if (!raw) { router.push("/login"); return; }

        const sess = JSON.parse(raw) as ClientSession;
        setSession(sess);

        // Fetch client data
        supabase
            .from("clients")
            .select("id, name, phone, address, created_at")
            .eq("id", sess.clientId)
            .single()
            .then(({ data }) => {
                if (data) setClient(data as ClientData);
            });

        // Fetch last 6 orders
        supabase
            .from("orders")
            .select("id, products, status, created_at")
            .eq("client_id", sess.clientId)
            .order("created_at", { ascending: false })
            .limit(6)
            .then(({ data }) => {
                setOrders((data as OrderSummary[]) ?? []);
                setLoadingOrders(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleLogout() {
        localStorage.removeItem("pedidoai_client_session");
        localStorage.removeItem("pedidoai_cart");
        router.push("/login");
    }

    if (!mounted || !session) return null;

    const memberSince = client?.created_at ? formatDate(client.created_at) : "—";
    const initials = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

    // Parsed addresses from address string (comma split as simple approach)
    const savedAddresses = client?.address
        ? [{ label: "Casa", icon: Home, address: client.address }]
        : [];

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            <ClientHeader />

            <div className="max-w-[1280px] mx-auto px-4 py-6">
                <div className="flex flex-col lg:flex-row gap-6">

                    {/* ── Left sidebar ────────────────────────────────────── */}
                    <div className="w-full lg:w-64 shrink-0">
                        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden sticky top-20">

                            {/* Avatar + name */}
                            <div className="bg-gradient-to-br from-[#F97316] to-[#FB923C] px-5 py-6 text-center">
                                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 border-2 border-white/40">
                                    <span className="text-white font-bold text-xl">{initials}</span>
                                </div>
                                <p className="font-bold text-white text-sm">{session.name}</p>
                                <p className="text-white/70 text-xs mt-0.5">{client?.phone ?? "—"}</p>
                            </div>

                            {/* Nav items */}
                            <nav className="p-2">
                                {NAV_ITEMS.map(({ id, label, Icon }) => (
                                    <button
                                        key={id}
                                        onClick={() => setActiveNav(id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                                            activeNav === id
                                                ? "bg-[#F97316]/10 text-[#F97316]"
                                                : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
                                        )}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        {label}
                                        {activeNav === id && <ChevronRight className="w-3 h-3 ml-auto" />}
                                    </button>
                                ))}

                                <div className="border-t border-[#E5E7EB] mt-2 pt-2">
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#6B7280] hover:text-red-500 hover:bg-red-50 transition-colors text-left"
                                    >
                                        <LogOut className="w-4 h-4 shrink-0" />
                                        Sair
                                    </button>
                                </div>
                            </nav>
                        </div>
                    </div>

                    {/* ── Main content ─────────────────────────────────────── */}
                    <div className="flex-1 space-y-5">

                        {/* ── Meu Perfil ── */}
                        {activeNav === "perfil" && (
                            <>
                                {/* Profile card */}
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 rounded-full bg-[#F97316]/10 flex items-center justify-center border-2 border-[#F97316]/20">
                                                <span className="text-[#F97316] font-bold text-xl">{initials}</span>
                                            </div>
                                            <div>
                                                <h1 className="font-bold text-xl text-[#111827]">{session.name}</h1>
                                                <p className="text-sm text-[#6B7280] mt-0.5">Membro desde {memberSince}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setActiveNav("configuracoes")}
                                            className="flex items-center gap-2 px-4 py-2 border-2 border-[#F97316] text-[#F97316] rounded-full text-sm font-bold hover:bg-[#F97316]/5 transition-colors"
                                        >
                                            Editar Perfil
                                        </button>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="bg-[#F9FAFB] rounded-lg p-4">
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">TELEFONE</p>
                                            <p className="text-sm font-semibold text-[#111827]">{client?.phone ?? "—"}</p>
                                        </div>
                                        <div className="bg-[#F9FAFB] rounded-lg p-4">
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">ENDEREÇO</p>
                                            <p className="text-sm font-semibold text-[#111827] truncate">{client?.address ?? "Não informado"}</p>
                                        </div>
                                        <div className="bg-[#F9FAFB] rounded-lg p-4">
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">TOTAL DE PEDIDOS</p>
                                            <p className="text-sm font-semibold text-[#111827]">{orders.length}</p>
                                        </div>
                                        <div className="bg-[#F9FAFB] rounded-lg p-4">
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">MEMBRO DESDE</p>
                                            <p className="text-sm font-semibold text-[#111827]">{memberSince}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent orders */}
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="font-bold text-[#111827]">Seus Pedidos</h2>
                                        <button
                                            onClick={() => setActiveNav("pedidos")}
                                            className="text-sm text-[#F97316] hover:underline font-medium"
                                        >
                                            Ver todos
                                        </button>
                                    </div>

                                    {loadingOrders ? (
                                        <div className="grid sm:grid-cols-3 gap-3">
                                            {Array.from({ length: 3 }).map((_, i) => (
                                                <Skeleton key={i} className="h-28 rounded-xl" />
                                            ))}
                                        </div>
                                    ) : orders.length === 0 ? (
                                        <div className="text-center py-8">
                                            <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                            <p className="text-sm text-[#6B7280]">Nenhum pedido ainda.</p>
                                            <Link href="/cliente/chat" className="text-sm text-[#F97316] hover:underline mt-1 inline-block">
                                                Fazer primeiro pedido
                                            </Link>
                                        </div>
                                    ) : (
                                        <div className="grid sm:grid-cols-3 gap-3">
                                            {orders.slice(0, 3).map((order) => {
                                                const cfg = STATUS_CONFIG[order.status];
                                                const Icon = cfg.Icon;
                                                return (
                                                    <Link
                                                        key={order.id}
                                                        href={`/cliente/pedido/${order.id}`}
                                                        className="border border-[#E5E7EB] rounded-xl p-4 hover:border-[#F97316]/40 hover:shadow-sm transition-all group"
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-bold text-[#6B7280]">#{order.id}</p>
                                                            <ChevronRight className="w-3 h-3 text-[#6B7280] group-hover:text-[#F97316] transition-colors" />
                                                        </div>
                                                        <p className="text-xs text-[#6B7280] mb-3 line-clamp-2">{order.products}</p>
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[10px] text-[#9CA3AF]">{formatShortDate(order.created_at)}</p>
                                                            <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", cfg.color)}>
                                                                <Icon className="w-2.5 h-2.5" />
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* ── Meus Pedidos ── */}
                        {activeNav === "pedidos" && (
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                <h2 className="font-bold text-[#111827] mb-4">Meus Pedidos</h2>

                                {loadingOrders ? (
                                    <div className="space-y-3">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <Skeleton key={i} className="h-20 rounded-xl" />
                                        ))}
                                    </div>
                                ) : orders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="font-bold text-[#111827]">Nenhum pedido ainda</p>
                                        <Link href="/cliente/chat" className="text-sm text-[#F97316] hover:underline mt-1 inline-block">
                                            Fazer meu primeiro pedido
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {orders.map((order) => {
                                            const cfg = STATUS_CONFIG[order.status];
                                            const Icon = cfg.Icon;
                                            return (
                                                <Link
                                                    key={order.id}
                                                    href={`/cliente/pedido/${order.id}`}
                                                    className="flex items-center gap-4 p-4 border border-[#E5E7EB] rounded-xl hover:border-[#F97316]/40 hover:shadow-sm transition-all group"
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-[#F97316]/10 flex items-center justify-center shrink-0">
                                                        <Package className="w-5 h-5 text-[#F97316]" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <p className="font-semibold text-sm text-[#111827]">Pedido #{order.id}</p>
                                                            <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", cfg.color)}>
                                                                <Icon className="w-2.5 h-2.5" />
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-[#6B7280] truncate">{order.products}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-xs text-[#9CA3AF]">{formatShortDate(order.created_at)}</p>
                                                        <ChevronRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#F97316] transition-colors mt-1 ml-auto" />
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Endereços ── */}
                        {activeNav === "enderecos" && (
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="font-bold text-[#111827]">Endereços Salvos</h2>
                                </div>

                                {savedAddresses.length === 0 ? (
                                    <div className="text-center py-12">
                                        <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="font-bold text-[#111827]">Nenhum endereço salvo</p>
                                        <p className="text-sm text-[#6B7280] mt-1">Seu endereço de entrega será salvo automaticamente ao fazer um pedido.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {savedAddresses.map(({ label, icon: Icon, address }) => (
                                            <div key={label} className="flex items-center gap-4 p-4 border border-[#E5E7EB] rounded-xl">
                                                <div className="w-10 h-10 rounded-full bg-[#F97316]/10 flex items-center justify-center shrink-0">
                                                    <Icon className="w-5 h-5 text-[#F97316]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm text-[#111827]">{label}</p>
                                                    <p className="text-xs text-[#6B7280] truncate">{address}</p>
                                                </div>
                                                <span className="text-[10px] font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full">
                                                    Principal
                                                </span>
                                            </div>
                                        ))}

                                        {/* Work placeholder */}
                                        <div className="flex items-center gap-4 p-4 border border-dashed border-[#E5E7EB] rounded-xl text-[#9CA3AF]">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                <Briefcase className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Trabalho</p>
                                                <p className="text-xs">Adicionar endereço de trabalho</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Configurações ── */}
                        {activeNav === "configuracoes" && (
                            <div className="space-y-4">
                                {/* Preferences */}
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                    <h2 className="font-bold text-[#111827] mb-4">Configurações Rápidas</h2>
                                    <div className="space-y-4">

                                        <div className="flex items-center justify-between py-2 border-b border-[#E5E7EB]">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                                                    <Bell className="w-4 h-4 text-blue-500" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-[#111827]">Notificações</p>
                                                    <p className="text-xs text-[#6B7280]">Receber atualizações de pedido</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setNotifications(!notifications)}
                                                className={cn(
                                                    "w-11 h-6 rounded-full transition-colors relative",
                                                    notifications ? "bg-[#F97316]" : "bg-gray-200"
                                                )}
                                            >
                                                <span className={cn(
                                                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                                                    notifications ? "left-[22px]" : "left-0.5"
                                                )} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between py-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                                                    <Moon className="w-4 h-4 text-purple-500" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-[#111827]">Modo Escuro</p>
                                                    <p className="text-xs text-[#6B7280]">Em breve</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setDarkMode(!darkMode)}
                                                disabled
                                                className={cn(
                                                    "w-11 h-6 rounded-full transition-colors relative opacity-40 cursor-not-allowed",
                                                    darkMode ? "bg-[#F97316]" : "bg-gray-200"
                                                )}
                                            >
                                                <span className={cn(
                                                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                                                    darkMode ? "left-[22px]" : "left-0.5"
                                                )} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Account info */}
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                    <h2 className="font-bold text-[#111827] mb-4">Informações da Conta</h2>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">NOME COMPLETO</p>
                                            <p className="text-sm text-[#111827]">{session.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">TELEFONE</p>
                                            <p className="text-sm text-[#111827]">{client?.phone ?? "—"}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">ENDEREÇO PRINCIPAL</p>
                                            <p className="text-sm text-[#111827]">{client?.address ?? "Não informado"}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-[#9CA3AF] mt-4">
                                        Para atualizar seus dados, entre em contato com a loja.
                                    </p>
                                </div>

                                {/* Logout */}
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2 h-11 border-2 border-red-200 text-red-500 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sair da conta
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
