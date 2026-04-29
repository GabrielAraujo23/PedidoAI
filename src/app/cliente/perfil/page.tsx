"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    User, Package, MapPin, Settings,
    ChevronRight, Bell, Moon, LogOut, Star,
    CheckCircle, Truck, Clock, Home, Briefcase,
    ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientHeader } from "@/components/client-header";
import { useCart } from "@/context/CartContext";
import { useClientSession } from "@/lib/client-session";
import type { Status } from "@/lib/types";

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

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
    });
}

function formatShortDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "short",
    });
}

const STATUS_CONFIG: Record<Status, { label: string; tone: string; Icon: typeof Clock }> = {
    novo:       { label: "Pendente",   tone: "bg-amber-50 text-amber-700 border-amber-200/60",     Icon: Clock },
    confirmado: { label: "Confirmado", tone: "bg-orange-50 text-orange-700 border-orange-200/60",  Icon: CheckCircle },
    rota:       { label: "Em rota",    tone: "bg-violet-50 text-violet-700 border-violet-200/60", Icon: Truck },
    entregue:   { label: "Entregue",   tone: "bg-emerald-50 text-emerald-700 border-emerald-200/60", Icon: Star },
};

type NavItem = "perfil" | "pedidos" | "enderecos" | "configuracoes";

const NAV_ITEMS: { id: NavItem; label: string; Icon: typeof User }[] = [
    { id: "perfil",        label: "Meu perfil",     Icon: User },
    { id: "pedidos",       label: "Meus pedidos",   Icon: Package },
    { id: "enderecos",     label: "Endereços",      Icon: MapPin },
    { id: "configuracoes", label: "Preferências",   Icon: Settings },
];

const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";
const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };

