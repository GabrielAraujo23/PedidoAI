"use client";

import { useState, useEffect } from "react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Users, Plus, Search, SlidersHorizontal, Eye, Pencil,
    Phone, MapPin, Package, History, UserPlus, ShoppingBag, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Client, Order, Status } from "@/lib/types";

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

interface ClientMetrics {
    total: number;
    thisMonth: number;
    active: number;
}

interface LastOrderMap {
    [clientId: string]: string; // ISO date string
}

export default function ClientesPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
    const [lastOrders, setLastOrders] = useState<LastOrderMap>({});
    const [metrics, setMetrics] = useState<ClientMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [clientOrders, setClientOrders] = useState<Order[]>([]);
    const [creating, setCreating] = useState(false);

    const [newName, setNewName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newAddress, setNewAddress] = useState("");

    useEffect(() => { loadAll(); }, []);

    async function loadAll() {
        setLoading(true);

        const [{ data: clientsData }, { data: ordersData }] = await Promise.all([
            supabase.from("clients").select("*").order("created_at", { ascending: false }),
            supabase.from("orders").select("client_id, created_at"),
        ]);

        const cl = (clientsData as Client[]) ?? [];
        setClients(cl);

        if (ordersData) {
            // order counts per client
            const counts: Record<string, number> = {};
            const lastMap: LastOrderMap = {};
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            let thisMonthTotal = 0;
            const activeSet = new Set<string>();

            for (const o of ordersData) {
                if (!o.client_id) continue;
                counts[o.client_id] = (counts[o.client_id] ?? 0) + 1;
                activeSet.add(o.client_id);
                if (!lastMap[o.client_id] || o.created_at > lastMap[o.client_id]) {
                    lastMap[o.client_id] = o.created_at;
                }
                if (o.created_at >= monthStart) thisMonthTotal++;
            }

            setOrderCounts(counts);
            setLastOrders(lastMap);
            setMetrics({
                total: cl.length,
                thisMonth: thisMonthTotal,
                active: activeSet.size,
            });
        } else {
            setMetrics({ total: cl.length, thisMonth: 0, active: 0 });
        }

        setLoading(false);
    }

    async function handleAddClient() {
        if (!newName.trim()) return;
        setCreating(true);

        const { data: allClients } = await supabase.from("clients").select("id");
        const ids = (allClients ?? []).map((c: { id: string }) => parseInt(c.id.replace("CL", ""), 10)).filter(Boolean);
        const nextNum = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        const nextId = `CL${String(nextNum).padStart(3, "0")}`;

        const newClient: Client = {
            id: nextId,
            name: newName.trim(),
            phone: newPhone.trim() || null,
            address: newAddress.trim() || null,
        };

        const { error } = await supabase.from("clients").insert(newClient);

        if (!error) {
            setClients((prev) => [newClient, ...prev]);
            setMetrics((m) => m ? { ...m, total: m.total + 1 } : m);
            setAddOpen(false);
            setNewName(""); setNewPhone(""); setNewAddress("");
        }

        setCreating(false);
    }

    async function handleViewHistory(client: Client) {
        setSelectedClient(client);
        setClientOrders([]);
        setHistoryOpen(true);
        const { data } = await supabase
            .from("orders").select("*").eq("client_id", client.id)
            .order("created_at", { ascending: false });
        setClientOrders((data as Order[]) ?? []);
    }

    function formatDate(iso: string | undefined) {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    }

    function getInitials(name: string) {
        return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    }

    const filtered = clients.filter((c) => {
        const q = searchTerm.toLowerCase();
        return (
            c.name.toLowerCase().includes(q) ||
            (c.phone ?? "").includes(q) ||
            (c.address ?? "").toLowerCase().includes(q)
        );
    });

    return (
        <div className="min-h-full bg-[#F9FAFB] -m-4 md:-m-8 p-4 md:p-8 space-y-6">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 leading-tight">Gestão de Clientes</h1>
                        <p className="text-sm text-gray-500">Gerencie sua base de clientes e histórico de pedidos</p>
                    </div>
                </div>
                <Button
                    className="bg-primary hover:bg-primary/90 text-white shadow-sm gap-2 h-10"
                    onClick={() => setAddOpen(true)}
                >
                    <Plus className="w-4 h-4" /> Adicionar Cliente
                </Button>
            </div>

            <div className="border-t border-gray-200" />

            {/* ── Metric Cards ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    {
                        label: "Total de Clientes",
                        value: metrics?.total,
                        icon: <Users className="w-5 h-5 text-blue-500" />,
                        bg: "bg-blue-50",
                    },
                    {
                        label: "Pedidos Este Mês",
                        value: metrics?.thisMonth,
                        icon: <ShoppingBag className="w-5 h-5 text-orange-500" />,
                        bg: "bg-orange-50",
                    },
                    {
                        label: "Clientes Ativos",
                        value: metrics?.active,
                        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
                        bg: "bg-emerald-50",
                    },
                ].map(({ label, value, icon, bg }) => (
                    <Card key={label} className="bg-white border border-gray-100 shadow-sm">
                        <CardContent className="p-5 flex items-center gap-4">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bg)}>
                                {icon}
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">{label}</p>
                                {loading ? (
                                    <Skeleton className="h-7 w-12 mt-1" />
                                ) : (
                                    <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── Search + Filter ─────────────────────────────────────────── */}
            <div className="flex gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Buscar por nome, telefone ou endereço..."
                        className="pl-9 h-10 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-primary"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" className="h-10 gap-2 border-gray-200 text-gray-600 hover:bg-gray-50">
                    <SlidersHorizontal className="w-4 h-4" /> Filtros
                </Button>
            </div>

            {/* ── Table ───────────────────────────────────────────────────── */}
            <Card className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50 hover:bg-gray-50 border-gray-100">
                            <TableHead className="text-gray-600 font-semibold pl-6">Cliente</TableHead>
                            <TableHead className="text-gray-600 font-semibold hidden sm:table-cell">Telefone</TableHead>
                            <TableHead className="text-gray-600 font-semibold hidden md:table-cell">Endereço</TableHead>
                            <TableHead className="text-gray-600 font-semibold text-center">Pedidos</TableHead>
                            <TableHead className="text-gray-600 font-semibold hidden lg:table-cell">Último Pedido</TableHead>
                            <TableHead className="text-gray-600 font-semibold text-right pr-6">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i} className="border-gray-100">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="w-9 h-9 rounded-full" />
                                            <div className="space-y-1.5">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="h-3 w-20" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                                    <TableCell className="text-center"><Skeleton className="h-6 w-8 mx-auto rounded-full" /></TableCell>
                                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell className="pr-6"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6}>
                                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                                        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                                            <UserPlus className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <p className="text-gray-700 font-semibold text-base">
                                            {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
                                        </p>
                                        <p className="text-gray-400 text-sm text-center max-w-xs">
                                            {searchTerm
                                                ? "Tente buscar com outros termos."
                                                : "Adicione seu primeiro cliente para começar a gerenciar os pedidos."}
                                        </p>
                                        {!searchTerm && (
                                            <Button
                                                className="mt-2 bg-primary hover:bg-primary/90 text-white gap-2"
                                                onClick={() => setAddOpen(true)}
                                            >
                                                <Plus className="w-4 h-4" /> Adicionar Primeiro Cliente
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((client, idx) => (
                                <TableRow
                                    key={client.id}
                                    className={cn(
                                        "border-gray-100 transition-colors hover:bg-blue-50/40",
                                        idx % 2 === 1 && "bg-gray-50/60"
                                    )}
                                >
                                    {/* Avatar + Name */}
                                    <TableCell className="pl-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="text-xs font-bold text-primary">{getInitials(client.name)}</span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 text-sm leading-tight">{client.name}</p>
                                                <p className="text-xs text-gray-400">{client.id}</p>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Phone */}
                                    <TableCell className="hidden sm:table-cell">
                                        {client.phone ? (
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                <span className="text-sm">{client.phone}</span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-300 text-sm">—</span>
                                        )}
                                    </TableCell>

                                    {/* Address */}
                                    <TableCell className="hidden md:table-cell">
                                        {client.address ? (
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="text-sm truncate max-w-[200px]">{client.address}</span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-300 text-sm">—</span>
                                        )}
                                    </TableCell>

                                    {/* Order count */}
                                    <TableCell className="text-center">
                                        <span className={cn(
                                            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
                                            (orderCounts[client.id] ?? 0) > 0
                                                ? "bg-primary/10 text-primary"
                                                : "bg-gray-100 text-gray-400"
                                        )}>
                                            {orderCounts[client.id] ?? 0}
                                        </span>
                                    </TableCell>

                                    {/* Last order */}
                                    <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                                        {formatDate(lastOrders[client.id])}
                                    </TableCell>

                                    {/* Actions */}
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-400 hover:text-primary hover:bg-primary/10"
                                                onClick={() => handleViewHistory(client)}
                                                title="Ver histórico"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                                title="Editar"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* ── Modal: Adicionar Cliente ─────────────────────────────────── */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-primary" /> Adicionar Cliente
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="name">Nome *</Label>
                            <Input id="name" placeholder="Nome completo" value={newName} onChange={(e) => setNewName(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input id="phone" placeholder="(11) 99999-9999" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="address">Endereço</Label>
                            <Input id="address" placeholder="Rua, número, bairro" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>Cancelar</Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-white"
                            onClick={handleAddClient}
                            disabled={creating || !newName.trim()}
                        >
                            {creating ? "Salvando..." : "Adicionar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal: Histórico ─────────────────────────────────────────── */}
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="w-5 h-5 text-primary" />
                            Histórico — {selectedClient?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[400px] overflow-y-auto">
                        {clientOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                                <Package className="w-8 h-8 opacity-30" />
                                <span className="text-sm">Nenhum pedido encontrado para este cliente.</span>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-gray-100">
                                        <TableHead>ID</TableHead>
                                        <TableHead>Produtos</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Data</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {clientOrders.map((order) => (
                                        <TableRow key={order.id} className="border-gray-100 hover:bg-gray-50">
                                            <TableCell className="font-bold text-primary">#{order.id}</TableCell>
                                            <TableCell className="text-gray-600 text-sm">{order.products}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "rounded-md border-none px-2 py-0.5 text-xs",
                                                    STATUS_COLORS[order.status]
                                                )}>
                                                    {STATUS_LABELS[order.status]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-gray-400 text-xs">{formatDate(order.created_at)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHistoryOpen(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
