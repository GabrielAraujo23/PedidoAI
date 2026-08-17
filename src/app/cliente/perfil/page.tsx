"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    User, Package, MapPin, Settings,
    ChevronRight, Bell, Moon, LogOut, Star,
    CheckCircle, Truck, Clock, Home, Briefcase,
    ArrowUpRight, Check, Loader2, X,
    RotateCcw, AlertCircle, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolverCopy } from "@/lib/copy";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientHeader } from "@/components/client-header";
import { useCart } from "@/context/CartContext";
import { useClientSession } from "@/lib/client-session";
import { sanitizeExternalText, LIMITS } from "@/lib/validators";
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

interface AddrFields {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
}
const EMPTY_ADDR: AddrFields = { street: "", neighborhood: "", city: "", state: "" };

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

function maskPhone(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (!d) return "";
    if (d.length <= 2)  return `(${d}`;
    if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const STATUS_CONFIG: Record<Status, { label: string; tone: string; Icon: typeof Clock }> = {
    novo:       { label: "Pendente",   tone: "bg-chart-2/10 text-chart-2 border-chart-2/20",     Icon: Clock },
    confirmado: { label: "Confirmado", tone: "bg-chart-4/10 text-chart-4 border-chart-4/20",  Icon: CheckCircle },
    rota:       { label: "Em rota",    tone: "bg-chart-5/10 text-chart-5 border-chart-5/20", Icon: Truck },
    entregue:   { label: "Entregue",   tone: "bg-success-surface text-success border-success/30", Icon: Star },
    cancelado:  { label: "Cancelado",  tone: "bg-destructive-surface text-destructive border-destructive/30",             Icon: X },
};

type NavItem = "perfil" | "pedidos" | "enderecos" | "configuracoes";

const NAV_ITEMS: { id: NavItem; label: string; Icon: typeof User }[] = [
    { id: "perfil",        label: resolverCopy("perfil.meu_perfil", null),     Icon: User },
    { id: "pedidos",       label: resolverCopy("perfil.meus_pedidos", null),   Icon: Package },
    { id: "enderecos",     label: resolverCopy("perfil.enderecos", null),      Icon: MapPin },
    { id: "configuracoes", label: resolverCopy("perfil.preferencias", null),   Icon: Settings },
];

const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-muted-foreground";
const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };

