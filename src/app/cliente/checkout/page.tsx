"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ChevronRight, ShoppingCart, MapPin, QrCode,
    CreditCard, Banknote, UtensilsCrossed, Trash2,
    Rocket, Minus, Plus, AlertCircle, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientHeader } from "@/components/client-header";
import type { ClientSession } from "@/lib/auth-context";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
}

type PaymentMethod = "pix" | "cartao" | "dinheiro" | "vr";

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; Icon: typeof QrCode }[] = [
    { id: "pix",      label: "PIX",      Icon: QrCode },
    { id: "cartao",   label: "Cartão",   Icon: CreditCard },
    { id: "dinheiro", label: "Dinheiro", Icon: Banknote },
    { id: "vr",       label: "VR / VA",  Icon: UtensilsCrossed },
];

const CART_KEY = "pedidoai_cart";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [address, setAddress] = useState("");
    const [payment, setPayment] = useState<PaymentMethod>("pix");
    const [coupon, setCoupon] = useState("");
    const [placing, setPlacing] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const raw = localStorage.getItem("pedidoai_client_session");
        if (!raw) { router.push("/login"); return; }

        const sess = JSON.parse(raw) as ClientSession;
        setSession(sess);

        // Load cart
        const cartRaw = localStorage.getItem(CART_KEY);
        if (!cartRaw) { router.push("/cliente/chat"); return; }
        const qtys: Record<string, number> = JSON.parse(cartRaw);
        const nonZero = Object.fromEntries(Object.entries(qtys).filter(([, v]) => v > 0));
        if (Object.keys(nonZero).length === 0) { router.push("/cliente/chat"); return; }
        setQuantities(nonZero);

        // Pre-fill address from client record
        supabase
            .from("clients")
            .select("address")
            .eq("id", sess.clientId)
            .single()
            .then(({ data }) => {
                if (data?.address) setAddress(data.address);
            });

        // Fetch product details for items in cart
        const ids = Object.keys(nonZero);
        supabase
            .from("products")
            .select("id, name, description, category, subcategory, unit, price")
            .in("id", ids)
            .then(({ data }) => {
                setProducts((data as Product[]) ?? []);
                setLoadingProducts(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    // ── Derived ────────────────────────────────────────────────────────────────

    const cartItems = products
        .filter((p) => (quantities[p.id] ?? 0) > 0)
        .map((p) => ({ ...p, qty: quantities[p.id] }));

    const subtotal = cartItems.reduce((s, i) => s + i.qty * i.price, 0);

    function setQty(id: string, qty: number) {
        const next = Math.max(0, qty);
        setQuantities((prev) => {
            const updated = { ...prev, [id]: next };
            localStorage.setItem(CART_KEY, JSON.stringify(updated));
            return updated;
        });
    }

    function removeItem(id: string) {
        setQty(id, 0);
        setProducts((prev) => prev.filter((p) => p.id !== id));
    }

    // ── Submit ─────────────────────────────────────────────────────────────────

    async function handlePlaceOrder() {
        if (!session || cartItems.length === 0) return;
        setPlacing(true);

        // Auto-increment order ID
        const { data: allOrders } = await supabase.from("orders").select("id, status");
        const ids = (allOrders ?? []).map((o: { id: string }) => parseInt(o.id) || 0);
        const nextId = String((ids.length > 0 ? Math.max(...ids) : 0) + 1);
        const novoCount = (allOrders ?? []).filter((o: { status: string }) => o.status === "novo").length;
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
            setPlacing(false);
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

        // Clear cart and navigate to success page
        localStorage.removeItem(CART_KEY);
        router.push(`/cliente/pedido/${orderData.id}`);
    }

    if (!mounted || !session) return null;

    return (
        <div className="min-h-screen bg-[#F9FAFB]">

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
                    toast.type === "success" ? "bg-[#22C55E] text-white" : "bg-red-500 text-white"
                )}>
                    {toast.type === "success"
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            <ClientHeader />

            <div className="max-w-[1280px] mx-auto px-4 py-6">

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-sm mb-6">
                    <Link href="/cliente/chat" className="text-[#6B7280] hover:text-[#111827]">Carrinho</Link>
                    <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                    <span className="text-[#F97316] font-semibold">Checkout</span>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">

                    {/* ── Left column ──────────────────────────────────────── */}
                    <div className="flex-1 space-y-4">

                        {/* Cart items */}
                        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm">
                            <h2 className="font-bold text-[#111827] flex items-center gap-2 mb-4">
                                <ShoppingCart className="w-5 h-5 text-[#F97316]" />
                                Itens no Carrinho
                            </h2>

                            {loadingProducts ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <Skeleton key={i} className="h-16 rounded-lg" />
                                    ))}
                                </div>
                            ) : cartItems.length === 0 ? (
                                <p className="text-sm text-[#6B7280] text-center py-6">Carrinho vazio.</p>
                            ) : (
                                <div className="space-y-3">
                                    {cartItems.map((item) => (
                                        <div key={item.id} className="flex items-center gap-3 py-3 border-b border-[#E5E7EB] last:border-0">
                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm text-[#111827]">{item.name}</p>
                                                <p className="text-xs text-[#6B7280]">{item.unit}</p>
                                            </div>
                                            {/* Qty */}
                                            <div className="flex items-center border border-[#E5E7EB] rounded-lg overflow-hidden shrink-0">
                                                <button
                                                    onClick={() => setQty(item.id, item.qty - 1)}
                                                    className="w-7 h-7 flex items-center justify-center text-[#6B7280] hover:bg-gray-100 transition-colors"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="w-8 text-center text-sm font-semibold text-[#111827]">{item.qty}</span>
                                                <button
                                                    onClick={() => setQty(item.id, item.qty + 1)}
                                                    className="w-7 h-7 flex items-center justify-center text-[#6B7280] hover:bg-gray-100 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            {/* Subtotal */}
                                            <p className="text-sm font-bold text-[#F97316] w-20 text-right shrink-0">
                                                {formatCurrency(item.qty * item.price)}
                                            </p>
                                            {/* Remove */}
                                            <button
                                                onClick={() => removeItem(item.id)}
                                                className="p-1.5 text-[#6B7280] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Delivery address */}
                        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm">
                            <h2 className="font-bold text-[#111827] flex items-center gap-2 mb-4">
                                <MapPin className="w-5 h-5 text-[#F97316]" />
                                Endereço de Entrega
                            </h2>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Rua, Número, Bairro, Cidade"
                                className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]"
                            />
                        </div>
                    </div>

                    {/* ── Right sidebar ─────────────────────────────────────── */}
                    <div className="w-full lg:w-80 shrink-0 space-y-4">

                        {/* Order summary */}
                        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm sticky top-20">
                            <h2 className="font-bold text-[#111827] mb-4">Resumo do Pedido</h2>

                            <div className="space-y-2 text-sm mb-4">
                                <div className="flex justify-between text-[#6B7280]">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-[#6B7280]">
                                    <span>Taxa de Entrega</span>
                                    <span className="text-[#F97316] font-medium">A calcular</span>
                                </div>
                                <div className="border-t border-[#E5E7EB] pt-2 flex justify-between font-bold text-base">
                                    <span className="text-[#111827]">Total</span>
                                    <span className="text-[#F97316] text-lg">{formatCurrency(subtotal)}</span>
                                </div>
                            </div>

                            {/* Payment method */}
                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">FORMA DE PAGAMENTO</p>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                {PAYMENT_OPTIONS.map(({ id, label, Icon }) => (
                                    <button
                                        key={id}
                                        onClick={() => setPayment(id)}
                                        className={cn(
                                            "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm font-medium",
                                            payment === id
                                                ? "border-[#F97316] bg-[#F97316]/5 text-[#F97316]"
                                                : "border-[#E5E7EB] text-[#6B7280] hover:border-[#F97316]/40"
                                        )}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* PIX QR placeholder */}
                            {payment === "pix" && (
                                <div className="border-2 border-dashed border-[#E5E7EB] rounded-xl p-4 flex flex-col items-center gap-2 mb-4">
                                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <QrCode className="w-10 h-10 text-gray-300" />
                                    </div>
                                    <p className="text-xs text-[#6B7280] text-center">
                                        O QR Code será gerado após clicar no botão de pedido.
                                    </p>
                                </div>
                            )}

                            {/* Place order button */}
                            <button
                                onClick={handlePlaceOrder}
                                disabled={placing || cartItems.length === 0}
                                className="w-full h-11 bg-[#F97316] text-white rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F97316]/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <Rocket className="w-4 h-4" />
                                {placing ? "Processando..." : "Fazer Pedido"}
                            </button>
                            <p className="text-[11px] text-[#6B7280] text-center mt-2">
                                Ao finalizar seu pedido você concorda com nossos{" "}
                                <span className="text-[#F97316] cursor-pointer hover:underline">Termos de Serviço</span>.
                            </p>
                        </div>

                        {/* Coupon */}
                        <div className="bg-[#F97316] rounded-xl p-4">
                            <div className="flex items-center gap-2 text-white mb-2">
                                <span className="text-lg">🎁</span>
                                <p className="font-bold text-sm">Tem um cupom?</p>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={coupon}
                                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                                    placeholder="CÓDIGO"
                                    className="flex-1 h-8 px-3 rounded-lg text-xs font-semibold text-[#111827] outline-none"
                                />
                                <button className="bg-white text-[#F97316] px-3 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors">
                                    APLICAR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
