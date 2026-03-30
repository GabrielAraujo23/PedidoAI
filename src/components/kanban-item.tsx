"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Truck, Clock } from "lucide-react";
import { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

interface KanbanItemProps {
    id: string;
    client: string;
    products: string;
    status: Status;
    created_at?: string;
}

const STATUS_ICONS: Record<Status, React.ReactNode> = {
    novo: <Clock className="w-4 h-4 text-blue-500" />,
    confirmado: <CheckCircle2 className="w-4 h-4 text-orange-500" />,
    rota: <Truck className="w-4 h-4 text-teal-500" />,
    entregue: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};

function formatRelativeTime(dateStr?: string) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Ontem";
    return `${diffDays}d atrás`;
}

export function KanbanItem({ id, client, products, status, created_at }: KanbanItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
    const formattedId = `#ORD-${id.padStart(4, "0")}`;

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <Card className={cn(
                "border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing bg-white group",
                isDragging && "shadow-xl ring-2 ring-primary/20 rotate-1"
            )}>
                <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                            {formattedId}
                        </span>
                        <span className="text-xs text-slate-400">{formatRelativeTime(created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{client}</p>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{products}</p>
                    <div className="flex items-center justify-end pt-1 border-t border-slate-100">
                        {STATUS_ICONS[status]}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
