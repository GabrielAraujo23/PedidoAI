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
import { Badge } from "@/components/ui/badge";
import { KanbanItem } from "./kanban-item";
import { supabase } from "@/lib/supabase";
import { Order, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMNS = [
    { id: "novo", title: "Novo" },
    { id: "confirmado", title: "Confirmado" },
    { id: "rota", title: "Em Rota" },
    { id: "entregue", title: "Entregue" },
] as const;

// Registers a column as a drop target so empty columns accept dropped cards
function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex-1 space-y-3 p-2 rounded-xl bg-slate-50/50 border border-slate-100 min-h-[500px] transition-colors duration-150",
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
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
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
                // Dropped onto a column (including empty columns)
                if (activeOrder.status === overId) return prev;
                next = prev.map((o) =>
                    o.id === activeId ? { ...o, status: overId as Status } : o
                );
            } else {
                // Dropped onto another card — reorder within target column
                const overOrder = prev.find((o) => o.id === overId);
                if (!overOrder) return prev;

                const updated = prev.map((o) =>
                    o.id === activeId ? { ...o, status: overOrder.status } : o
                );

                const oldIndex = updated.findIndex((o) => o.id === activeId);
                const newIndex = updated.findIndex((o) => o.id === overId);
                next = arrayMove(updated, oldIndex, newIndex);
            }

            updatedOrders = next;
            return next;
        });

        if (updatedOrders.length === 0) return;

        // Persist only the cards whose status or position changed
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
            await supabase
                .from("orders")
                .update({ status: u.status, position: u.position })
                .eq("id", u.id);
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
        >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full">
                {COLUMNS.map((col) => (
                    <div key={col.id} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="font-semibold text-secondary flex items-center gap-2">
                                {col.title}
                                <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none">
                                    {orders.filter((o) => o.status === col.id).length}
                                </Badge>
                            </h3>
                        </div>

                        <SortableContext
                            id={col.id}
                            items={orders.filter((o) => o.status === col.id).map((o) => o.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <DroppableColumn id={col.id}>
                                {orders
                                    .filter((o) => o.status === col.id)
                                    .map((order) => (
                                        <KanbanItem
                                            key={order.id}
                                            id={order.id}
                                            client={order.client}
                                            products={order.products}
                                        />
                                    ))}
                            </DroppableColumn>
                        </SortableContext>
                    </div>
                ))}
            </div>
        </DndContext>
    );
}
