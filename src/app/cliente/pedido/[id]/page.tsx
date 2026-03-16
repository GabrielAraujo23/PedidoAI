"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    CheckCircle, Clock, Truck, Star,
    Package, MessageCircle, Plus, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientHeader } from "@/components/client-header";
import type { ClientSession } from "@/lib/auth-context";
import type { Status } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderItem {
    id: string;
    product_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface OrderData {
    id: string;
    client: string;
    client_id: string;
    products: string;
    status: Status;
    created_at: string;
}

// ── Status steps config ────────────────────────────────────────────────────────

const STEPS: { status: Status; label: string; Icon: typeof Package }[] = [
    { status: "novo",       label: "Pendente",   Icon: Clock },
    { status: "confirmado", label: "Confirmado", Icon: CheckCircle },
    { status: "rota",       label: "Em Entrega", Icon: Truck },
    { status: "entregue",   label: "Entregue",   Icon: Star },
];

const STATUS_ORDER: Record<Status, number> = {
    novo: 0, confirmado: 1, rota: 2, entregue: 3,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OrderTrackingPage() {
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [order, setOrder] = useState<OrderData | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);

    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const raw = localStorage.getItem("pedidoai_client_session");
        if (!raw) { router.push("/login"); return; }
        setSession(JSON.parse(raw) as ClientSession);

        async function fetchOrder() {
            const { data: orderData } = await supabase
                .from("orders")
                .select("*")
                .eq("id", id)
                .single();

            if (!orderData) { setLoading(false); return; }
            setOrder(orderData as OrderData);

            // Fetch order_items (may not exist for old orders)
            const { data: itemsData } = await supabase
                .from("order_items")
                .select("id, product_name, unit, quantity, unit_price, total_price")
                .eq("order_id", id);

            setItems((itemsData as OrderItem[]) ?? []);
            setLoading(false);
        }

        fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    if (!mounted || !session) return null;

    const currentStepIndex = order ? STATUS_ORDER[order.status] : -1;
    const totalValue = items.length > 0
        ? items.reduce((s, i) => s + Number(i.total_price), 0)
        : 0;

    // Fallback items from products string when order_items table is empty
    const fallbackItems = order?.products
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            <ClientHeader />

            <div className="max-w-[1280px] mx-auto px-4 py-6">
                {loading ? (
                    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
                        <div className="space-y-4">
                            <Skeleton className="h-48 rounded-xl" />
                            <Skeleton className="h-40 rounded-xl" />
                        </div>
                        <Skeleton className="h-96 rounded-xl" />
                    </div>
                ) : !order ? (
                    <div className="text-center py-24">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="font-bold text-[#111827]">Pedido não encontrado</p>
                        <Link href="/cliente/chat" className="text-sm text-[#F97316] hover:underline mt-2 inline-block">
                            Voltar ao cardápio
                        </Link>
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-6">

                        {/* ── Left column ──────────────────────────────────── */}
                        <div className="flex-1 space-y-4">

                            {/* Success card */}
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm text-center">
                                <div className="w-14 h-14 bg-[#22C55E]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <CheckCircle className="w-8 h-8 text-[#22C55E]" />
                                </div>
                                <p className="text-xs font-bold text-[#F97316] uppercase tracking-wider mb-1">SUCESSO</p>
                                <h1 className="text-2xl font-bold text-[#111827] mb-2">
                                    Pedido #{order.id} realizado!
                                </h1>
                                <p className="text-sm text-[#6B7280] mb-5">
                                    Seu pedido foi processado com sucesso e está sendo preparado com todo carinho pela nossa equipe.
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <a
                                        href="https://wa.me/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-5 py-2.5 bg-[#22C55E] text-white rounded-full text-sm font-bold hover:bg-[#22C55E]/90 transition-colors"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        WhatsApp
                                    </a>
                                    <Link
                                        href="/cliente/chat"
                                        className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#F97316] text-[#F97316] rounded-full text-sm font-bold hover:bg-[#F97316]/5 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Fazer novo pedido
                                    </Link>
                                </div>
                            </div>

                            {/* Status tracker */}
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                <h2 className="font-bold text-[#111827] mb-6">Status do Envio</h2>

                                {/* Steps */}
                                <div className="relative flex justify-between">
                                    {/* Connecting line */}
                                    <div className="absolute top-5 left-0 right-0 h-0.5 bg-[#E5E7EB]" />
                                    <div
                                        className="absolute top-5 left-0 h-0.5 bg-[#22C55E] transition-all duration-500"
                                        style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
                                    />

                                    {STEPS.map((step, idx) => {
                                        const done = idx < currentStepIndex;
                                        const active = idx === currentStepIndex;
                                        const Icon = step.Icon;

                                        return (
                                            <div key={step.status} className="relative flex flex-col items-center z-10">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                                                    done
                                                        ? "bg-[#22C55E] border-[#22C55E] text-white"
                                                        : active
                                                            ? "bg-[#F97316] border-[#F97316] text-white"
                                                            : "bg-white border-[#E5E7EB] text-[#6B7280]"
                                                )}>
                                                    {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                                                </div>
                                                <p className={cn(
                                                    "text-[11px] font-semibold mt-2 text-center",
                                                    active ? "text-[#F97316]" : done ? "text-[#22C55E]" : "text-[#6B7280]"
                                                )}>
                                                    {step.label}
                                                </p>
                                                {active && (
                                                    <p className="text-[10px] text-[#6B7280] mt-0.5">A caminho</p>
                                                )}
                                                {done && order.created_at && (
                                                    <p className="text-[10px] text-[#6B7280] mt-0.5">{formatDate(order.created_at)}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* ── Right sidebar ─────────────────────────────────── */}
                        <div className="w-full lg:w-96 shrink-0">
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm sticky top-20">
                                <h2 className="font-bold text-[#111827] mb-4">Resumo do Pedido</h2>

                                {/* Items */}
                                <div className="space-y-3 mb-4">
                                    {items.length > 0 ? (
                                        items.map((item) => (
                                            <div key={item.id} className="flex justify-between text-sm">
                                                <div>
                                                    <p className="font-semibold text-[#111827]">
                                                        {item.product_name}
                                                        <span className="text-[#6B7280] font-normal ml-1">× {item.quantity}</span>
                                                    </p>
                                                    <p className="text-xs text-[#6B7280]">{item.unit}</p>
                                                </div>
                                                <p className="font-bold text-[#F97316] shrink-0">{formatCurrency(Number(item.total_price))}</p>
                                            </div>
                                        ))
                                    ) : (
                                        fallbackItems.map((line, i) => (
                                            <p key={i} className="text-sm text-[#111827]">{line}</p>
                                        ))
                                    )}
                                </div>

                                {totalValue > 0 && (
                                    <>
                                        <div className="border-t border-[#E5E7EB] pt-3 space-y-1.5 text-sm">
                                            <div className="flex justify-between text-[#6B7280]">
                                                <span>Subtotal</span>
                                                <span>{formatCurrency(totalValue)}</span>
                                            </div>
                                            <div className="flex justify-between text-[#6B7280]">
                                                <span>Taxa de entrega</span>
                                                <span className="text-[#22C55E] font-medium">A calcular</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-base pt-1">
                                                <span className="text-[#111827]">Total</span>
                                                <span className="text-[#F97316]">{formatCurrency(totalValue)}</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="border-t border-[#E5E7EB] mt-3 pt-3 space-y-2">
                                    <div>
                                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">CLIENTE</p>
                                        <p className="text-sm text-[#111827] mt-0.5">{order.client}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">PEDIDO FEITO EM</p>
                                        <p className="text-sm text-[#111827] mt-0.5">
                                            {order.created_at ? formatDate(order.created_at) : "—"}
                                        </p>
                                    </div>
                                </div>

                                <Link
                                    href="/cliente/chat"
                                    className="mt-4 flex items-center justify-center gap-2 w-full h-10 border border-[#F97316] text-[#F97316] rounded-full text-sm font-bold hover:bg-[#F97316]/5 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Novo Pedido
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
