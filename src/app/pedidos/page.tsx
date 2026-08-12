"use client";

import React, { useState, useEffect, useMemo } from "react";
import { KanbanBoard } from "@/components/kanban-board";
import { cn } from "@/lib/utils";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Search, Plus, Filter, LayoutGrid, List as ListIcon,
    Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    ShoppingCart, CheckCircle2, Truck, PackageCheck, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Order, Status } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

/* ─── Constants ──────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<Status, string> = {
    novo: "Novo",
    confirmado: "Confirmado",
    rota: "Em Rota",
    entregue: "Entregue",
    cancelado: "Cancelado",
};

// Mesma paleta de 5 status do kanban (kanban-item.tsx / kanban-board.tsx):
// novo/confirmado/rota usam os tokens categóricos --chart-2/4/5, entregue e
// cancelado usam os tokens semânticos success/destructive. As duas telas
// mostram os mesmos pedidos e não podem discordar de cor.
const STATUS_COLORS: Record<Status, string> = {
    novo:       "bg-chart-2/10   text-chart-2   border-chart-2/20",
    confirmado: "bg-chart-4/10   text-chart-4   border-chart-4/20",
    rota:       "bg-chart-5/10   text-chart-5   border-chart-5/20",
    entregue:   "bg-success-surface text-success border-success/30",
    cancelado:  "bg-destructive-surface text-destructive border-destructive/30",
};

const STATUS_DOT: Record<Status, string> = {
    novo:       "bg-chart-2",
    confirmado: "bg-chart-4",
    rota:       "bg-chart-5",
    entregue:   "bg-success",
    cancelado:  "bg-destructive",
};

const STAT_CARDS: {
    status: Status | "total";
    label: string;
    icon: React.ElementType;
    gradient: string;
    ring: string;
    text: string;
    iconBg: string;
}[] = [
    {
        status: "total",
        label: "Total de Pedidos",
        icon: ShoppingCart,
        gradient: "from-foreground to-foreground/85",
        ring: "ring-border",
        text: "text-background",
        iconBg: "bg-background/15",
    },
    {
        status: "novo",
        label: "Novos",
        icon: TrendingUp,
        gradient: "from-chart-2 to-chart-2/70",
        ring: "ring-chart-2/20",
        text: "text-white",
        iconBg: "bg-white/15",
    },
    {
        status: "confirmado",
        label: "Confirmados",
        icon: CheckCircle2,
        gradient: "from-chart-4 to-chart-4/70",
        ring: "ring-chart-4/20",
        text: "text-white",
        iconBg: "bg-white/15",
    },
    {
        status: "rota",
        label: "Em Rota",
        icon: Truck,
        gradient: "from-chart-5 to-chart-5/70",
        ring: "ring-chart-5/20",
        text: "text-white",
        iconBg: "bg-white/15",
    },
    {
        status: "entregue",
        label: "Entregues",
        icon: PackageCheck,
        gradient: "from-success to-success/70",
        ring: "ring-success/20",
        text: "text-white",
        iconBg: "bg-white/15",
    },
];

// Paleta decorativa (sem significado de status) para o avatar de iniciais,
// escolhida por hash do nome. A tabela do plano não cobre este caso; reaproveita
// os 5 tokens categóricos --chart-1..5 (mesma família usada nos status) em vez
// de inventar um token novo só para variedade visual.
const AVATAR_COLORS = [
    "bg-chart-1/10 text-chart-1",
    "bg-chart-2/10 text-chart-2",
    "bg-chart-3/10 text-chart-3",
    "bg-chart-4/10 text-chart-4",
    "bg-chart-5/10 text-chart-5",
];

const PAGE_SIZE = 8;

/* ─── Helpers ────────────────────────────────────────────────────────── */

function getAvatarColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
    const p = name.trim().split(" ").filter(Boolean);
    if (!p.length) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function formatDate(dateStr?: string) {
    if (!dateStr) return { date: "—", relative: "" };
    const d = new Date(dateStr);
    const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    const relative = diff === 0 ? "hoje" : diff === 1 ? "há 1 dia" : `há ${diff} dias`;
    return { date, relative };
}

