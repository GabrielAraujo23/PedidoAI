"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Package, Users, Truck, Clock, ArrowUpRight,
    TrendingUp, ShoppingBag, ChevronRight,
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Order, Status } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

// Mesma paleta de 5 status do kanban (kanban-item.tsx / kanban-board.tsx),
// src/app/pedidos/page.tsx e src/app/clientes/page.tsx.
const STATUS_CONFIG: Record<Status, { label: string; tone: string }> = {
    novo:       { label: "Novo",       tone: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
    confirmado: { label: "Confirmado", tone: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
    rota:       { label: "Em rota",    tone: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
    entregue:   { label: "Entregue",   tone: "bg-success-surface text-success border-success/30" },
    cancelado:  { label: "Cancelado",  tone: "bg-destructive-surface text-destructive border-destructive/30" },
};


interface DashboardStats {
    totalOrders: number;
    totalClients: number;
    rotaCount: number;
    novoCount: number;
    recentOrders: Order[];
}

const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-muted-foreground";
const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };

export default function DashboardPage() {
    const { adminSession } = useAuth();
    const [stats, setStats] = useState<DashboardStats>({
        totalOrders: 0,
        totalClients: 0,
        rotaCount: 0,
        novoCount: 0,
        recentOrders: [],
    });
    const [chartData, setChartData] = useState<{ name: string; pedidos: number }[]>([]);

    useEffect(() => {
        if (!adminSession) return;
        async function load() {
            let payload: {
                orders: { id: string; client: string; products: string; status: string }[];
                clientsCount: number;
                weekOrders: { created_at: string }[];
            };
            try {
                const res = await fetch("/api/dashboard");
                const json = await res.json();
                if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
                payload = json;
            } catch (e) {
                console.error("[dashboard] load:", e);
                return;
            }

            const { orders, clientsCount, weekOrders } = payload;

            const sorted = [...orders].sort(
                (a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0)
            );
            setStats({
                totalOrders: orders.length,
                totalClients: clientsCount,
                rotaCount: orders.filter((o) => o.status === "rota").length,
                novoCount: orders.filter((o) => o.status === "novo").length,
                recentOrders: sorted.slice(0, 5) as Order[],
            });

            // Build real weekly chart data
            const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
            const today = new Date();
            const weekData = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(today);
                d.setDate(today.getDate() - (6 - i));
                return {
                    name: days[d.getDay()],
                    date: d.toISOString().slice(0, 10),
                    pedidos: 0,
                };
            });

            weekOrders.forEach((o) => {
                const day = o.created_at?.slice(0, 10);
                const entry = weekData.find((w) => w.date === day);
                if (entry) entry.pedidos++;
            });

            setChartData(weekData.map(({ name, pedidos }) => ({ name, pedidos })));
        }
        load();
    }, [adminSession]);

    const adminName = adminSession?.email?.split("@")[0] ?? "admin";

    const statCards = [
        {
            label: "Total de pedidos",
            value: stats.totalOrders,
            icon: Package,
            gradient: "from-foreground to-foreground/85",
            iconBg: "bg-white/15",
        },
        {
            label: "Clientes ativos",
            value: stats.totalClients,
            icon: Users,
            gradient: "from-primary to-primary/70",
            iconBg: "bg-white/15",
        },
        {
            label: "Em rota",
            value: stats.rotaCount,
            icon: Truck,
            gradient: "from-chart-5 to-chart-5/70",
            iconBg: "bg-white/15",
        },
        {
            label: "Aguardando",
            value: stats.novoCount,
            icon: Clock,
            gradient: "from-chart-2 to-chart-2/70",
            iconBg: "bg-white/15",
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── Header ── */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <p className={cn(eyebrowClass, "mb-3")}>Bem-vindo, {adminName}</p>
                    <h1
                        className="text-[40px] sm:text-[48px] leading-[0.96] tracking-tight text-foreground"
                        style={sectionTitleStyle}
                    >
                        Sua loja, em{" "}
                        <em className="font-medium text-primary" style={{ fontStyle: "italic" }}>
                            tempo real.
                        </em>
                    </h1>
                    <p className="text-[14px] text-muted-foreground mt-3 leading-relaxed max-w-[520px]">
                        Acompanhe pedidos, clientes e operação de entrega num só lugar.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button className="px-4 h-10 rounded-xl border border-border/70 bg-card/70 text-[13px] font-semibold text-muted-foreground hover:bg-card hover:border-muted-foreground transition-all">
                        Exportar relatório
                    </button>
                    <Link
                        href="/loja"
                        className="group inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-semibold tracking-wide hover:opacity-90 transition-all duration-200 shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
                    >
                        Configurar loja
                        <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                </div>
            </header>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statCards.map(({ label, value, icon: Icon, gradient, iconBg }) => (
                    <div
                        key={label}
                        className={cn(
                            "relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ring-1 ring-border/60 transition-all duration-200 hover:shadow-lg hover:scale-[1.01]",
                            gradient
                        )}
                    >
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-4", iconBg)}>
                            <Icon className="w-5 h-5 text-white" />
                        </div>
                        <p
                            className="text-white tabular-nums leading-none"
                            style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "32px" }}
                        >
                            {value}
                        </p>
                        <p className="text-[11.5px] font-medium text-white/75 mt-1.5">{label}</p>
                        <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />
                    </div>
                ))}
            </div>

            {/* ── Main grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Chart */}
                <section className="lg:col-span-2 bg-card rounded-2xl border border-border/70 overflow-hidden">
                    <header className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-border">
                        <div>
                            <p className={eyebrowClass}>Movimento</p>
                            <h2
                                className="text-[22px] tracking-tight text-foreground mt-0.5"
                                style={sectionTitleStyle}
                            >
                                Visão semanal
                            </h2>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[12px] text-success bg-success-surface/80 border border-success/30 px-2.5 py-1 rounded-full">
                            <TrendingUp className="w-3 h-3" />
                            <span className="font-semibold">{chartData.reduce((s, d) => s + d.pedidos, 0)} esta semana</span>
                        </div>
                    </header>

                    <div className="h-[320px] w-full pt-4 pr-5">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                <defs>
                                    <linearGradient id="warmGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 600 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "var(--muted-foreground)", fillOpacity: 0.7, fontSize: 10 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "var(--popover)",
                                        borderRadius: "12px",
                                        border: "1px solid var(--border)",
                                        color: "var(--popover-foreground)",
                                        fontSize: "12px",
                                        boxShadow: "0 10px 25px -3px rgba(0,0,0,0.2)",
                                    }}
                                    labelStyle={{ color: "var(--muted-foreground)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: "4px" }}
                                    itemStyle={{ color: "var(--chart-1)", fontWeight: 600 }}
                                    cursor={{ stroke: "var(--foreground)", strokeWidth: 1, strokeOpacity: 0.2, strokeDasharray: "3 3" }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="pedidos"
                                    stroke="var(--chart-1)"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#warmGradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Recent Orders */}
                <section className="bg-card rounded-2xl border border-border/70 overflow-hidden flex flex-col">
                    <header className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-border flex-shrink-0">
                        <div>
                            <p className={eyebrowClass}>Histórico</p>
                            <h2
                                className="text-[18px] tracking-tight text-foreground mt-0.5"
                                style={sectionTitleStyle}
                            >
                                Pedidos recentes
                            </h2>
                        </div>
                    </header>

                    <div className="flex-1">
                        {stats.recentOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                                    <ShoppingBag className="w-5 h-5 text-muted-foreground/70" />
                                </div>
                                <p
                                    className="text-[16px] tracking-tight text-foreground"
                                    style={sectionTitleStyle}
                                >
                                    Nenhum pedido ainda.
                                </p>
                                <p className="text-[12px] text-muted-foreground mt-1.5 max-w-[220px] leading-relaxed">
                                    Quando chegar o primeiro pedido, ele aparece aqui.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-border">
                                {stats.recentOrders.map((order) => {
                                    const cfg = STATUS_CONFIG[order.status];
                                    return (
                                        <li key={order.id}>
                                            <Link
                                                href={`/pedidos`}
                                                className="flex items-center gap-3 px-6 py-3.5 group hover:bg-muted/60 transition-colors"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 mb-0.5">
                                                        #ORD-{order.id.padStart(4, "0")}
                                                    </p>
                                                    <p className="text-[13px] font-semibold text-foreground truncate">
                                                        {order.client}
                                                    </p>
                                                </div>
                                                <span className={cn(
                                                    "inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0",
                                                    cfg.tone
                                                )}>
                                                    {cfg.label}
                                                </span>
                                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 transition-all group-hover:text-foreground group-hover:translate-x-0.5" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <Link
                        href="/pedidos"
                        className="border-t border-border px-6 py-3 text-center text-[12px] uppercase tracking-[0.2em] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors group"
                    >
                        Ver todos
                        <ArrowUpRight className="w-3.5 h-3.5 inline ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                </section>
            </div>
        </div>
    );
}
