"use client";

import React, { useState } from "react";
import {
    DndContext,
    closestCorners,
    pointerWithin,
    CollisionDetection,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    useDroppable,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KanbanItem } from "./kanban-item";
import { Order, Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLUMNS: { id: Status; title: string; dot: string; badge: string }[] = [
    { id: "novo",       title: "Novo",       dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-600" },
    { id: "confirmado", title: "Confirmado", dot: "bg-orange-400", badge: "bg-orange-50 text-orange-600" },
    { id: "rota",       title: "Em Rota",    dot: "bg-purple-500", badge: "bg-purple-50 text-purple-600" },
    { id: "entregue",   title: "Entregue",   dot: "bg-green-500",  badge: "bg-green-50 text-green-600" },
    { id: "cancelado",  title: "Cancelado",  dot: "bg-red-400",    badge: "bg-red-50 text-red-700" },
];

const PAYMENT_OPTIONS: { value: PaymentValue; label: string }[] = [
    { value: "pix",      label: "Pix" },
    { value: "credito",  label: "Cartão de Crédito" },
    { value: "debito",   label: "Cartão de Débito" },
    { value: "dinheiro", label: "Dinheiro" },
];

type PaymentValue = "pix" | "credito" | "debito" | "dinheiro";
type DeliveryValue = "delivery" | "retirada";

interface ConfirmDetails {
    payment_method: PaymentValue;
    delivery_type: DeliveryValue;
    delivery_fee?: number;
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex-1 space-y-3 p-2 rounded-xl bg-slate-50/60 border border-slate-100 min-h-[400px] transition-colors duration-150",
                isOver && "bg-primary/5 border-primary/30"
            )}
        >
            {children}
        </div>
    );
}

interface KanbanBoardProps {
    /** Lista completa — fonte da verdade para persistência. */
    orders: Order[];
    /** Subconjunto exibido no board (após busca/filtro). */
    visibleOrders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

export function KanbanBoard({ orders, visibleOrders, setOrders }: KanbanBoardProps) {
    const [pendingMove, setPendingMove] = useState<{ activeId: string; overId: string } | null>(null);
    const [payment, setPayment] = useState<PaymentValue>("pix");
    const [delivery, setDelivery] = useState<DeliveryValue>("delivery");
    const [fee, setFee] = useState("0");
    const [saving, setSaving] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // closestCorners sozinho falha ao soltar em colunas vazias: uma coluna vazia
    // herda altura total via CSS Grid (stretch), então seus cantos ficam mais
    // distantes do ponteiro do que os cantos de um card compacto na coluna vizinha,
    // e o drop "escorrega" para a coluna errada. pointerWithin testa se o ponteiro
    // está de fato dentro do retângulo, resolvendo isso; closestCorners fica só
    // como fallback para quando o ponteiro sai de toda a área do board.
    const collisionDetection: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
    };

    /** Calcula a lista reordenada de forma síncrona (sem depender do setState). */
    function computeNext(activeId: string, overId: string): Order[] | null {
        const activeOrder = orders.find((o) => o.id === activeId);
        if (!activeOrder) return null;

        const isColumn = COLUMNS.some((col) => col.id === overId);

        if (isColumn) {
            if (activeOrder.status === overId) return null;
            return orders.map((o) => o.id === activeId ? { ...o, status: overId as Status } : o);
        }

        const overOrder = orders.find((o) => o.id === overId);
        if (!overOrder) return null;

        const updated = orders.map((o) => o.id === activeId ? { ...o, status: overOrder.status } : o);
        const oldIndex = updated.findIndex((o) => o.id === activeId);
        const newIndex = updated.findIndex((o) => o.id === overId);
        return arrayMove(updated, oldIndex, newIndex);
    }

