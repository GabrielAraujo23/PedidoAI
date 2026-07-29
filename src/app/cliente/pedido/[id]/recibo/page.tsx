"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FileText, Printer, ArrowLeft, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientSession } from "@/lib/client-session";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/types";

interface OrderData {
    id: string;
    client: string;
    client_id: string;
    products: string;
    status: Status;
    created_at: string;
}

interface OrderItem {
    id: string;
    product_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface ClientData {
    name: string;
    phone: string;
    address: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
    novo:       "Pendente",
    confirmado: "Confirmado",
    rota:       "Em Entrega",
    entregue:   "Entregue",
    cancelado:  "Cancelado",
};

const STATUS_BADGE: Record<Status, string> = {
    novo:       "bg-amber-50 text-amber-700 border-amber-200",
    confirmado: "bg-orange-50 text-orange-700 border-orange-200",
    rota:       "bg-violet-50 text-violet-700 border-violet-200",
    entregue:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelado:  "bg-red-50 text-red-700 border-red-200",
};

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

export default function ReciboPedidoPage() {
    const { id } = useParams<{ id: string }>();
    const { session, loading: sessionLoading } = useClientSession();
    const [mounted, setMounted] = useState(false);
    const [order, setOrder]   = useState<OrderData | null>(null);
    const [items, setItems]   = useState<OrderItem[]>([]);
    const [client, setClient] = useState<ClientData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!session) return;

        async function fetchData() {
            const [{ data: orderData }, { data: itemsData }, { data: clientData }] = await Promise.all([
                supabase
                    .from("orders")
                    .select("id, client, client_id, products, status, created_at")
                    .eq("id", id)
                    .eq("client_id", session!.clientId)
                    .single(),
                supabase
                    .from("order_items")
                    .select("id, product_name, unit, quantity, unit_price, total_price")
                    .eq("order_id", id),
                supabase
                    .from("clients")
                    .select("name, phone, address")
                    .eq("id", session!.clientId)
                    .single(),
            ]);

            setOrder(orderData as OrderData ?? null);
            setItems((itemsData as OrderItem[]) ?? []);
            setClient(clientData as ClientData ?? null);
            setLoading(false);
        }

        fetchData();
    }, [session, id]);

    if (!mounted || sessionLoading || !session) return null;

    const totalValue = items.reduce((s, i) => s + Number(i.total_price), 0);
    const hasItems   = items.length > 0;
    const fallbackLines = order?.products.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .receipt-card { box-shadow: none !important; border: none !important; }
                }
            `}</style>

            <div className="min-h-screen bg-[#F9FAFB] print:bg-white">
                {/* Barra de ações — oculta ao imprimir */}
                <div className="no-print sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center justify-between">
                    <Link
                        href={`/cliente/pedido/${id}`}
                        className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar ao pedido
                    </Link>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-[#F97316] text-white rounded-full text-sm font-bold hover:bg-[#F97316]/90 transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir / Salvar PDF
                    </button>
                </div>

                <div className="max-w-2xl mx-auto px-4 py-8">
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-64" />
                            <Skeleton className="h-96 rounded-xl" />
                        </div>
                    ) : !order ? (
                        <div className="text-center py-24">
                            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="font-bold text-[#111827]">Pedido não encontrado</p>
                            <Link
                                href="/cliente/catalogo"
                                className="text-sm text-[#F97316] hover:underline mt-2 inline-block"
                            >
                                Voltar ao catálogo
                            </Link>
                        </div>
                    ) : (
                        <div className="receipt-card bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-8 print:p-0">

                            {/* Cabeçalho */}
                            <div className="flex items-start justify-between mb-6 pb-6 border-b border-[#E5E7EB]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#F97316]/10 rounded-lg flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-[#F97316]" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">RECIBO DE PEDIDO</p>
                                        <h1 className="text-xl font-bold text-[#111827]">
                                            Pedido #{String(order.id).padStart(4, "0")}
                                        </h1>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className={cn(
                                        "inline-block px-3 py-1 rounded-full text-xs font-bold border",
                                        STATUS_BADGE[order.status]
                                    )}>
                                        {STATUS_LABEL[order.status]}
                                    </span>
                                    <p className="text-xs text-[#6B7280] mt-1">{formatDate(order.created_at)}</p>
                                </div>
                            </div>

                            {/* Cliente */}
                            {client && (
                                <div className="mb-6">
                                    <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">CLIENTE</p>
                                    <p className="text-sm font-semibold text-[#111827]">{client.name}</p>
                                    <p className="text-sm text-[#6B7280]">{client.phone}</p>
                                    {client.address && (
                                        <p className="text-sm text-[#6B7280]">{client.address}</p>
                                    )}
                                </div>
                            )}

                            {/* Itens */}
                            <div className="mb-6">
                                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-3">ITENS</p>
                                {hasItems ? (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[#E5E7EB]">
                                                <th className="text-left pb-2 font-medium text-[#6B7280]">Produto</th>
                                                <th className="text-center pb-2 font-medium text-[#6B7280]">Qtd</th>
                                                <th className="text-right pb-2 font-medium text-[#6B7280]">Unit.</th>
                                                <th className="text-right pb-2 font-medium text-[#6B7280]">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F3F4F6]">
                                            {items.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="py-2.5 font-medium text-[#111827]">
                                                        {item.product_name}
                                                        <span className="text-xs text-[#6B7280] font-normal ml-1">({item.unit})</span>
                                                    </td>
                                                    <td className="py-2.5 text-center text-[#6B7280]">{item.quantity}</td>
                                                    <td className="py-2.5 text-right text-[#6B7280]">{formatCurrency(Number(item.unit_price))}</td>
                                                    <td className="py-2.5 text-right font-bold text-[#111827]">{formatCurrency(Number(item.total_price))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="space-y-1">
                                        {fallbackLines.map((line, i) => (
                                            <p key={i} className="text-sm text-[#111827]">• {line}</p>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Totais */}
                            {hasItems && totalValue > 0 && (
                                <div className="border-t border-[#E5E7EB] pt-4 space-y-1.5">
                                    <div className="flex justify-between text-sm text-[#6B7280]">
                                        <span>Subtotal</span>
                                        <span>{formatCurrency(totalValue)}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold pt-2 border-t border-[#E5E7EB]">
                                        <span className="text-[#111827]">Total</span>
                                        <span className="text-[#F97316]">{formatCurrency(totalValue)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Rodapé */}
                            <div className="mt-8 pt-4 border-t border-[#E5E7EB] text-center">
                                <p className="text-xs text-[#6B7280]">Obrigado pela preferência!</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
