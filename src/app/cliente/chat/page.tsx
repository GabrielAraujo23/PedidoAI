"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Bot,
    LogOut,
    Clock,
    Truck,
    Star,
    Package,
    CheckCircle,
    Search,
    ShoppingCart,
    Loader2,
    AlertCircle,
    Check,
    ChevronDown,
    ChevronUp,
    Minus,
    Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import type { ClientSession } from "@/lib/auth-context";
import type { Order, Status } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
}

// ── Status config (client-facing labels) ──────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; Icon: typeof Package }> = {
    novo:       { label: "Pendente",    color: "bg-yellow-100 text-yellow-700",  Icon: Clock },
    confirmado: { label: "Confirmado",  color: "bg-orange-100 text-orange-700",  Icon: CheckCircle },
    rota:       { label: "Em entrega",  color: "bg-blue-100 text-blue-700",      Icon: Truck },
    entregue:   { label: "Entregue",    color: "bg-green-100 text-green-700",    Icon: Star },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ClienteChatPage() {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [deliveryRate, setDeliveryRate] = useState<number | null>(null);

    // Catalog filters
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("Todos");

    // Cart
    const [quantities, setQuantities] = useState<Record<string, number>>({});

    // Order flow
    const [showModal, setShowModal] = useState(false);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);

    // UI
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const router = useRouter();
    const catalogRef = useRef<HTMLDivElement>(null);

    // ── Mount ──────────────────────────────────────────────────────────────────

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem("pedidoai_client_session");
        if (!stored) {
            router.push("/login");
            return;
        }

        const sess = JSON.parse(stored) as ClientSession;
        setSession(sess);

        // Fetch customer orders
        supabase
            .from("orders")
            .select("*")
            .eq("client_id", sess.clientId)
            .then(({ data }) => {
                if (data) {
                    const sorted = [...data].sort(
                        (a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0)
                    );
                    setOrders(sorted as Order[]);
                }
            });

        // Fetch active products
        supabase
            .from("products")
            .select("*")
            .eq("active", true)
            .order("category", { ascending: true })
            .order("name", { ascending: true })
            .then(({ data, error }) => {
                if (error) {
                    setToast({ type: "error", message: "Erro ao carregar produtos." });
                } else {
                    setProducts((data as Product[]) ?? []);
                }
                setLoadingProducts(false);
            });

        // Fetch delivery rate
        supabase
            .from("store_settings")
            .select("delivery_rate_per_km")
            .limit(1)
            .single()
            .then(({ data }) => {
                if (data?.delivery_rate_per_km) {
                    setDeliveryRate(Number(data.delivery_rate_per_km));
                }
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    // ── Derived state ──────────────────────────────────────────────────────────

    const categories = ["Todos", ...Array.from(new Set(products.map((p) => p.category)))];

    const filteredProducts = products.filter((p) => {
        const q = search.toLowerCase();
        const matchSearch =
            p.name.toLowerCase().includes(q) ||
            (p.subcategory ?? "").toLowerCase().includes(q);
        const matchCategory =
            selectedCategory === "Todos" || p.category === selectedCategory;
        return matchSearch && matchCategory;
    });

    // Group filtered products by category, preserving order
    const groupedProducts = filteredProducts.reduce<Record<string, Product[]>>((acc, p) => {
        (acc[p.category] ??= []).push(p);
        return acc;
    }, {});

    const cartItems = products
        .filter((p) => (quantities[p.id] ?? 0) > 0)
        .map((p) => ({ ...p, qty: quantities[p.id] }));

    const cartTotal = cartItems.reduce((sum, i) => sum + i.qty * i.price, 0);
    const totalItems = cartItems.reduce((sum, i) => sum + i.qty, 0);

    // ── Cart helpers ───────────────────────────────────────────────────────────

    function setQty(productId: string, qty: number) {
        setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
    }

    // ── Order save ─────────────────────────────────────────────────────────────

    async function handleConfirmOrder() {
        if (!session || cartItems.length === 0) return;
        setSaving(true);

        // Auto-increment ID
        const { data: allOrders } = await supabase.from("orders").select("id, status");
        const ids = (allOrders || []).map((o: { id: string }) => parseInt(o.id) || 0);
        const maxId = ids.length > 0 ? Math.max(...ids) : 0;
        const nextId = String(maxId + 1);
        const novoCount = (allOrders || []).filter((o: { status: string }) => o.status === "novo").length;

        const productsStr = cartItems.map((i) => `${i.qty}x ${i.name}`).join(", ");

        const { data: orderData, error } = await supabase
            .from("orders")
            .insert({
                id: nextId,
                client: session.name,
                client_id: session.clientId,
                products: productsStr,
                status: "novo",
                position: novoCount,
            })
            .select("id")
            .single();

        if (error || !orderData) {
            setToast({ type: "error", message: "Erro ao realizar pedido. Tente novamente." });
            setSaving(false);
            return;
        }

        // Insert order_items
        await supabase.from("order_items").insert(
            cartItems.map((i) => ({
                order_id: orderData.id,
                product_id: i.id,
                product_name: i.name,
                unit: i.unit,
                quantity: i.qty,
                unit_price: i.price,
            }))
        );

        // Update UI
        const newOrder: Order = {
            id: nextId,
            client: session.name,
            client_id: session.clientId,
            products: productsStr,
            status: "novo",
            position: novoCount,
        };
        setOrders((prev) => [newOrder, ...prev]);
        setShowModal(false);
        setQuantities({});
        setNotes("");
        setToast({ type: "success", message: `Pedido #${nextId} realizado com sucesso!` });
        setSaving(false);
    }

    function handleLogout() {
        localStorage.removeItem("pedidoai_client_session");
        router.push("/login");
    }

    if (!mounted || !session) return null;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-100">
            <div className="max-w-2xl mx-auto flex flex-col min-h-screen">

                {/* Toast */}
                {toast && (
                    <div className={cn(
                        "fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
                        toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                    )}>
                        {toast.type === "success"
                            ? <Check className="w-4 h-4 shrink-0" />
                            : <AlertCircle className="w-4 h-4 shrink-0" />}
                        {toast.message}
                    </div>
                )}

                {/* ── Header ────────────────────────────────────────────────── */}
                <div className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-white/20 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow shadow-primary/20">
                            <span className="text-white font-bold">P</span>
                        </div>
                        <div>
                            <p className="font-bold text-secondary text-sm leading-none">PedidoAI</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Olá, {session.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-none">
                            Cliente
                        </Badge>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={handleLogout}
                        >
                            <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* ── Seus Pedidos ───────────────────────────────────────────── */}
                {orders.length > 0 && (
                    <div className="px-4 pt-4 space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Seus Pedidos
                        </p>
                        {orders.slice(0, 3).map((order) => {
                            const cfg = STATUS_CONFIG[order.status];
                            const Icon = cfg.Icon;
                            const isExpanded = expandedOrderId === order.id;
                            // Summarize products
                            const parts = order.products.split(",").map((s) => s.trim());
                            const summary =
                                parts.length > 2
                                    ? `${parts[0]}, ${parts[1]} e mais ${parts.length - 2}...`
                                    : order.products;

                            return (
                                <div
                                    key={order.id}
                                    className="bg-white/60 backdrop-blur rounded-xl border border-white/30 overflow-hidden"
                                >
                                    <button
                                        className="w-full px-4 py-3 flex items-center justify-between text-left"
                                        onClick={() =>
                                            setExpandedOrderId(isExpanded ? null : order.id)
                                        }
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-secondary">
                                                    Pedido #{order.id}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                                                    {summary}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-[11px] border-none rounded-lg px-2 py-0.5",
                                                    cfg.color
                                                )}
                                            >
                                                {cfg.label}
                                            </Badge>
                                            {isExpanded
                                                ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                                : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="px-4 pb-3 border-t border-white/30">
                                            <p className="text-xs text-secondary mt-2 leading-relaxed">
                                                {order.products}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Welcome bubble ─────────────────────────────────────────── */}
                <div className="px-4 pt-4 flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white/80 text-secondary rounded-2xl rounded-tl-none border border-white/30 p-3 text-sm shadow-sm max-w-[85%]">
                        Olá, {session.name}! 😊{"\n\n"}Navegue pelo catálogo abaixo, adicione itens ao carrinho e faça seu pedido!
                    </div>
                </div>

                {/* ── Catalog ────────────────────────────────────────────────── */}
                <div ref={catalogRef} className="flex-1 px-4 pt-4 pb-48">

                    {/* Search */}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar produtos..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white/60 border-white/30"
                        />
                    </div>

                    {/* Category pills */}
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                                    selectedCategory === cat
                                        ? "bg-primary text-white"
                                        : "bg-white/60 text-muted-foreground border border-white/40 hover:bg-white/80"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Product grid */}
                    {loadingProducts ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="h-40 rounded-2xl" />
                            ))}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Package className="w-10 h-10 text-muted-foreground/30 mb-3" />
                            <p className="text-sm font-semibold text-secondary">Nenhum produto encontrado</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Tente ajustar sua busca ou selecione outra categoria.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(groupedProducts).map(([category, prods]) => (
                                <div key={category}>
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-2">
                                        <span className="flex-1 border-b border-white/40" />
                                        {category}
                                        <span className="flex-1 border-b border-white/40" />
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {prods.map((p) => {
                                            const qty = quantities[p.id] ?? 0;
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={cn(
                                                        "bg-white/70 backdrop-blur rounded-2xl p-3 shadow-sm border-2 transition-all duration-200",
                                                        qty > 0
                                                            ? "border-primary shadow-primary/10 bg-orange-50/60"
                                                            : "border-transparent hover:border-white/60"
                                                    )}
                                                >
                                                    <p className="font-semibold text-sm text-secondary leading-tight">{p.name}</p>
                                                    {p.subcategory && (
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.subcategory}</p>
                                                    )}
                                                    <p className="text-[11px] text-muted-foreground">{p.unit}</p>
                                                    <p className="font-bold text-primary text-sm mt-1.5">{formatCurrency(p.price)}</p>

                                                    {/* Quantity selector */}
                                                    <div className="flex items-center gap-1.5 mt-2.5">
                                                        <button
                                                            onClick={() => setQty(p.id, qty - 1)}
                                                            disabled={qty === 0}
                                                            className={cn(
                                                                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                                                                qty === 0
                                                                    ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                                                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                                            )}
                                                        >
                                                            <Minus className="w-3 h-3" />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={qty === 0 ? "" : qty}
                                                            onChange={(e) => {
                                                                const v = parseInt(e.target.value);
                                                                setQty(p.id, isNaN(v) ? 0 : v);
                                                            }}
                                                            placeholder="0"
                                                            className="flex-1 h-7 rounded-lg border border-input bg-white text-center text-sm font-semibold outline-none focus:ring-1 focus:ring-primary min-w-0"
                                                        />
                                                        <button
                                                            onClick={() => setQty(p.id, qty + 1)}
                                                            className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            {/* ── Floating Cart ──────────────────────────────────────────────── */}
            {totalItems > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
                    <div className="max-w-2xl mx-auto pointer-events-auto">
                        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4 text-primary" />
                                <p className="font-semibold text-sm text-secondary">
                                    {totalItems} {totalItems === 1 ? "item selecionado" : "itens selecionados"}
                                </p>
                            </div>

                            <div className="space-y-1 max-h-28 overflow-y-auto">
                                {cartItems.map((i) => (
                                    <div key={i.id} className="flex justify-between text-xs text-muted-foreground">
                                        <span className="truncate mr-2">{i.name} ({i.qty}x)</span>
                                        <span className="shrink-0">{formatCurrency(i.qty * i.price)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                                <span>Entrega</span>
                                <span>{deliveryRate != null ? formatCurrency(deliveryRate) : "A calcular"}</span>
                            </div>

                            <div className="flex justify-between items-center font-bold">
                                <span className="text-secondary">Total</span>
                                <span className="text-primary text-lg">{formatCurrency(cartTotal)}</span>
                            </div>

                            <Button
                                onClick={() => setShowModal(true)}
                                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                            >
                                Confirmar Pedido →
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirmation Modal ─────────────────────────────────────────── */}
            <Dialog open={showModal} onOpenChange={(open) => { if (!saving) setShowModal(open); }}>
                <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Confirmar Pedido</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            {cartItems.map((i) => (
                                <div key={i.id} className="flex justify-between text-sm">
                                    <span className="text-secondary">
                                        {i.name}
                                        <span className="text-muted-foreground ml-1">× {i.qty}</span>
                                    </span>
                                    <span className="font-semibold text-secondary">
                                        {formatCurrency(i.qty * i.price)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {deliveryRate != null && (
                            <div className="flex justify-between text-sm text-muted-foreground border-t pt-2">
                                <span>Entrega</span>
                                <span>{formatCurrency(deliveryRate)}</span>
                            </div>
                        )}

                        <div className="flex justify-between font-bold text-base border-t pt-2">
                            <span className="text-secondary">Total</span>
                            <span className="text-primary">{formatCurrency(cartTotal)}</span>
                        </div>

                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">
                                Observações (opcional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ex: Entregar após as 18h, portão azul..."
                                rows={3}
                                className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setShowModal(false)}
                            disabled={saving}
                            className="w-full sm:w-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmOrder}
                            disabled={saving}
                            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white font-semibold"
                        >
                            {saving ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</>
                            ) : (
                                "Fazer Pedido"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
