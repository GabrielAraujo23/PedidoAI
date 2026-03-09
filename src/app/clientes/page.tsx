"use client";

import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import {
    Search,
    Plus,
    MoreHorizontal,
    History,
    Phone,
    MapPin,
    Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
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

export default function ClientesPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
    const [searchTerm, setSearchTerm] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [clientOrders, setClientOrders] = useState<Order[]>([]);
    const [creating, setCreating] = useState(false);

    // New client form state
    const [newName, setNewName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newAddress, setNewAddress] = useState("");

    useEffect(() => {
        loadClients();
    }, []);

    async function loadClients() {
        const { data: clientsData } = await supabase
            .from("clients")
            .select("*")
            .order("created_at", { ascending: true });

        if (!clientsData) return;
        setClients(clientsData as Client[]);

        // Count orders per client via client_id FK
        const { data: ordersData } = await supabase
            .from("orders")
            .select("client_id");

        if (ordersData) {
            const counts: Record<string, number> = {};
            for (const o of ordersData) {
                if (o.client_id) counts[o.client_id] = (counts[o.client_id] ?? 0) + 1;
            }
            setOrderCounts(counts);
        }
    }

    async function handleAddClient() {
        if (!newName.trim()) return;
        setCreating(true);

        const nextId = `CL${String(clients.length + 1).padStart(3, "0")}`;
        const newClient: Client = {
            id: nextId,
            name: newName.trim(),
            phone: newPhone.trim() || null,
            address: newAddress.trim() || null,
        };

        const { error } = await supabase.from("clients").insert(newClient);

        if (!error) {
            setClients((prev) => [...prev, newClient]);
            setAddOpen(false);
            setNewName("");
            setNewPhone("");
            setNewAddress("");
        }

        setCreating(false);
    }

    async function handleViewHistory(client: Client) {
        setSelectedClient(client);
        setClientOrders([]);
        setHistoryOpen(true);

        const { data } = await supabase
            .from("orders")
            .select("*")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false });

        setClientOrders((data as Order[]) ?? []);
    }

    const filteredClients = clients.filter((c) => {
        const q = searchTerm.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Gestão de Clientes</h2>
                    <p className="text-muted-foreground">Gerencie sua base de clientes e históricos de compras.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por ID ou nome..."
                            className="pl-9 glass border-none h-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 gap-2"
                        onClick={() => setAddOpen(true)}
                    >
                        <Plus className="w-4 h-4" /> Adicionar Cliente
                    </Button>
                </div>
            </div>

            {/* Clients Table */}
            <Card className="glass border-none overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-xl text-secondary">Base de Clientes</CardTitle>
                    <CardDescription>Consulte endereços, telefones e histórico de cada cliente.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-white/20">
                                <TableHead>Nome</TableHead>
                                <TableHead>ID</TableHead>
                                <TableHead>Endereço</TableHead>
                                <TableHead>Pedidos</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.map((client) => (
                                <TableRow key={client.id} className="hover:bg-white/40 border-white/10 transition-colors">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-secondary">{client.name}</span>
                                            {client.phone && (
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Phone className="w-3 h-3 text-primary" /> {client.phone}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-none font-medium">
                                            {client.id}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {client.address ? (
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <MapPin className="w-4 h-4 text-primary" />
                                                <span className="text-sm truncate max-w-[200px]">{client.address}</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-muted-foreground/50">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <History className="w-4 h-4 text-teal-600" />
                                            <span className="text-sm">
                                                {orderCounts[client.id] ?? 0} pedido{orderCounts[client.id] !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 glass px-3 text-primary hover:text-primary/80"
                                                onClick={() => handleViewHistory(client)}
                                            >
                                                Ver Histórico
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                                <MoreHorizontal className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredClients.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                        Nenhum cliente encontrado.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Modal: Adicionar Cliente */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Adicionar Cliente</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="name">Nome *</Label>
                            <Input
                                id="name"
                                placeholder="Nome completo"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input
                                id="phone"
                                placeholder="(11) 99999-9999"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="address">Endereço</Label>
                            <Input
                                id="address"
                                placeholder="Rua, número, bairro"
                                value={newAddress}
                                onChange={(e) => setNewAddress(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>
                            Cancelar
                        </Button>
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

            {/* Modal: Histórico de Pedidos do Cliente */}
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
                                    <TableRow className="hover:bg-transparent border-white/20">
                                        <TableHead>ID</TableHead>
                                        <TableHead>Produtos</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {clientOrders.map((order) => (
                                        <TableRow key={order.id} className="hover:bg-white/40 border-white/10">
                                            <TableCell className="font-bold text-primary">#{order.id}</TableCell>
                                            <TableCell className="text-muted-foreground">{order.products}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "rounded-md border-none px-2 py-0.5",
                                                    STATUS_COLORS[order.status]
                                                )}>
                                                    {STATUS_LABELS[order.status]}
                                                </Badge>
                                            </TableCell>
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