export default function ProfilePage() {
    const { session, loading: sessionLoading, logout, refresh } = useClientSession();
    const [mounted, setMounted] = useState(false);
    const [client, setClient] = useState<ClientData | null>(null);
    const [orders, setOrders] = useState<OrderSummary[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [activeNav, setActiveNav] = useState<NavItem>("perfil");
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(false);

    // Edit profile state
    const [editing, setEditing]         = useState(false);
    const [editName, setEditName]       = useState("");
    const [editPhone, setEditPhone]     = useState("");
    const [saving, setSaving]           = useState(false);
    const [saveError, setSaveError]     = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // CEP state
    const [cep, setCep]                 = useState("");
    const [cepStatus, setCepStatus]     = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError]       = useState("");
    const [addrFields, setAddrFields]   = useState<AddrFields>(EMPTY_ADDR);
    const [numberField, setNumberField] = useState("");
    const fetchedCepRef                 = useRef("");
    const repeatTimeoutRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Repeat order state
    const [repeating, setRepeating]         = useState<string | null>(null);
    const [repeatWarning, setRepeatWarning] = useState<{ orderId: string; skipped: string[] } | null>(null);
    const [repeatError, setRepeatError]     = useState<{ orderId: string; message: string } | null>(null);

    const { clearCart, addItem, updateQuantity } = useCart();
    const router = useRouter();

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        return () => {
            if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!session) return;

        fetch("/api/cliente/perfil")
            .then((r) => r.json())
            .then((j) => {
                if (j.client) setClient(j.client as ClientData);
                setOrders((j.orders as OrderSummary[]) ?? []);
            })
            .catch((e) => console.error("[perfil] load:", e))
            .finally(() => setLoadingOrders(false));
    }, [session]);

    async function handleLogout() {
        clearCart();
        await logout();
    }

    function startEdit() {
        setEditName(session!.name);
        setEditPhone(client?.phone ?? "");
        setCep(""); setCepStatus("idle"); setCepError("");
        setAddrFields(EMPTY_ADDR); setNumberField("");
        setSaveError(null); setSaveSuccess(false);
        setEditing(true);
    }

    function cancelEdit() {
        setEditing(false);
        setSaveError(null);
    }

    async function fetchCep(digits: string) {
        setCepStatus("loading"); setCepError("");
        const ac    = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8_000);
        try {
            const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ac.signal });
            const data = await res.json() as Record<string, string>;
            if (fetchedCepRef.current !== digits) return;
            if (data.erro) { setCepStatus("error"); setCepError("CEP não encontrado."); return; }
            setAddrFields({
                street:       sanitizeExternalText(data.logradouro, LIMITS.street),
                neighborhood: sanitizeExternalText(data.bairro,     LIMITS.neighborhood),
                city:         sanitizeExternalText(data.localidade,  LIMITS.city),
                state:        sanitizeExternalText(data.uf,          LIMITS.state),
            });
            setCepStatus("ok");
        } catch {
            if (fetchedCepRef.current === digits) {
                setCepStatus("error"); setCepError("CEP não encontrado.");
            }
        } finally { clearTimeout(timer); }
    }

    function handleCepChange(raw: string) {
        const masked = maskCep(raw);
        setCep(masked); setAddrFields(EMPTY_ADDR); setCepStatus("idle"); setCepError("");
        const digits = masked.replace(/\D/g, "");
        if (digits.length === 8) { fetchedCepRef.current = digits; fetchCep(digits); }
        else fetchedCepRef.current = "";
    }

    async function saveProfile() {
        setSaving(true); setSaveError(null);
        const body: Record<string, unknown> = { name: editName, phone: editPhone };
        if (cepStatus === "ok" && addrFields.street) {
            body.address = [
                addrFields.street, numberField.trim(),
                addrFields.neighborhood, `${addrFields.city}/${addrFields.state}`,
            ].filter(Boolean).join(", ");
        }
        const res = await fetch("/api/cliente/perfil", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(body),
        }).catch(() => null);
        if (!res) { setSaveError("Erro de rede. Tente novamente."); setSaving(false); return; }
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok) { setSaveError(data.error ?? "Erro ao salvar."); setSaving(false); return; }
        await refresh();
        const reload = await fetch("/api/cliente/perfil").then((r) => r.json()).catch(() => null);
        if (reload?.client) setClient(reload.client as ClientData);
        setSaving(false); setEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    }

    async function handleRepeat(orderId: string) {
        setRepeating(orderId);
        setRepeatWarning(null);
        setRepeatError(null);

        let payload: { items: { product_id: string; name: string; unit: string; price: number; quantity: number }[]; skipped: string[] };
        try {
            const res = await fetch(`/api/cliente/pedido/${encodeURIComponent(orderId)}/repetir`);
            const json = await res.json();
            if (!res.ok) {
                setRepeatError({ orderId, message: json.error ?? "Erro ao repetir pedido." });
                setRepeating(null);
                return;
            }
            payload = json;
        } catch {
            setRepeatError({ orderId, message: "Erro ao carregar itens do pedido." });
            setRepeating(null);
            return;
        }

        const { items: toAdd, skipped } = payload;

        if (toAdd.length === 0) {
            setRepeatError({ orderId, message: "Nenhum produto disponível para repetir." });
            setRepeating(null);
            return;
        }

        clearCart();
        for (const item of toAdd) {
            addItem({ product_id: item.product_id, name: item.name, unit: item.unit, price: item.price });
            updateQuantity(item.product_id, item.quantity);
        }

        setRepeating(null);

        if (skipped.length > 0) {
            setRepeatWarning({ orderId, skipped });
            if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
            repeatTimeoutRef.current = setTimeout(() => router.push("/cliente/catalogo"), 2000);
        } else {
            router.push("/cliente/catalogo");
        }
    }

    if (!mounted || sessionLoading || !session) return null;

    const memberSince = client?.created_at ? formatDate(client.created_at) : "—";
    const initials = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

    const savedAddresses = client?.address
        ? [{ label: "Casa", icon: Home, address: client.address }]
        : [];

    return (
        <div
            className="min-h-screen relative bg-warm"
            style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            <ClientHeader session={session} />

            <main className="relative z-10 max-w-[1280px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-24">

                {/* Page heading */}
                <header className="mb-10 max-w-[820px]">
                    <p className={cn(eyebrowClass, "mb-3")}>{resolverCopy("perfil.sua_conta", null)}</p>
                    <h1
                        className="text-[40px] sm:text-[52px] leading-[0.96] tracking-tight text-foreground"
                        style={sectionTitleStyle}
                    >
                        Olá,{" "}
                        <em className="font-medium text-primary" style={{ fontStyle: "italic" }}>
                            {session.name.split(" ")[0]}
                        </em>
                    </h1>
                    <p className="text-[14px] text-muted-foreground mt-3 leading-relaxed">
                        Acompanhe seus pedidos, gerencie endereços e ajuste suas preferências.
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">

                    {/* ── Sidebar ────────────────────────────────────────── */}
                    <aside className="lg:sticky lg:top-24 lg:self-start space-y-5">

                        {/* Profile card */}
                        <div className="bg-card rounded-2xl border border-border/70 p-5">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-full bg-foreground flex items-center justify-center shrink-0">
                                    <span
                                        className="text-background text-[15px] font-medium"
                                        style={{ fontFamily: "var(--font-display)" }}
                                    >
                                        {initials}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-foreground truncate">{session.name}</p>
                                    <p className="text-[11.5px] text-muted-foreground truncate">{client?.phone ?? "—"}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-5 pt-5 border-t border-border">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70">{resolverCopy("perfil.pedidos_rotulo", null)}</p>
                                    <p
                                        className="text-foreground tabular-nums leading-none mt-1"
                                        style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "20px" }}
                                    >
                                        {orders.length}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70">{resolverCopy("perfil.membro_rotulo", null)}</p>
                                    <p className="text-[12px] text-foreground leading-none mt-1.5">
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
                                        onClick={() => { setActiveNav(id); setRepeatError(null); }}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all duration-200 text-left group",
                                            isActive
                                                ? "bg-foreground text-background shadow-[0_2px_10px_rgba(28,25,23,0.18)]"
                                                : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                                        )}
                                    >
                                        <Icon className={cn(
                                            "w-4 h-4 shrink-0 transition-colors",
                                            isActive ? "text-background/80" : "text-muted-foreground/70 group-hover:text-foreground"
                                        )} />
                                        <span className="font-medium flex-1">{label}</span>
                                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-background/60" />}
                                    </button>
                                );
                            })}

                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] text-muted-foreground hover:text-destructive hover:bg-destructive-surface/60 transition-colors text-left mt-3"
                            >
                                <LogOut className="w-4 h-4 shrink-0" />
                                <span className="font-medium">{resolverCopy("perfil.sair_da_conta", null)}</span>
                            </button>
                        </nav>
                    </aside>

                    {/* ── Main content ───────────────────────────────────── */}
                    <div className="space-y-6 min-w-0">

                        {/* ── Meu Perfil ── */}
                        {activeNav === "perfil" && (
                            <>
                                {/* Hero card */}
                                <section className="bg-card rounded-2xl border border-border/70 p-7">
                                    <div className="flex items-start justify-between gap-4 mb-7">
                                        <div className="min-w-0">
                                            <p className={eyebrowClass}>{resolverCopy("perfil.identidade", null)}</p>
                                            <h2
                                                className="text-[26px] tracking-tight text-foreground mt-1"
                                                style={sectionTitleStyle}
                                            >
                                                {session.name}
                                            </h2>
                                            <p className="text-[12.5px] text-muted-foreground mt-1.5">Membro desde {memberSince}</p>
                                        </div>
                                        <button
                                            onClick={() => setActiveNav("configuracoes")}
                                            className="text-[12px] uppercase tracking-[0.18em] font-semibold text-foreground/70 hover:text-foreground inline-flex items-center gap-1 shrink-0"
                                        >
                                            Editar
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>

                                    <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                                        <div>
                                            <dt className={eyebrowClass}>{resolverCopy("perfil.telefone", null)}</dt>
                                            <dd className="text-[14px] text-foreground mt-1">{client?.phone ?? "—"}</dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>{resolverCopy("perfil.endereco", null)}</dt>
                                            <dd className="text-[14px] text-foreground mt-1 truncate" title={client?.address ?? undefined}>
                                                {client?.address ?? <span className="italic text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>{resolverCopy("perfil.nao_informado", null)}</span>}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>{resolverCopy("perfil.total_de_pedidos", null)}</dt>
                                            <dd
                                                className="text-foreground tabular-nums mt-1 leading-none"
                                                style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "22px" }}
                                            >
                                                {orders.length}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className={eyebrowClass}>{resolverCopy("perfil.membro_desde", null)}</dt>
                                            <dd className="text-[14px] text-foreground mt-1">{memberSince}</dd>
                                        </div>
                                    </dl>
                                </section>

                                {/* Recent orders */}
                                <section className="bg-card rounded-2xl border border-border/70 p-7">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <p className={eyebrowClass}>{resolverCopy("perfil.historico", null)}</p>
                                            <h2
                                                className="text-[22px] tracking-tight text-foreground mt-0.5"
                                                style={sectionTitleStyle}
                                            >
                                                {resolverCopy("perfil.seus_pedidos_recentes", null)}
                                            </h2>
                                        </div>
                                        <button
                                            onClick={() => setActiveNav("pedidos")}
                                            className="text-[12px] uppercase tracking-[0.18em] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
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
                                                        className="group rounded-xl border border-border/70 p-4 hover:border-muted-foreground hover:bg-muted/40 transition-all"
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70">
                                                                #ORD-{order.id.padStart(4, "0")}
                                                            </p>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/70 transition-all duration-200 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                                        </div>
                                                        <p className="text-[12.5px] text-foreground mb-3 line-clamp-2 leading-relaxed">{order.products}</p>
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[11px] text-muted-foreground">{formatShortDate(order.created_at)}</p>
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
                            <section className="bg-card rounded-2xl border border-border/70 p-7">
                                <div className="mb-6">
                                    <p className={eyebrowClass}>{resolverCopy("perfil.historico", null)}</p>
                                    <h2
                                        className="text-[26px] tracking-tight text-foreground mt-0.5"
                                        style={sectionTitleStyle}
                                    >
                                        {resolverCopy("perfil.meus_pedidos_section", null)}
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
                                    <ul className="divide-y divide-border">
                                        {orders.map((order) => {
                                            const cfg = STATUS_CONFIG[order.status];
                                            const Icon = cfg.Icon;
                                            return (
                                                <li key={order.id}>
                                                    <Link
                                                        href={`/cliente/pedido/${order.id}`}
                                                        className="flex items-center gap-4 pt-4 pb-2 group"
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                            <Package className="w-4 h-4 text-muted-foreground" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70">
                                                                    #ORD-{order.id.padStart(4, "0")}
                                                                </p>
                                                                <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.tone)}>
                                                                    <Icon className="w-2.5 h-2.5" />
                                                                    {cfg.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-[13.5px] text-foreground truncate">{order.products}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-[11px] text-muted-foreground">{formatShortDate(order.created_at)}</p>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/70 transition-all duration-200 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ml-auto mt-1" />
                                                        </div>
                                                    </Link>

                                                    <div className="pb-3 pl-14 flex flex-col gap-1" aria-live="polite">
                                                        {repeating === order.id ? (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/70">
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Repetindo...
                                                            </span>
                                                        ) : (
                                                            <button
                                                                aria-label={`Repetir pedido #ORD-${order.id.padStart(4, "0")}`}
                                                                onClick={() => handleRepeat(order.id)}
                                                                disabled={repeating !== null}
                                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                type="button"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                                Repetir
                                                            </button>
                                                        )}
                                                        {repeatWarning?.orderId === order.id && (
                                                            <p className="text-xs text-warning flex items-center gap-1">
                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                {repeatWarning.skipped.length} produto(s) indisponível(is) ignorado(s). Redirecionando...
                                                            </p>
                                                        )}
                                                        {repeatError?.orderId === order.id && (
                                                            <p className="text-xs text-destructive flex items-center gap-1">
                                                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                                                {repeatError.message}
                                                            </p>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>
                        )}

                        {/* ── Endereços ── */}
                        {activeNav === "enderecos" && (
                            <section className="bg-card rounded-2xl border border-border/70 p-7">
                                <div className="mb-6">
                                    <p className={eyebrowClass}>{resolverCopy("perfil.locais_salvos", null)}</p>
                                    <h2
                                        className="text-[26px] tracking-tight text-foreground mt-0.5"
                                        style={sectionTitleStyle}
                                    >
                                        {resolverCopy("perfil.enderecos_section", null)}
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
                                            <div key={label} className="flex items-center gap-4 p-4 border border-border/70 rounded-xl">
                                                <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center shrink-0">
                                                    <Icon className="w-4 h-4 text-background/80" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[14px] font-semibold text-foreground">{label}</p>
                                                        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-success bg-success-surface border border-success/30 px-2 py-0.5 rounded-full">
                                                            {resolverCopy("perfil.principal", null)}
                                                        </span>
                                                    </div>
                                                    <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{address}</p>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="flex items-center gap-4 p-4 border border-dashed border-border rounded-xl text-muted-foreground/70">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                <Briefcase className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-[13.5px] font-medium text-muted-foreground">{resolverCopy("perfil.trabalho", null)}</p>
                                                <p className="text-[11.5px]">{resolverCopy("perfil.adicionar_endereco_trabalho", null)}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ── Configurações ── */}
                        {activeNav === "configuracoes" && (
                            <div className="space-y-5">
                                <section className="bg-card rounded-2xl border border-border/70 p-7">
                                    <div className="mb-5">
                                        <p className={eyebrowClass}>{resolverCopy("perfil.preferencias", null)}</p>
                                        <h2
                                            className="text-[22px] tracking-tight text-foreground mt-0.5"
                                            style={sectionTitleStyle}
                                        >
                                            {resolverCopy("perfil.ajustes_rapidos", null)}
                                        </h2>
                                    </div>

                                    <ul className="divide-y divide-border">
                                        <li className="flex items-center justify-between py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                                                    <Bell className="w-4 h-4 text-foreground" />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-semibold text-foreground">{resolverCopy("perfil.notificacoes", null)}</p>
                                                    <p className="text-[12px] text-muted-foreground">{resolverCopy("perfil.receber_atualizacoes", null)}</p>
                                                </div>
                                            </div>
                                            <Toggle on={notifications} onChange={() => setNotifications(!notifications)} />
                                        </li>
                                        <li className="flex items-center justify-between py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                                                    <Moon className="w-4 h-4 text-foreground" />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-semibold text-foreground">{resolverCopy("perfil.modo_escuro", null)}</p>
                                                    <p className="text-[12px] text-muted-foreground italic" style={{ fontFamily: "var(--font-display)" }}>
                                                        {resolverCopy("perfil.em_breve", null)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Toggle on={darkMode} disabled onChange={() => setDarkMode(!darkMode)} />
                                        </li>
                                    </ul>
                                </section>

                                <section className="bg-card rounded-2xl border border-border/70 p-7">
                                    <div className="flex items-start justify-between gap-4 mb-5">
                                        <div>
                                            <p className={eyebrowClass}>{resolverCopy("perfil.conta", null)}</p>
                                            <h2
                                                className="text-[22px] tracking-tight text-foreground mt-0.5"
                                                style={sectionTitleStyle}
                                            >
                                                {resolverCopy("perfil.informacoes_pessoais", null)}
                                            </h2>
                                        </div>
                                        {!editing && (
                                            <button
                                                onClick={startEdit}
                                                className="text-[12px] uppercase tracking-[0.18em] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0 transition-colors"
                                            >
                                                Editar
                                                <ChevronRight className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    {!editing ? (
                                        <div className="space-y-4">
                                            <dl className="space-y-4">
                                                <div>
                                                    <dt className={eyebrowClass}>{resolverCopy("perfil.nome_completo", null)}</dt>
                                                    <dd className="text-[14px] text-foreground mt-1">{session.name}</dd>
                                                </div>
                                                <div>
                                                    <dt className={eyebrowClass}>{resolverCopy("perfil.telefone", null)}</dt>
                                                    <dd className="text-[14px] text-foreground mt-1">{client?.phone ?? "—"}</dd>
                                                </div>
                                                <div>
                                                    <dt className={eyebrowClass}>{resolverCopy("perfil.endereco_principal", null)}</dt>
                                                    <dd className="text-[14px] text-foreground mt-1">
                                                        {client?.address ?? (
                                                            <span className="italic text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                                                                {resolverCopy("perfil.nao_informado", null)}
                                                            </span>
                                                        )}
                                                    </dd>
                                                </div>
                                            </dl>
                                            {saveSuccess && (
                                                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-success-surface border border-success/30 text-success text-[13px] font-medium animate-in fade-in duration-300">
                                                    <Check className="w-4 h-4 text-success shrink-0" />
                                                    {resolverCopy("perfil.dados_atualizados", null)}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div>
                                                <label htmlFor="edit-name" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-1.5">
                                                    {resolverCopy("perfil.nome_completo_asterisco", null)}
                                                </label>
                                                <input
                                                    id="edit-name"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    maxLength={LIMITS.name}
                                                    placeholder={resolverCopy("perfil.placeholder_nome", null)}
                                                    className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-ring focus:ring-4 focus:ring-ring/20"
                                                />
                                            </div>

                                            <div>
                                                <label htmlFor="edit-phone" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-1.5">
                                                    {resolverCopy("perfil.telefone_asterisco", null)}
                                                </label>
                                                <input
                                                    id="edit-phone"
                                                    value={editPhone}
                                                    onChange={(e) => setEditPhone(maskPhone(e.target.value))}
                                                    inputMode="tel"
                                                    maxLength={15}
                                                    placeholder={resolverCopy("perfil.placeholder_telefone", null)}
                                                    className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-ring focus:ring-4 focus:ring-ring/20"
                                                />
                                            </div>

                                            <div>
                                                <label htmlFor="edit-cep" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-1.5">
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {resolverCopy("perfil.novo_cep", null)}{" "}
                                                        <span className="normal-case tracking-normal font-normal text-muted-foreground/70">
                                                            {resolverCopy("perfil.cep_opcional", null)}
                                                        </span>
                                                    </span>
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        id="edit-cep"
                                                        type="text"
                                                        inputMode="numeric"
                                                        placeholder={resolverCopy("perfil.placeholder_cep", null)}
                                                        maxLength={9}
                                                        value={cep}
                                                        onChange={(e) => handleCepChange(e.target.value)}
                                                        className={cn(
                                                            "w-full h-11 px-3.5 pr-10 rounded-xl border bg-background text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-all",
                                                            cepStatus === "error"
                                                                ? "border-destructive/40 focus:border-destructive/60 focus:ring-4 focus:ring-destructive/10"
                                                                : cepStatus === "ok"
                                                                ? "border-success/60 focus:border-success focus:ring-4 focus:ring-success/10"
                                                                : "border-input focus:border-ring focus:ring-4 focus:ring-ring/20"
                                                        )}
                                                    />
                                                    {cepStatus === "loading" && (
                                                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 animate-spin" />
                                                    )}
                                                    {cepStatus === "ok" && (
                                                        <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-success" strokeWidth={3} />
                                                    )}
                                                </div>
                                                {cepStatus === "error" && (
                                                    <p className="text-[12px] text-destructive mt-1">{cepError}</p>
                                                )}
                                            </div>

                                            {cepStatus === "ok" && addrFields.street && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-3 bg-muted/80 rounded-xl p-4 border border-border">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 mb-0.5">{resolverCopy("perfil.endereco_label", null)}</p>
                                                        <p className="text-[13px] text-foreground leading-snug">
                                                            {addrFields.street}
                                                            {addrFields.neighborhood && (
                                                                <span className="text-muted-foreground">, {addrFields.neighborhood}</span>
                                                            )}
                                                        </p>
                                                        <p className="text-[12px] text-muted-foreground">{addrFields.city}/{addrFields.state}</p>
                                                    </div>
                                                    <div>
                                                        <label htmlFor="edit-number" className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 block mb-1">
                                                            {resolverCopy("perfil.numero", null)}
                                                        </label>
                                                        <input
                                                            id="edit-number"
                                                            type="text"
                                                            placeholder={resolverCopy("perfil.placeholder_numero", null)}
                                                            value={numberField}
                                                            onChange={(e) => setNumberField(e.target.value)}
                                                            maxLength={LIMITS.address_number}
                                                            className="h-10 px-3.5 max-w-[160px] rounded-xl border border-input bg-background text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-ring focus:ring-4 focus:ring-ring/20"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {saveError && (
                                                <p className="text-[12px] text-destructive">{saveError}</p>
                                            )}

                                            <div className="flex items-center justify-end gap-3 pt-1">
                                                <button
                                                    onClick={cancelEdit}
                                                    disabled={saving}
                                                    className="h-10 px-4 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                                >
                                                    {resolverCopy("perfil.cancelar", null)}
                                                </button>
                                                <button
                                                    onClick={saveProfile}
                                                    disabled={saving || cepStatus === "loading"}
                                                    className="h-10 px-6 bg-foreground text-background rounded-xl text-[13px] font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_2px_8px_rgba(28,25,23,0.18)]"
                                                >
                                                    {saving ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> {resolverCopy("perfil.salvando", null)}</>
                                                    ) : (
                                                        resolverCopy("perfil.salvar_alteracoes", null)
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2 h-12 border border-destructive/30 text-destructive rounded-xl text-[13px] font-semibold uppercase tracking-wider hover:bg-destructive-surface transition-colors"
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
                on ? "bg-foreground" : "bg-muted",
                disabled && "opacity-40 cursor-not-allowed"
            )}
        >
            <span className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-all",
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
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Package className="w-5 h-5 text-muted-foreground/70" />
            </div>
            <p
                className="text-[20px] tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
            >
                {label}
            </p>
            <p className="text-[13px] text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">{help}</p>
            {ctaHref && ctaLabel && (
                <Link
                    href={ctaHref}
                    className="inline-flex items-center gap-1.5 mt-5 text-[12px] uppercase tracking-[0.2em] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                    {ctaLabel}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
            )}
        </div>
    );
}
