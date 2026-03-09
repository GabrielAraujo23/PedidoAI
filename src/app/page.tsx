"use client";

import { useEffect, useState } from "react";
import {
    Package,
    Users,
    Truck,
    Clock,
    MoreVertical,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { Order, Status } from "@/lib/types";

const STATUS_COLORS: Record<Status, string> = {
    novo: "bg-blue-100 text-blue-700",
    confirmado: "bg-orange-100 text-orange-700",
    rota: "bg-teal-100 text-teal-700",
    entregue: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<Status, string> = {
    novo: "Novo",
    confirmado: "Confirmado",
    rota: "Em Rota",
    entregue: "Entregue",
};

const chartData = [
    { name: "Seg", pedidos: 4 },
    { name: "Ter", pedidos: 7 },
    { name: "Qua", pedidos: 5 },
    { name: "Qui", pedidos: 9 },
    { name: "Sex", pedidos: 12 },
    { name: "Sáb", pedidos: 8 },
    { name: "Dom", pedidos: 3 },
];

interface DashboardStats {
    totalOrders: number;
    totalClients: number;
    rotaCount: number;
    novoCount: number;
    recentOrders: Order[];
}

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        totalOrders: 0,
        totalClients: 0,
        rotaCount: 0,
        novoCount: 0,
        recentOrders: [],
    });

    useEffect(() => {
        async function load() {
            const [{ data: orders }, { data: clients }] = await Promise.all([
                supabase.from("orders").select("id, client, products, status"),
                supabase.from("clients").select("id"),
            ]);

            if (orders) {
                const sorted = [...orders].sort(
                    (a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0)
                );
                setStats({
                    totalOrders: orders.length,
                    totalClients: clients?.length ?? 0,
                    rotaCount: orders.filter((o) => o.status === "rota").length,
                    novoCount: orders.filter((o) => o.status === "novo").length,
                    recentOrders: sorted.slice(0, 4) as Order[],
                });
            }
        }

        load();
    }, []);

    const statCards = [
        {
            title: "Total Pedidos",
            value: String(stats.totalOrders),
            icon: Package,
            color: "text-blue-600",
            bg: "bg-blue-100",
        },
        {
            title: "Clientes",
            value: String(stats.totalClients),
            icon: Users,
            color: "text-orange-600",
            bg: "bg-orange-100",
        },
        {
            title: "Em Rota",
            value: String(stats.rotaCount),
            icon: Truck,
            color: "text-teal-600",
            bg: "bg-teal-100",
        },
        {
            title: "Pendentes",
            value: String(stats.novoCount),
            icon: Clock,
            color: "text-red-600",
            bg: "bg-red-100",
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Dashboard</h2>
                    <p className="text-muted-foreground">
                        Bem-vindo à PedidoAI, sua loja está operando normalmente.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="glass hover:bg-white/80">
                        Exportar Relatório
                    </Button>
                    <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                        Configurar Loja
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat) => (
                    <Card
                        key={stat.title}
                        className="glass border-none hover:translate-y-[-4px] transition-all duration-300 hover:shadow-2xl"
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </CardTitle>
                            <div className={`p-2 rounded-lg ${stat.bg}`}>
                                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{stat.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart */}
                <Card className="lg:col-span-2 glass border-none">
                    <CardHeader>
                        <CardTitle className="text-xl text-secondary">Visão Geral de Pedidos</CardTitle>
                        <CardDescription>Performance semanal de pedidos</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px] w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorPedidos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FFAC26" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#FFAC26" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#6B7280", fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#6B7280", fontSize: 12 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "rgba(255,255,255,0.8)",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        backdropFilter: "blur(8px)",
                                        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="pedidos"
                                    stroke="#FFAC26"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorPedidos)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Recent Orders */}
                <Card className="glass border-none">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl text-secondary">Pedidos Recentes</CardTitle>
                            <CardDescription>Últimas movimentações da fila</CardDescription>
                        </div>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="w-5 h-5 text-muted-foreground" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-white/20">
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.recentOrders.map((order) => (
                                    <TableRow
                                        key={order.id}
                                        className="hover:bg-white/40 border-white/10 transition-colors"
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex flex-col">
                                                <span>{order.client}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    #{order.id}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "rounded-md border-none px-2 py-0.5",
                                                    STATUS_COLORS[order.status]
                                                )}
                                            >
                                                {STATUS_LABELS[order.status]}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {stats.recentOrders.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={2}
                                            className="text-center text-muted-foreground py-8 text-sm"
                                        >
                                            Nenhum pedido registrado ainda.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        <Button
                            variant="link"
                            className="w-full mt-4 text-primary hover:text-primary/80"
                        >
                            Ver Todos os Pedidos
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