export default function ProfilePage() {
    const { session, loading: sessionLoading, logout } = useClientSession();
    const [mounted, setMounted] = useState(false);
    const [client, setClient] = useState<ClientData | null>(null);
    const [orders, setOrders] = useState<OrderSummary[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [activeNav, setActiveNav] = useState<NavItem>("perfil");
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(false);

    const { clearCart } = useCart();

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!session) return;

        supabase
            .from("clients")
            .select("id, name, phone, address, created_at")
            .eq("id", session.clientId)
            .single()
            .then(({ data }) => {
                if (data) setClient(data as ClientData);
            });

        supabase
            .from("orders")
            .select("id, products, status, created_at")
            .eq("client_id", session.clientId)
            .order("created_at", { ascending: false })
            .limit(8)
            .then(({ data }) => {
                setOrders((data as OrderSummary[]) ?? []);
                setLoadingOrders(false);
            });
    }, [session]);

    async function handleLogout() {
        clearCart();
        await logout();
    }

    if (!mounted || sessionLoading || !session) return null;

    const memberSince = client?.created_at ? formatDate(client.created_at) : "—";
    const initials = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

    const savedAddresses = client?.address
        ? [{ label: "Casa", icon: Home, address: client.address }]
        : [];

    return (
        <div
            className="min-h-screen relative"
            style={{ background: "#F7F2EA", fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            {/* Background grain */}
            <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
                <svg className="absolute inset-0 w-full h-full opacity-[0.13] mix-blend-overlay" xmlns="http://www.w3.org/2000/svg">
                    <filter id="grain-perfil">
                        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
                        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
                    </filter>
                    <rect width="100%" height="100%" filter="url(#grain-perfil)" />
                </svg>
            </div>

            <ClientHeader session={session} />

            <main className="relative z-10 max-w-[1280px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-24">

                {/* Page heading */}
                <header className="mb-10 max-w-[820px]">
                    <p className={cn(eyebrowClass, "mb-3")}>Sua conta</p>
                    <h1
                        className="text-[40px] sm:text-[52px] leading-[0.96] tracking-tight text-stone-900"
                        style={sectionTitleStyle}
                    >
                        Olá,{" "}
                        <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>
                            {session.name.split(" ")[0]}
                        </em>
                    </h1>
                    <p className="text-[14px] text-stone-600 mt-3 leading-relaxed">
                        Acompanhe seus pedidos, gerencie endereços e ajuste suas preferências.
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">

                    {/* ── Sidebar ────────────────────────────────────────── */}
                    <aside className="lg:sticky lg:top-24 lg:self-start space-y-5">

                        {/* Profile card */}
                        <div className="bg-white rounded-2xl border border-stone-200/70 p-5">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-full bg-stone-900 flex items-center justify-center shrink-0">
                                    <span
                                        className="text-white text-[15px] font-medium"
                                        style={{ fontFamily: "var(--font-display)" }}
                                    >
                                        {initials}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-stone-900 truncate">{session.name}</p>
                                    <p className="text-[11.5px] text-stone-500 truncate">{client?.phone ?? "—"}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-5 pt-5 border-t border-stone-100">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">Pedidos</p>
                                    <p
                                        className="text-stone-900 tabular-nums leading-none mt-1"
                                        style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "20px" }}
                                    >
                                        {orders.length}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">Membro</p>
                                    <p className="text-[12px] text-stone-700 leading-none mt-1.5">
                                        {client?.created_at
                                            ? new Date(client.created_at).getFullYear()
                                            : "—"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Nav */}
                        <nav className="space-y-0.5">
                            {NAV_ITEMS.map(({ id, label, Icon }) => {
                                const isActive = activeNav === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => setActiveNav(id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all duration-200 text-left group",
                                            isActive
                                                ? "bg-stone-900 text-white shadow-[0_2px_10px_rgba(28,25,23,0.18)]"
                                                : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                                        )}
                                    >
                                        <Icon className={cn(
                                            "w-4 h-4 shrink-0 transition-colors",
                                            isActive ? "text-orange-400" : "text-stone-400 group-hover:text-stone-700"
                                        )} />
                                        <span className="font-medium flex-1">{label}</span>
                                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/60" />}
                                    </button>
                                );
                            })}

                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] text-stone-500 hover:text-red-700 hover:bg-red-50/60 transition-colors text-left mt-3"
                            >
                                <LogOut className="w-4 h-4 shrink-0" />
                                <span className="font-medium">Sair da conta</span>
                            </button>
                        </nav>
                    </aside>

                    {/* ── Main content ───────────────────────────────────── */}
                    <div className="space-y-6 min-w-0">

                        {/* ── Meu Perfil ── */}
                        {activeNav === "perfil" && (
                            <>
                                {/* Hero card */}
                                <section className="bg-white rounded-2xl border border-stone-200/70 p-7">
                                    <div className="flex items-start justify-between gap-4 mb-7">
                                        <div className="min-w-0">
                                            <p className={eyebrowClass}>Identidade</p>
                                            <h2
                                                className="text-[26px] tracking-tight text-stone-900 mt-1"
                                                style={sectionTitleStyle}
                                            >
                                                {session.name}
                                            </h2>
                                            <p className="text-[12.5px] text-stone-500 mt-1.5">Membro desde {memberSince}</p>
                                        </div>
                                        <button
                                            onClick={() => setActiveNav("configuracoes")}
                                            className="text-[12px] uppercase tracking-[0.18em] font-semibold text-stone-700 hover:text-stone-900 inline-flex items-center gap-1 shrink-0"
                                        >
                                            Editar
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>

                                    <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                                        <div>
                                            <dt className={eyebrowClass}>Telefone</dt>
                                            <dd className="text-[14px] text-stone-900 mt-1">{client?.phone ?? "—"}</dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>Endereço</dt>
                                            <dd className="text-[14px] text-stone-900 mt-1 truncate" title={client?.address ?? undefined}>
                                                {client?.address ?? <span className="italic text-stone-500" style={{ fontFamily: "var(--font-display)" }}>Não informado</span>}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>Total de pedidos</dt>
                                            <dd
                                                className="text-stone-900 tabular-nums mt-1 leading-none"
                                                style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "22px" }}
                                            >
                                                {orders.length}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>Membro desde</dt>
                                            <dd className="text-[14px] text-stone-900 mt-1">{memberSince}</dd>
                                        </div>
                                    </dl>
                                </section>

                                {/* Recent orders */}
                                <section className="bg-white rounded-2xl border border-stone-200/70 p-7">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <p className={eyebrowClass}>Histórico</p>
                                            <h2
                                                className="text-[22px] tracking-tight text-stone-900 mt-0.5"
                                                style={sectionTitleStyle}
                                            >
                                                Seus pedidos recentes
                                            </h2>
                                        </div>
                                        <button
                                            onClick={() => setActiveNav("pedidos")}
                                            className="text-[12px] uppercase tracking-[0.18em] font-semibold text-stone-600 hover:text-stone-900 inline-flex items-center gap-1"
                                        >
                                            Ver todos
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>

                                    {loadingOrders ? (
                                        <div className="grid sm:grid-cols-3 gap-3">
                                            {Array.from({ length: 3 }).map((_, i) => (
                                                <Skeleton key={i} className="h-24 rounded-xl" />
                                            ))}
                                        </div>
                                    ) : orders.length === 0 ? (
                                        <EmptyState
                                            label="Nenhum pedido por aqui."
                                            help="Quando você fizer um pedido, ele aparece nesta lista."
                                            ctaHref="/cliente/catalogo"
                                            ctaLabel="Ir para o catálogo"
                                        />
                                    ) : (
                                        <div className="grid sm:grid-cols-3 gap-3">
                                            {orders.slice(0, 3).map((order) => {
                                                const cfg = STATUS_CONFIG[order.status];
                                                const Icon = cfg.Icon;
                                                return (
                                                    <Link
                                                        key={order.id}
                                                        href={`/cliente/pedido/${order.id}`}
                                                        className="group rounded-xl border border-stone-200/70 p-4 hover:border-stone-400 hover:bg-stone-50/40 transition-all"
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">
                                                                #ORD-{order.id.padStart(4, "0")}
                                                            </p>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 transition-all duration-200 group-hover:text-stone-900 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                                        </div>
                                                        <p className="text-[12.5px] text-stone-700 mb-3 line-clamp-2 leading-relaxed">{order.products}</p>
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[11px] text-stone-500">{formatShortDate(order.created_at)}</p>
                                                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.tone)}>
                                                                <Icon className="w-2.5 h-2.5" />
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </>
                        )}

                        {/* ── Meus Pedidos ── */}
                        {activeNav === "pedidos" && (
                            <section className="bg-white rounded-2xl border border-stone-200/70 p-7">
                                <div className="mb-6">
                                    <p className={eyebrowClass}>Histórico</p>
                                    <h2
                                        className="text-[26px] tracking-tight text-stone-900 mt-0.5"
                                        style={sectionTitleStyle}
                                    >
                                        Meus pedidos
                                    </h2>
                                </div>

                                {loadingOrders ? (
                                    <div className="space-y-3">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <Skeleton key={i} className="h-20 rounded-xl" />
                                        ))}
                                    </div>
                                ) : orders.length === 0 ? (
                                    <EmptyState
                                        label="Nenhum pedido ainda."
                                        help="Sua jornada começa no catálogo."
                                        ctaHref="/cliente/catalogo"
                                        ctaLabel="Fazer primeiro pedido"
                                    />
                                ) : (
                                    <ul className="divide-y divide-stone-100">
                                        {orders.map((order) => {
                                            const cfg = STATUS_CONFIG[order.status];
                                            const Icon = cfg.Icon;
                                            return (
                                                <li key={order.id}>
                                                    <Link
                                                        href={`/cliente/pedido/${order.id}`}
                                                        className="flex items-center gap-4 py-4 group"
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                                                            <Package className="w-4 h-4 text-stone-600" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">
                                                                    #ORD-{order.id.padStart(4, "0")}
                                                                </p>
                                                                <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.tone)}>
                                                                    <Icon className="w-2.5 h-2.5" />
                                                                    {cfg.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-[13.5px] text-stone-700 truncate">{order.products}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-[11px] text-stone-500">{formatShortDate(order.created_at)}</p>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 transition-all duration-200 group-hover:text-stone-900 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ml-auto mt-1" />
                                                        </div>
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>
                        )}

                        {/* ── Endereços ── */}
                        {activeNav === "enderecos" && (
                            <section className="bg-white rounded-2xl border border-stone-200/70 p-7">
                                <div className="mb-6">
                                    <p className={eyebrowClass}>Locais salvos</p>
                                    <h2
                                        className="text-[26px] tracking-tight text-stone-900 mt-0.5"
                                        style={sectionTitleStyle}
                                    >
                                        Endereços
                                    </h2>
                                </div>

                                {savedAddresses.length === 0 ? (
                                    <EmptyState
                                        label="Nenhum endereço salvo."
                                        help="Seu endereço será salvo automaticamente quando você finalizar seu primeiro pedido."
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {savedAddresses.map(({ label, icon: Icon, address }) => (
                                            <div key={label} className="flex items-center gap-4 p-4 border border-stone-200/70 rounded-xl">
                                                <div className="w-10 h-10 rounded-full bg-stone-900 flex items-center justify-center shrink-0">
                                                    <Icon className="w-4 h-4 text-orange-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[14px] font-semibold text-stone-900">{label}</p>
                                                        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                                                            Principal
                                                        </span>
                                                    </div>
                                                    <p className="text-[12px] text-stone-500 mt-0.5 truncate">{address}</p>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="flex items-center gap-4 p-4 border border-dashed border-stone-300 rounded-xl text-stone-400">
                                            <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                                                <Briefcase className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-[13.5px] font-medium text-stone-500">Trabalho</p>
                                                <p className="text-[11.5px]">Adicionar endereço de trabalho</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ── Configurações ── */}
                        {activeNav === "configuracoes" && (
                            <div className="space-y-5">
                                <section className="bg-white rounded-2xl border border-stone-200/70 p-7">
                                    <div className="mb-5">
                                        <p className={eyebrowClass}>Preferências</p>
                                        <h2
                                            className="text-[22px] tracking-tight text-stone-900 mt-0.5"
                                            style={sectionTitleStyle}
                                        >
                                            Ajustes rápidos
                                        </h2>
                                    </div>

                                    <ul className="divide-y divide-stone-100">
                                        <li className="flex items-center justify-between py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center">
                                                    <Bell className="w-4 h-4 text-stone-700" />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-semibold text-stone-900">Notificações</p>
                                                    <p className="text-[12px] text-stone-500">Receber atualizações de pedido</p>
                                                </div>
                                            </div>
                                            <Toggle on={notifications} onChange={() => setNotifications(!notifications)} />
                                        </li>
                                        <li className="flex items-center justify-between py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center">
                                                    <Moon className="w-4 h-4 text-stone-700" />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-semibold text-stone-900">Modo escuro</p>
                                                    <p className="text-[12px] text-stone-500 italic" style={{ fontFamily: "var(--font-display)" }}>
                                                        em breve
                                                    </p>
                                                </div>
                                            </div>
                                            <Toggle on={darkMode} disabled onChange={() => setDarkMode(!darkMode)} />
                                        </li>
                                    </ul>
                                </section>

                                <section className="bg-white rounded-2xl border border-stone-200/70 p-7">
                                    <div className="mb-5">
                                        <p className={eyebrowClass}>Conta</p>
                                        <h2
                                            className="text-[22px] tracking-tight text-stone-900 mt-0.5"
                                            style={sectionTitleStyle}
                                        >
                                            Informações pessoais
                                        </h2>
                                    </div>

                                    <dl className="space-y-4">
                                        <div>
                                            <dt className={eyebrowClass}>Nome completo</dt>
                                            <dd className="text-[14px] text-stone-900 mt-1">{session.name}</dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>Telefone</dt>
                                            <dd className="text-[14px] text-stone-900 mt-1">{client?.phone ?? "—"}</dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>Endereço principal</dt>
                                            <dd className="text-[14px] text-stone-900 mt-1">
                                                {client?.address ?? <span className="italic text-stone-500" style={{ fontFamily: "var(--font-display)" }}>Não informado</span>}
                                            </dd>
                                        </div>
                                    </dl>

                                    <p className="text-[11.5px] text-stone-500 mt-6 leading-relaxed">
                                        Para atualizar seus dados, entre em contato com a loja.
                                    </p>
                                </section>

                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2 h-12 border border-red-200 text-red-700 rounded-xl text-[13px] font-semibold uppercase tracking-wider hover:bg-red-50 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sair da conta
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

/* ─── Reusable bits ─────────────────────────────────────────────────────── */

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
    return (
        <button
            onClick={disabled ? undefined : onChange}
            disabled={disabled}
            className={cn(
                "w-11 h-6 rounded-full transition-colors relative shrink-0",
                on ? "bg-stone-900" : "bg-stone-300",
                disabled && "opacity-40 cursor-not-allowed"
            )}
        >
            <span className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                on ? "left-[22px]" : "left-0.5"
            )} />
        </button>
    );
}

function EmptyState({
    label,
    help,
    ctaHref,
    ctaLabel,
}: {
    label: string;
    help: string;
    ctaHref?: string;
    ctaLabel?: string;
}) {
    return (
        <div className="text-center py-12">
            <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
                <Package className="w-5 h-5 text-stone-400" />
            </div>
            <p
                className="text-[20px] tracking-tight text-stone-900"
                style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
            >
                {label}
            </p>
            <p className="text-[13px] text-stone-500 mt-2 max-w-sm mx-auto leading-relaxed">{help}</p>
            {ctaHref && ctaLabel && (
                <Link
                    href={ctaHref}
                    className="inline-flex items-center gap-1.5 mt-5 text-[12px] uppercase tracking-[0.2em] font-semibold text-orange-700 hover:text-orange-900 transition-colors"
                >
                    {ctaLabel}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
            )}
        </div>
    );
}
