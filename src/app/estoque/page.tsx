// src/app/estoque/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Package, TrendingDown, AlertTriangle, DollarSign,
    History, ArrowUpCircle, ArrowDownCircle, Settings2,
    ChevronLeft, ChevronRight, PackagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { StockBadge } from "@/components/stock-badge";
import type { Product, StockMovement } from "@/lib/types";

const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-muted-foreground";
const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };
const THRESHOLD = 5;
const PAGE_SIZE = 20;

type Tab = "overview" | "history";

export default function EstoquePage() {
    const { adminSession } = useAuth();
    const [tab, setTab] = useState<Tab>("overview");
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [movPage, setMovPage] = useState(0);
    const [movTotal, setMovTotal] = useState(0);
    const [adjustingId, setAdjustingId] = useState<string | null>(null);
    const [adjustQty, setAdjustQty] = useState("");
    const [adjustNotes, setAdjustNotes] = useState("");
    const [adjusting, setAdjusting] = useState(false);

    useEffect(() => {
        if (!adminSession) return;
        loadProducts();
    }, [adminSession]);

    useEffect(() => {
        if (!adminSession || tab !== "history") return;
        loadMovements();
    }, [adminSession, tab, movPage]);

    async function loadProducts() {
        setLoading(true);
        try {
            const res = await fetch("/api/estoque?view=produtos");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
            setProducts((json.products ?? []) as Product[]);
        } catch (e) {
            console.error("[estoque] loadProducts:", e);
        } finally {
            setLoading(false);
        }
    }

    async function loadMovements() {
        try {
            const res = await fetch(`/api/estoque?view=movimentacoes&page=${movPage}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
            setMovements((json.movements ?? []) as StockMovement[]);
            setMovTotal(json.total ?? 0);
        } catch (e) {
            console.error("[estoque] loadMovements:", e);
        }
    }

    async function handleAdjust(productId: string) {
        const qty = parseInt(adjustQty);
        if (isNaN(qty) || qty < 0 || !adjustNotes.trim()) return;
        setAdjusting(true);

        const res = await fetch("/api/estoque/ajuste", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product_id: productId,
                quantity: qty,
                mode: "set",
                notes: adjustNotes.trim(),
            }),
        });

        if (res.ok) {
            await loadProducts();
            setAdjustingId(null);
            setAdjustQty("");
            setAdjustNotes("");
        }
        setAdjusting(false);
    }

    const totalValue = products.reduce((s, p) => s + p.stock_quantity * p.price, 0);
    const zerados = products.filter((p) => p.stock_quantity === 0).length;
    const baixos = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= THRESHOLD).length;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-end justify-between gap-4">
                <div>
                    <p className={cn(eyebrowClass, "mb-3")}>Controle</p>
                    <h1 className="text-[40px] leading-[0.96] tracking-tight text-foreground" style={sectionTitleStyle}>
                        Estoque
                    </h1>
                </div>
                <Link
                    href="/estoque/receber"
                    className="inline-flex items-center gap-2 h-10 px-4 bg-foreground text-background rounded-xl text-[13px] font-semibold hover:opacity-90 transition-colors shrink-0"
                >
                    <PackagePlus className="w-4 h-4" />
                    Receber Mercadoria
                </Link>
            </header>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "SKUs ativos", value: products.length, icon: Package, gradient: "from-foreground to-foreground/85" },
                    { label: "Estoque baixo", value: baixos, icon: AlertTriangle, gradient: "from-warning to-warning/70" },
                    { label: "Zerados", value: zerados, icon: TrendingDown, gradient: "from-destructive to-destructive/70" },
                    { label: "Valor em estoque", value: `R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, gradient: "from-success to-success/70" },
                ].map(({ label, value, icon: Icon, gradient }) => (
                    <div key={label} className={cn("relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ring-1 ring-border/60", gradient)}>
                        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                            <Icon className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-white tabular-nums leading-none text-[28px]" style={sectionTitleStyle}>{value}</p>
                        <p className="text-[11.5px] font-medium text-white/75 mt-1.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
                {(["overview", "history"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
                            tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t === "overview" ? "Visão Geral" : "Histórico"}
                    </button>
                ))}
            </div>

            {/* Overview tab */}
            {tab === "overview" && (
                <div className="bg-card rounded-2xl border border-border/70 overflow-hidden">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Produto</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider hidden md:table-cell">Categoria</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Estoque</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider hidden lg:table-cell">Preço unit.</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        <td className="px-5 py-3" colSpan={5}>
                                            <div className="h-4 bg-muted rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : products.map((p) => (
                                <tr key={p.id} className="hover:bg-muted/60 transition-colors">
                                    <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                                    <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{p.category}</td>
                                    <td className="px-5 py-3">
                                        {adjustingId === p.id ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <input
                                                    type="number" min={0}
                                                    value={adjustQty}
                                                    onChange={(e) => setAdjustQty(e.target.value)}
                                                    className="w-20 h-8 px-2 rounded-lg border border-input text-[13px] focus:outline-none focus:border-ring"
                                                    placeholder="Qtd"
                                                    autoFocus
                                                />
                                                <input
                                                    type="text"
                                                    value={adjustNotes}
                                                    onChange={(e) => setAdjustNotes(e.target.value)}
                                                    className="w-36 h-8 px-2 rounded-lg border border-input text-[13px] focus:outline-none focus:border-ring"
                                                    placeholder="Motivo"
                                                />
                                                <button
                                                    onClick={() => handleAdjust(p.id)}
                                                    disabled={adjusting}
                                                    className="h-8 px-3 bg-foreground text-background rounded-lg text-[12px] font-semibold disabled:opacity-50"
                                                >
                                                    {adjusting ? "..." : "Salvar"}
                                                </button>
                                                <button onClick={() => setAdjustingId(null)} className="h-8 px-2 text-muted-foreground/70 hover:text-muted-foreground text-[12px]">
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : (
                                            <StockBadge quantity={p.stock_quantity} threshold={THRESHOLD} />
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground hidden lg:table-cell">
                                        R$ {p.price.toFixed(2).replace(".", ",")}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                setAdjustingId(p.id);
                                                setAdjustQty(String(p.stock_quantity));
                                                setAdjustNotes("");
                                            }}
                                            className="text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors font-medium flex items-center gap-1 ml-auto"
                                        >
                                            <Settings2 className="w-3.5 h-3.5" />
                                            Ajustar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* History tab */}
            {tab === "history" && (
                <div className="bg-card rounded-2xl border border-border/70 overflow-hidden">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Data</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Produto</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Tipo</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Qtd</th>
                                <th className="px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider hidden md:table-cell">Referência</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {movements.map((m) => (
                                <tr key={m.id} className="hover:bg-muted/60 transition-colors">
                                    <td className="px-5 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                                        {new Date(m.created_at).toLocaleDateString("pt-BR")}
                                    </td>
                                    <td className="px-5 py-3 font-medium text-foreground truncate max-w-[180px]">{m.product_name}</td>
                                    <td className="px-5 py-3">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                                            m.type === "entrada" ? "bg-success-surface text-success border-success/30" :
                                            m.type === "saida"   ? "bg-destructive-surface text-destructive border-destructive/30" :
                                                                   "bg-chart-2/10 text-chart-2 border-chart-2/20"
                                        )}>
                                            {m.type === "entrada" ? <ArrowUpCircle className="w-3 h-3" /> : m.type === "saida" ? <ArrowDownCircle className="w-3 h-3" /> : <Settings2 className="w-3 h-3" />}
                                            {m.type === "entrada" ? "Entrada" : m.type === "saida" ? "Saída" : "Ajuste"}
                                        </span>
                                    </td>
                                    <td className={cn("px-5 py-3 tabular-nums font-semibold", m.quantity >= 0 ? "text-success" : "text-destructive")}>
                                        {m.quantity >= 0 ? "+" : ""}{m.quantity}
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{m.reference ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="border-t border-border px-5 py-3 flex items-center justify-between">
                        <span className="text-[12px] text-muted-foreground">{movTotal} movimentos</span>
                        <div className="flex gap-1">
                            <button onClick={() => setMovPage((p) => Math.max(0, p - 1))} disabled={movPage === 0} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button onClick={() => setMovPage((p) => p + 1)} disabled={(movPage + 1) * PAGE_SIZE >= movTotal} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