function formatOrderId(id: string) {
    return `#ORD-${id.padStart(4, "0")}`;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export default function PedidosPage() {
    const { adminSession } = useAuth();
    const [view, setView]           = useState<"hybrid" | "kanban" | "list">("hybrid");
    const [orders, setOrders]       = useState<Order[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newClient, setNewClient] = useState("");
    const [newProducts, setNewProducts] = useState("");
    const [newStatus, setNewStatus] = useState<Status>("novo");
    const [creating, setCreating]   = useState(false);
    const [search, setSearch]       = useState("");
    const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
    const [page, setPage]           = useState(1);

    useEffect(() => {
        if (!adminSession) return;
        fetch("/api/pedidos")
            .then((r) => r.json())
            .then((j) => { if (j.orders) setOrders(j.orders as Order[]); })
            .catch((e) => console.error("[pedidos] load:", e));
    }, [adminSession]);

    const counts = useMemo(() => {
        const c = { todos: orders.length, novo: 0, confirmado: 0, rota: 0, entregue: 0 } as Record<string, number>;
        orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
        return c;
    }, [orders]);

    const filteredOrders = useMemo(() => orders.filter((o) => {
        const q = search.toLowerCase();
        const matchSearch = !search || o.id.includes(q) || o.client.toLowerCase().includes(q) || o.products.toLowerCase().includes(q);
        const matchStatus = statusFilter === "todos" || o.status === statusFilter;
        return matchSearch && matchStatus;
    }), [orders, search, statusFilter]);

    const totalPages  = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
    const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search, statusFilter]);

    async function handleCreateOrder() {
        if (!newClient.trim() || !newProducts.trim()) return;
        setCreating(true);
        // O id vem do servidor: numerar a partir da lista carregada em tela
        // repetia números quando dois pedidos eram criados ao mesmo tempo,
        // e ignorava pedidos de outras lojas na mesma sequência global.
        try {
            const res = await fetch("/api/pedidos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client: newClient.trim(),
                    products: newProducts.trim(),
                    status: newStatus,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Erro ao criar pedido");
            setOrders((prev) => [...prev, json.order as Order]);
            setDialogOpen(false);
            setNewClient(""); setNewProducts(""); setNewStatus("novo");
        } catch (e) {
            console.error("[pedidos] create:", e);
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Gestão de Pedidos</h2>
                    <p className="text-sm text-muted-foreground mt-1">Controle o fluxo de logística e vendas em tempo real.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="outline" className="gap-2 border-border text-muted-foreground hover:bg-muted h-9 text-sm">
                        <Filter className="w-4 h-4" /> Filtros
                    </Button>
                    <Button variant="outline" className="gap-2 border-border text-muted-foreground hover:bg-muted h-9 text-sm">
                        <Download className="w-4 h-4" /> Exportar
                    </Button>
                    <Button
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 gap-2 h-9 text-sm"
                        onClick={() => setDialogOpen(true)}
                    >
                        <Plus className="w-4 h-4" /> Novo Pedido
                    </Button>
                </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {STAT_CARDS.map(({ status, label, icon: Icon, gradient, ring, text, iconBg }) => {
                    const count = status === "total" ? counts.todos : counts[status] ?? 0;
                    return (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status === "total" ? "todos" : status as Status)}
                            className={cn(
                                "relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-200 bg-gradient-to-br ring-1",
                                gradient, ring,
                                "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]",
                                statusFilter === (status === "total" ? "todos" : status) && "ring-2 scale-[1.02] shadow-lg"
                            )}
                        >
                            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", iconBg)}>
                                <Icon className={cn("w-5 h-5", text)} />
                            </div>
                            <p className={cn("text-3xl font-bold leading-none mb-1", text)}>{count}</p>
                            <p className={cn("text-xs font-medium opacity-80", text)}>{label}</p>
                            {/* Decorative blob */}
                            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/5" />
                        </button>
                    );
                })}
            </div>

            {/* ── Toolbar ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Active filter label */}
                <div className="flex items-center gap-2">
                    {statusFilter !== "todos" && (
                        <Badge
                            variant="outline"
                            className={cn("rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer", STATUS_COLORS[statusFilter as Status])}
                            onClick={() => setStatusFilter("todos")}
                        >
                            <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block", STATUS_DOT[statusFilter as Status])} />
                            {STATUS_LABELS[statusFilter as Status]}
                            <span className="ml-1.5 opacity-60">× limpar</span>
                        </Badge>
                    )}
                    {statusFilter === "todos" && (
                        <p className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">{filteredOrders.length}</span> pedidos encontrados
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <Input
                            placeholder="Buscar pedido ou cliente..."
                            className="pl-9 w-56 h-9 border-border bg-card text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    {/* View toggle */}
                    <div className="flex items-center border border-border rounded-lg overflow-hidden bg-card shadow-sm">
                        {(["hybrid", "kanban", "list"] as const).map((v, i) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                title={v === "hybrid" ? "Híbrido" : v === "kanban" ? "Kanban" : "Lista"}
                                className={cn(
                                    "px-3 py-2 transition-colors",
                                    i > 0 && "border-l border-border",
                                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {v === "list" ? <ListIcon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Main layout ── */}
            <div className={cn(view === "hybrid" ? "grid grid-cols-1 xl:grid-cols-2 gap-6" : "w-full")}>

                {/* Kanban */}
                {(view === "hybrid" || view === "kanban") && (
                    <KanbanBoard orders={orders} visibleOrders={filteredOrders} setOrders={setOrders} />
                )}

                {/* Detailed report */}
                {(view === "hybrid" || view === "list") && (
                    <Card className="border border-border shadow-sm bg-card overflow-hidden flex flex-col">
                        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0 flex-shrink-0">
                            <CardTitle className="text-base font-semibold text-foreground">Relatório Detalhado</CardTitle>
                            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium cursor-pointer hover:bg-border transition-colors select-none">
                                Todos os períodos ▾
                            </span>
                        </CardHeader>
                        <CardContent className="p-0 flex-1">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border">
                                        <TableHead className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest pl-4">ID Pedido</TableHead>
                                        <TableHead className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Cliente</TableHead>
                                        <TableHead className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Data</TableHead>
                                        <TableHead className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pagedOrders.map((order) => {
                                        const { date, relative } = formatDate(order.created_at);
                                        const avatarColor = getAvatarColor(order.client);
                                        return (
                                            <TableRow
                                                key={order.id}
                                                className="hover:bg-muted/50 border-border transition-colors group"
                                            >
                                                <TableCell className="pl-4">
                                                    <span className="text-sm font-bold text-primary">{formatOrderId(order.id)}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={cn(
                                                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ring-2 ring-card shadow-sm",
                                                            avatarColor
                                                        )}>
                                                            {getInitials(order.client)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-foreground truncate max-w-[130px]">{order.client}</p>
                                                            <p className="text-xs text-muted-foreground/70 truncate max-w-[130px]">{order.products}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <p className="text-xs font-medium text-muted-foreground">{date}</p>
                                                    <p className="text-xs text-muted-foreground/70">{relative}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn(
                                                        "text-[11px] rounded-full px-2.5 py-0.5 font-semibold border",
                                                        STATUS_COLORS[order.status]
                                                    )}>
                                                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block", STATUS_DOT[order.status])} />
                                                        {STATUS_LABELS[order.status]}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {pagedOrders.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="py-16 text-center">
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground/70">
                                                    <ShoppingCart className="w-8 h-8 opacity-30" />
                                                    <p className="text-sm">Nenhum pedido encontrado</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>

                        {/* Pagination */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
                            <p className="text-xs text-muted-foreground/70">
                                <span className="font-semibold text-muted-foreground">{pagedOrders.length}</span> de{" "}
                                <span className="font-semibold text-muted-foreground">{filteredOrders.length}</span> resultados
                            </p>
                            <div className="flex items-center gap-0.5">
                                {[
                                    { icon: ChevronsLeft,  action: () => setPage(1),                           disabled: page === 1 },
                                    { icon: ChevronLeft,   action: () => setPage((p) => Math.max(1, p - 1)),   disabled: page === 1 },
                                ].map(({ icon: Icon, action, disabled }, i) => (
                                    <Button key={i} variant="ghost" size="icon" className="h-7 w-7 rounded" onClick={action} disabled={disabled}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </Button>
                                ))}
                                {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => {
                                    const p = Math.max(1, Math.min(totalPages - 2, page - 1)) + i;
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={cn(
                                                "h-7 w-7 rounded text-xs font-semibold transition-all",
                                                p === page ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                                            )}
                                        >
                                            {p}
                                        </button>
                                    );
                                })}
                                {[
                                    { icon: ChevronRight,  action: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: page === totalPages },
                                    { icon: ChevronsRight, action: () => setPage(totalPages),                          disabled: page === totalPages },
                                ].map(({ icon: Icon, action, disabled }, i) => (
                                    <Button key={i} variant="ghost" size="icon" className="h-7 w-7 rounded" onClick={action} disabled={disabled}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* ── New Order Dialog ── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Plus className="w-4 h-4 text-primary" />
                            </div>
                            Novo Pedido
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client">Cliente</Label>
                            <Input id="client" placeholder="Nome do cliente" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="products">Produtos</Label>
                            <Input id="products" placeholder="Ex: 5 cimento + 10 tijolo" value={newProducts} onChange={(e) => setNewProducts(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="status">Status inicial</Label>
                            <select
                                id="status"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={newStatus}
                                onChange={(e) => setNewStatus(e.target.value as Status)}
                            >
                                <option value="novo">Novo</option>
                                <option value="confirmado">Confirmado</option>
                                <option value="rota">Em Rota</option>
                                <option value="entregue">Entregue</option>
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>Cancelar</Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            onClick={handleCreateOrder}
                            disabled={creating || !newClient.trim() || !newProducts.trim()}
                        >
                            {creating ? "Criando..." : "Criar Pedido"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
