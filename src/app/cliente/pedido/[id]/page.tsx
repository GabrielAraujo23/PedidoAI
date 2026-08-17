"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    CheckCircle, Clock, Truck, Star,
    Package, MessageCircle, Plus, Loader2, XCircle, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/components/copy-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientHeader } from "@/components/client-header";
import { useClientSession } from "@/lib/client-session";
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


const STATUS_ORDER: Record<Status, number> = {
    novo: 0, confirmado: 1, rota: 2, entregue: 3, cancelado: -1,
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
    const { t } = useCopy();

        // Dentro do componente: em escopo de módulo isto seria montado quando
        // o arquivo carrega, antes de existir loja, e os rótulos ignorariam o
        // lojista para sempre.
    const STEPS: { status: Status; label: string; Icon: typeof Package }[] = [
        { status: "novo",       label: t("pedido.status_novo"),       Icon: Clock },
        { status: "confirmado", label: t("pedido.status_confirmado"), Icon: CheckCircle },
        { status: "rota",       label: t("pedido.status_rota"),       Icon: Truck },
        { status: "entregue",   label: t("pedido.status_entregue"),   Icon: Star },
    ];

    const { id } = useParams<{ id: string }>();
    const { session, loading: sessionLoading } = useClientSession();
    const [mounted, setMounted] = useState(false);
    const [order, setOrder] = useState<OrderData | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling]       = useState(false);
    const [cancelError, setCancelError]     = useState<string | null>(null);
    const [confirmCancel, setConfirmCancel] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!session) return;

        async function fetchOrder() {
            try {
                const res = await fetch(`/api/cliente/pedido/${encodeURIComponent(id)}`);
                if (!res.ok) { setLoading(false); return; }
                const json = await res.json();
                setOrder(json.order as OrderData);
                setItems((json.items as OrderItem[]) ?? []);
            } catch (e) {
                console.error("[pedido] fetch:", e);
            }
            setLoading(false);
        }

        fetchOrder();
    }, [session, id]);

    async function handleCancel() {
        setCancelling(true);
        setCancelError(null);
        const res = await fetch(`/api/cliente/pedido/${id}/cancelar`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
        }).catch(() => null);
        if (!res) {
            setCancelError("Erro de rede. Tente novamente.");
            setCancelling(false);
            return;
        }
        const data = await res.json() as { error?: string };
        if (!res.ok) {
            setCancelError(data.error ?? "Erro ao cancelar.");
            setCancelling(false);
            return;
        }
        setOrder((prev) => prev ? { ...prev, status: "cancelado" } : prev);
        setConfirmCancel(false);
        setCancelling(false);
    }

    if (!mounted || sessionLoading || !session) return null;

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
            <ClientHeader session={session} />

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
                        <Package className="w-12 h-12 text-muted-foreground/70 mx-auto mb-3" />
                        <p className="font-bold text-[#111827]">{t("pedido.nao_encontrado")}</p>
                        <Link href="/cliente/catalogo" className="text-sm text-[#F97316] hover:underline mt-2 inline-block">
                            Voltar ao cardápio
                        </Link>
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-6">

                        {/* ── Left column ──────────────────────────────────── */}
                        <div className="flex-1 space-y-4">

                            {order.status === "cancelado" ? (
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm text-center">
                                    <div className="w-14 h-14 bg-destructive-surface rounded-full flex items-center justify-center mx-auto mb-3">
                                        <XCircle className="w-8 h-8 text-destructive" />
                                    </div>
                                    <h1 className="text-2xl font-bold text-[#111827] mb-2">Pedido #{order.id} cancelado</h1>
                                    <p className="text-sm text-[#6B7280] mb-5">{t("pedido.cancelado")}</p>
                                    <Link
                                        href="/cliente/catalogo"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#F97316] text-[#F97316] rounded-full text-sm font-bold hover:bg-[#F97316]/5 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {t("pedido.fazer_novo")}
                                    </Link>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm text-center">
                                    <div className="w-14 h-14 bg-[#22C55E]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle className="w-8 h-8 text-[#22C55E]" />
                                    </div>
                                    <p className="text-xs font-bold text-[#F97316] uppercase tracking-wider mb-1">{t("pedido.sucesso")}</p>
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
                                            href="/cliente/catalogo"
                                            className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#F97316] text-[#F97316] rounded-full text-sm font-bold hover:bg-[#F97316]/5 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {t("pedido.fazer_novo")}
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {order.status === "cancelado" ? (
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-destructive-surface flex items-center justify-center shrink-0">
                                        <XCircle className="w-5 h-5 text-destructive" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-[#111827]">{t("pedido.cancelado_label")}</p>
                                        <p className="text-sm text-[#6B7280]">
                                            Pedido feito em {order.created_at ? formatDate(order.created_at) : "—"}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                    <h2 className="font-bold text-[#111827] mb-6">{t("pedido.status_envio")}</h2>

                                    <div className="relative flex justify-between">
                                        <div className="absolute top-5 left-0 right-0 h-0.5 bg-[#E5E7EB]" />
                                        <div
                                            className="absolute top-5 left-0 h-0.5 bg-[#22C55E] transition-all duration-500"
                                            style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
                                        />

                                        {STEPS.map((step, idx) => {
                                            const done   = idx < currentStepIndex;
                                            const active = idx === currentStepIndex;
                                            const Icon   = step.Icon;

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
                                                        <p className="text-[10px] text-[#6B7280] mt-0.5">{t("pedido.a_caminho")}</p>
                                                    )}
                                                    {done && order.created_at && (
                                                        <p className="text-[10px] text-[#6B7280] mt-0.5">{formatDate(order.created_at)}</p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right sidebar ─────────────────────────────────── */}
                        <div className="w-full lg:w-96 shrink-0">
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm sticky top-20">
                                <h2 className="font-bold text-[#111827] mb-4">{t("pedido.resumo")}</h2>

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
                                                <span>{t("pedido.subtotal")}</span>
                                                <span>{formatCurrency(totalValue)}</span>
                                            </div>
                                            <div className="flex justify-between text-[#6B7280]">
                                                <span>{t("pedido.taxa_entrega")}</span>
                                                <span className="text-[#22C55E] font-medium">{t("pedido.a_calcular")}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-base pt-1">
                                                <span className="text-[#111827]">{t("pedido.total")}</span>
                                                <span className="text-[#F97316]">{formatCurrency(totalValue)}</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="border-t border-[#E5E7EB] mt-3 pt-3 space-y-2">
                                    <div>
                                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">{t("pedido.cliente")}</p>
                                        <p className="text-sm text-[#111827] mt-0.5">{order.client}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">{t("pedido.pedido_feito_em")}</p>
                                        <p className="text-sm text-[#111827] mt-0.5">
                                            {order.created_at ? formatDate(order.created_at) : "—"}
                                        </p>
                                    </div>
                                </div>

                                {order.status === "novo" && (
                                    <div className="border-t border-[#E5E7EB] mt-3 pt-3">
                                        {!confirmCancel ? (
                                            <button
                                                onClick={() => setConfirmCancel(true)}
                                                disabled={cancelling}
                                                className="w-full h-10 border border-destructive/40 text-destructive rounded-full text-sm font-bold hover:bg-destructive-surface transition-colors disabled:opacity-50"
                                            >
                                                {t("pedido.cancelar_pedido")}
                                            </button>
                                        ) : (
                                            <div className="bg-destructive-surface border border-destructive/30 rounded-xl p-4 space-y-3">
                                                <p className="text-sm font-semibold text-destructive">{t("pedido.tem_certeza")}</p>
                                                <p className="text-xs text-destructive">{t("pedido.acao_nao_desfeita")}</p>
                                                {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => { setConfirmCancel(false); setCancelError(null); }}
                                                        disabled={cancelling}
                                                        className="flex-1 h-9 border border-destructive/40 text-destructive rounded-full text-xs font-bold hover:bg-card transition-colors disabled:opacity-50"
                                                    >
                                                        {t("pedido.manter")}
                                                    </button>
                                                    <button
                                                        onClick={handleCancel}
                                                        disabled={cancelling}
                                                        className="flex-1 h-9 bg-destructive text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                                    >
                                                        {cancelling && <Loader2 className="w-3 h-3 animate-spin" />}
                                                        {t("pedido.sim_cancelar")}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <Link
                                    href={`/cliente/pedido/${order.id}/recibo`}
                                    className="mt-3 flex items-center justify-center gap-2 w-full h-10 bg-[#F97316] text-white rounded-full text-sm font-bold hover:bg-[#F97316]/90 transition-colors"
                                >
                                    <FileText className="w-4 h-4" />
                                    {t("pedido.ver_recibo")}
                                </Link>
                                <Link
                                    href="/cliente/catalogo"
                                    className="mt-2 flex items-center justify-center gap-2 w-full h-10 border border-[#F97316] text-[#F97316] rounded-full text-sm font-bold hover:bg-[#F97316]/5 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t("pedido.novo_pedido")}
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
