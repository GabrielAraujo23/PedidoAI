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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { Order, Status } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

const STATUS_LABELS: Record<Status, string> = {
    novo: "Novo",
    confirmado: "Confirmado",
    rota: "Em Rota",
    entregue: "Entregue",
};

const STATUS_COLORS: Record<Status, string> = {
    novo: "bg-blue-50 text-blue-600 border-blue-100",
    confirmado: "bg-orange-50 text-orange-600 border-orange-100",
    rota: "bg-purple-50 text-purple-600 border-purple-100",
    entregue: "bg-green-50 text-green-600 border-green-100",
};

const STATUS_DOT: Record<Status, string> = {
    novo: "bg-blue-500",
    confirmado: "bg-orange-400",
    rota: "bg-purple-500",
    entregue: "bg-green-500",
};

const AVATAR_COLORS = [
    "bg-blue-100 text-blue-600",
    "bg-orange-100 text-orange-600",
    "bg-purple-100 text-purple-600",
    "bg-green-100 text-green-600",
    "bg-rose-100 text-rose-600",
    "bg-teal-100 text-teal-600",
];

function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr?: string) {
    if (!dateStr) return { date: "—", relative: "" };
    const d = new Date(dateStr);
    const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const relative = diffDays === 0 ? "hoje" : diffDays === 1 ? "há 1 dia" : `há ${diffDays} dias`;
    return { date, relative };
}

function formatOrderId(id: string) {
    return `#ORD-${id.padStart(4, "0")}`;
}

const PAGE_SIZE = 8;

