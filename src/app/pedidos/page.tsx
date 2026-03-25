"use client";

import React, { useState, useEffect } from "react";
import { KanbanBoard } from "@/components/kanban-board";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Search,
    Plus,
    Filter,
    LayoutGrid,
    List as ListIcon,
    MoreHorizontal,
    Eye
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
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
    novo: "bg-blue-100 text-blue-700",
    confirmado: "bg-orange-100 text-orange-700",
    rota: "bg-teal-100 text-teal-700",
    entregue: "bg-green-100 text-green-700",
};

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

    useEffect(() => {
        if (!adminSession) return;
        supabase
            .from("orders")
            .select("*")
            .eq("admin_id", adminSession.adminId)
            .order("position", { ascending: true })
            .then(({ data }) => {
                if (data) setOrders(data as Order[]);
            });
    }, [adminSession]);

    const filteredOrders = orders.filter((o) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return o.id.includes(q) || o.client.toLowerCase().includes(q);
    });

    async function handleCreateOrder() {
        if (!newClient.trim() || !newProducts.trim()) return;
        setCreating(true);

        const nextId = String(
            Math.max(0, ...orders.map((o) => parseInt(o.id) || 0)) + 1
        );
        const colOrders = orders.filter((o) => o.status === newStatus);
        const position = colOrders.length;

        const newOrder: Order = {
            id: nextId,
            client: newClient.trim(),
            products: newProducts.trim(),
            status: newStatus,
            position,
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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Gestão de Pedidos</h2>
                    <p className="text-muted-foreground">Monitore e organize a fila de entregas da sua loja.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por ID ou cliente..."
                            className="pl-9 glass border-none h-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button
                        className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 gap-2"
                        onClick={() => setDialogOpen(true)}
                    >
                        <Plus className="w-4 h-4" /> Novo Pedido
                    </Button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between glass p-2 rounded-xl">
                <Tabs defaultValue="hybrid" className="w-[400px]" onValueChange={(v) => setView(v as "hybrid" | "kanban" | "list")}>
                    <TabsList className="bg-transparent gap-1">
                        <TabsTrigger value="hybrid" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-lg px-4 py-2 gap-2">
                            <LayoutGrid className="w-4 h-4" /> Híbrido
                        </TabsTrigger>
                        <TabsTrigger value="kanban" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-lg px-4 py-2 gap-2">
                            <LayoutGrid className="w-4 h-4" /> Kanban
                        </TabsTrigger>
                        <TabsTrigger value="list" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-lg px-4 py-2 gap-2">
                            <ListIcon className="w-4 h-4" /> Lista
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex gap-2 mr-2">
                    <Button variant="outline" size="sm" className="gap-2 glass border-none hover:bg-white/80">
                        <Filter className="w-4 h-4" /> Filtros
                    </Button>
                </div>
            </div>

            {/* Main Layout */}
            <div className={view === "hybrid" ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : "w-full"}>
                {/* Kanban Board */}
                {(view === "hybrid" || view === "kanban") && (
                    <div className="w-full">
                        <KanbanBoard orders={filteredOrders} setOrders={setOrders} />
                    </div>
                )}

                {/* List View */}
                {(view === "hybrid" || view === "list") && (
                    <Card className="glass border-none overflow-hidden">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-white/20">
                                        <TableHead>ID</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Produtos</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOrders.map((order) => (
                                        <TableRow key={order.id} className="hover:bg-white/40 border-white/10 transition-colors">
                                            <TableCell className="font-bold text-primary">#{order.id}</TableCell>
                                            <TableCell className="font-medium text-secondary">{order.client}</TableCell>
                                            <TableCell className="text-muted-foreground">{order.products}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "rounded-md border-none px-2 py-0.5",
                                                    STATUS_COLORS[order.status]
                                                )}>
                                                    {STATUS_LABELS[order.status]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5">
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-slate-100">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredOrders.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                Nenhum pedido encontrado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
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
                            <Input
                                id="client"
                                placeholder="Nome do cliente"
                                value={newClient}
                                onChange={(e) => setNewClient(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="products">Produtos</Label>
                            <Input
                                id="products"
                                placeholder="Ex: 5 cimento + 10 tijolo"
                                value={newProducts}
                                onChange={(e) => setNewProducts(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="status">Status inicial</Label>
                            <select
                                id="status"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
                            Cancelar
                        </Button>
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
