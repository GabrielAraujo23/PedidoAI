"use client";

import React from "react";
import {
    DndContext,
    closestCorners,
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
import { supabase } from "@/lib/supabase";
import { Order, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMNS: { id: Status; title: string; dot: string; badge: string }[] = [
    { id: "novo",       title: "Novo",       dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-600" },
    { id: "confirmado", title: "Confirmado", dot: "bg-orange-400", badge: "bg-orange-50 text-orange-600" },
    { id: "rota",       title: "Em Rota",    dot: "bg-purple-500", badge: "bg-purple-50 text-purple-600" },
    { id: "entregue",   title: "Entregue",   dot: "bg-green-500",  badge: "bg-green-50 text-green-600" },
];

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
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

export function KanbanBoard({ orders, setOrders }: KanbanBoardProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        const isColumn = COLUMNS.some((col) => col.id === overId);

        let updatedOrders: Order[] = [];

        setOrders((prev) => {
            const activeOrder = prev.find((o) => o.id === activeId);
            if (!activeOrder) return prev;

            let next: Order[];
            if (isColumn) {
                if (activeOrder.status === overId) return prev;
                next = prev.map((o) => o.id === activeId ? { ...o, status: overId as Status } : o);
            } else {
                const overOrder = prev.find((o) => o.id === overId);
                if (!overOrder) return prev;
                const updated = prev.map((o) => o.id === activeId ? { ...o, status: overOrder.status } : o);
                const oldIndex = updated.findIndex((o) => o.id === activeId);
                const newIndex = updated.findIndex((o) => o.id === overId);
                next = arrayMove(updated, oldIndex, newIndex);
            }

            updatedOrders = next;
            return next;
        });

        if (updatedOrders.length === 0) return;

        const updates = updatedOrders
            .filter((o) => {
                const original = orders.find((orig) => orig.id === o.id);
                return original && (original.status !== o.status || original.position !== o.position);
            })
            .map((o) => {
                const colOrders = updatedOrders.filter((x) => x.status === o.status);
                const position = colOrders.findIndex((x) => x.id === o.id);
                return { id: o.id, status: o.status, position };
            });

        for (const u of updates) {
            await supabase.from("orders").update({ status: u.status, position: u.position }).eq("id", u.id);
        }
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-2 gap-3 h-full">
                {COLUMNS.map((col) => {
                    const colOrders = orders.filter((o) => o.status === col.id);
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
                                        <KanbanItem
                                            key={order.id}
                                            id={order.id}
                                            client={order.client}
                                            products={order.products}
                                            status={order.status}
                                            created_at={order.created_at}
                                        />
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
    );
}