export default function PedidosPage() {
    const { adminSession } = useAuth();
    const [view, setView] = useState<"hybrid" | "kanban" | "list">("hybrid");
    const [orders, setOrders] = useState<Order[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newClient, setNewClient] = useState("");
    const [newProducts, setNewProducts] = useState("");
    const [newStatus, setNewStatus] = useState<Status>("novo");
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
    const [page, setPage] = useState(1);

    useEffect(() => {
        if (!adminSession) return;
        supabase
            .from("orders")
            .select("*")
            .eq("admin_id", adminSession.adminId)
            .order("position", { ascending: true })
            .then(({ data }) => { if (data) setOrders(data as Order[]); });
    }, [adminSession]);

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const q = search.toLowerCase();
            const matchSearch = !search || o.id.includes(q) || o.client.toLowerCase().includes(q) || o.products.toLowerCase().includes(q);
            const matchStatus = statusFilter === "todos" || o.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [orders, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
    const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search, statusFilter]);

    async function handleCreateOrder() {
        if (!newClient.trim() || !newProducts.trim()) return;
        setCreating(true);

        const nextId = String(Math.max(0, ...orders.map((o) => parseInt(o.id) || 0)) + 1);
        const colOrders = orders.filter((o) => o.status === newStatus);

        const newOrder: Order = {
            id: nextId,
            client: newClient.trim(),
            products: newProducts.trim(),
            status: newStatus,
            position: colOrders.length,
        };

        const { error } = await supabase.from("orders").insert({ ...newOrder, admin_id: adminSession!.adminId });
        if (!error) {
            setOrders((prev) => [...prev, newOrder]);
            setDialogOpen(false);
            setNewClient("");
            setNewProducts("");
            setNewStatus("novo");
        }
        setCreating(false);
    }

    const statusCounts = useMemo(() => {
        const base = { todos: orders.length, novo: 0, confirmado: 0, rota: 0, entregue: 0 } as Record<string, number>;
        orders.forEach((o) => { base[o.status] = (base[o.status] || 0) + 1; });
        return base;
    }, [orders]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Gestão de Pedidos</h2>
                    <p className="text-muted-foreground text-sm mt-1">Controle o fluxo de logística e vendas em tempo real.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="outline" className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Filter className="w-4 h-4" /> Filtros Avançados
                    </Button>
                    <Button variant="outline" className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Download className="w-4 h-4" /> Exportar Relatório
                    </Button>
                    <Button
                        className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 gap-2"
                        onClick={() => setDialogOpen(true)}
                    >
                        <Plus className="w-4 h-4" /> Novo Pedido
                    </Button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Status filters */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {(["todos", "novo", "confirmado", "rota", "entregue"] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                                statusFilter === s
                                    ? s === "todos"
                                        ? "bg-slate-800 text-white border-slate-800"
                                        : cn("border", STATUS_COLORS[s as Status], "ring-1 ring-current/20")
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                            )}
                        >
                            {s !== "todos" && (
                                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[s as Status])} />
                            )}
                            {s === "todos" ? "Todos" : STATUS_LABELS[s as Status]}
                            <span className={cn(
                                "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                statusFilter === s ? "bg-white/20" : "bg-slate-100"
                            )}>
                                {statusCounts[s] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Search + View toggle */}
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Buscar pedido ou cliente..."
                            className="pl-9 w-56 h-9 border-slate-200 bg-white text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                        {([
                            { v: "hybrid", icon: <LayoutGrid className="w-4 h-4" /> },
                            { v: "kanban", icon: <LayoutGrid className="w-4 h-4" /> },
                            { v: "list",   icon: <ListIcon   className="w-4 h-4" /> },
                        ] as { v: "hybrid" | "kanban" | "list"; icon: React.ReactNode }[]).map(({ v, icon }) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={cn(
                                    "px-3 py-2 text-sm transition-colors",
                                    view === v ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
                                )}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Layout */}
            <div className={cn(view === "hybrid" ? "grid grid-cols-1 xl:grid-cols-2 gap-6" : "w-full")}>

                {/* Kanban */}
                {(view === "hybrid" || view === "kanban") && (
                    <div className="w-full">
                        <KanbanBoard orders={filteredOrders} setOrders={setOrders} />
                    </div>
                )}

                {/* Detailed Report */}
                {(view === "hybrid" || view === "list") && (
                    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
                        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-base font-semibold text-slate-800">Relatório Detalhado</CardTitle>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full font-medium cursor-pointer hover:bg-slate-200 transition-colors">
                                Últimos 7 dias ▾
                            </span>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100">
                                        <TableHead className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-4">ID Pedido</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cliente</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Data</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pagedOrders.map((order) => {
                                        const { date, relative } = formatDate(order.created_at);
                                        const avatarColor = getAvatarColor(order.client);
                                        return (
                                            <TableRow key={order.id} className="hover:bg-slate-50/60 border-slate-100 transition-colors">
                                                <TableCell className="pl-4">
                                                    <span className="text-sm font-bold text-orange-500">{formatOrderId(order.id)}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0", avatarColor)}>
                                                            {getInitials(order.client)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">{order.client}</p>
                                                            <p className="text-xs text-slate-400 truncate max-w-[120px]">{order.products}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <p className="text-xs font-medium text-slate-700">{date}</p>
                                                    <p className="text-xs text-slate-400">{relative}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn("text-xs rounded-full border px-2.5 py-0.5 font-semibold", STATUS_COLORS[order.status])}>
                                                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block", STATUS_DOT[order.status])} />
                                                        {STATUS_LABELS[order.status]}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {pagedOrders.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-slate-400 py-12 text-sm">
                                                Nenhum pedido encontrado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            {/* Pagination */}
                            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                                <p className="text-xs text-slate-400">
                                    Exibindo <span className="font-semibold text-slate-600">{pagedOrders.length}</span> de{" "}
                                    <span className="font-semibold text-slate-600">{filteredOrders.length}</span> resultados
                                </p>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(1)} disabled={page === 1}>
                                        <ChevronsLeft className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </Button>
                                    {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => {
                                        const p = Math.max(1, Math.min(totalPages - 2, page - 1)) + i;
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => setPage(p)}
                                                className={cn(
                                                    "h-7 w-7 rounded text-xs font-semibold transition-colors",
                                                    p === page ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
                                                )}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
                                        <ChevronsRight className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Novo Pedido Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Novo Pedido</DialogTitle>
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
                            className="bg-primary hover:bg-primary/90 text-white"
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