    /** Aplica o movimento na UI e persiste via API (que também dispara o WhatsApp). */
    async function applyMove(activeId: string, overId: string, details?: ConfirmDetails) {
        const next = computeNext(activeId, overId);
        if (!next) return;

        const snapshot = orders;
        setOrders(next);

        const updates = next
            .map((o) => {
                const original = snapshot.find((orig) => orig.id === o.id);
                const position = next.filter((x) => x.status === o.status).findIndex((x) => x.id === o.id);
                return { order: o, original, position };
            })
            .filter(({ order, original, position }) =>
                original && (original.status !== order.status || original.position !== position)
            );

        for (const { order, original, position } of updates) {
            const body: Record<string, unknown> = { status: order.status, position };
            if (details && order.id === activeId) {
                body.payment_method = details.payment_method;
                body.delivery_type = details.delivery_type;
                if (details.delivery_fee !== undefined) body.delivery_fee = details.delivery_fee;
            }

            const res = await fetch(`/api/orders/${order.id}/status`, {
                method:  "PATCH",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body),
            }).catch(() => null);

            if (!res?.ok) {
                console.error("[kanban] falha ao salvar pedido", order.id, original?.status, "->", order.status);
                setOrders(snapshot);
                return;
            }
        }
    }

    /** Move um pedido para um status-alvo, abrindo o modal de confirmação quando necessário. */
    function moveToStatus(activeId: string, targetStatus: Status) {
        const activeOrder = orders.find((o) => o.id === activeId);
        if (!activeOrder || activeOrder.status === targetStatus) return;

        // Confirmar exige os dados de pagamento/entrega para montar a mensagem
        if (targetStatus === "confirmado") {
            setPayment("pix");
            setDelivery("delivery");
            setFee("0");
            setPendingMove({ activeId, overId: targetStatus });
            return;
        }

        void applyMove(activeId, targetStatus);
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        const isColumn = COLUMNS.some((col) => col.id === overId);
        if (isColumn) {
            moveToStatus(activeId, overId as Status);
            return;
        }

        // Soltou sobre outro card: reordenar/mover para o status desse card
        const overOrder = orders.find((o) => o.id === overId);
        const activeOrder = orders.find((o) => o.id === activeId);
        if (!overOrder || !activeOrder) return;

        if (overOrder.status === "confirmado" && activeOrder.status !== "confirmado") {
            setPayment("pix");
            setDelivery("delivery");
            setFee("0");
            setPendingMove({ activeId, overId });
            return;
        }

        void applyMove(activeId, overId);
    }

    async function handleConfirmSubmit() {
        if (!pendingMove) return;
        setSaving(true);
        const parsedFee = parseFloat(fee.replace(",", ".")) || 0;
        await applyMove(pendingMove.activeId, pendingMove.overId, {
            payment_method: payment,
            delivery_type: delivery,
            delivery_fee: delivery === "delivery" ? parsedFee : 0,
        });
        setSaving(false);
        setPendingMove(null);
    }

    return (
        <>
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-5 gap-3 h-full">
                    {COLUMNS.map((col) => {
                        const colOrders = visibleOrders.filter((o) => o.status === col.id);
                        return (
                            <div key={col.id} className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 px-1">
                                    <span className={cn("w-2 h-2 rounded-full", col.dot)} />
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{col.title}</span>
                                    <span className={cn("ml-auto text-xs font-semibold px-2 py-0.5 rounded-full", col.badge)}>
                                        {String(colOrders.length).padStart(2, "0")}
                                    </span>
                                </div>

                                <SortableContext
                                    id={col.id}
                                    items={colOrders.map((o) => o.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <DroppableColumn id={col.id}>
                                        {colOrders.map((order) => (
                                            <div
                                                key={order.id}
                                                className={cn(
                                                    order.status === "cancelado" && "opacity-60"
                                                )}
                                            >
                                                <KanbanItem
                                                    id={order.id}
                                                    client={order.client}
                                                    products={order.products}
                                                    status={order.status}
                                                    created_at={order.created_at}
                                                    cancelled={order.status === "cancelado"}
                                                    onMoveTo={(target) => moveToStatus(order.id, target)}
                                                />
                                            </div>
                                        ))}
                                        {colOrders.length === 0 && (
                                            <p className="text-xs text-slate-400 text-center pt-6">Nenhum pedido</p>
                                        )}
                                    </DroppableColumn>
                                </SortableContext>
                            </div>
                        );
                    })}
                </div>
            </DndContext>

            <Dialog open={pendingMove !== null} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirmar pedido</DialogTitle>
                        <DialogDescription>
                            Esses dados entram na mensagem de confirmação enviada ao cliente pelo WhatsApp.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            <Label>Forma de pagamento</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {PAYMENT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setPayment(opt.value)}
                                        className={cn(
                                            "h-10 rounded-lg border text-sm font-medium transition-colors",
                                            payment === opt.value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Entrega</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {([["delivery", "🛵 Delivery"], ["retirada", "🏪 Retirada"]] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setDelivery(value)}
                                        className={cn(
                                            "h-10 rounded-lg border text-sm font-medium transition-colors",
                                            delivery === value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {delivery === "delivery" && (
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="fee">Taxa de entrega (R$)</Label>
                                <Input
                                    id="fee"
                                    inputMode="decimal"
                                    value={fee}
                                    onChange={(e) => setFee(e.target.value)}
                                    placeholder="0,00"
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingMove(null)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-white"
                            onClick={handleConfirmSubmit}
                            disabled={saving}
                        >
                            {saving ? "Confirmando..." : "Confirmar e notificar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
