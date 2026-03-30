"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, Truck, Clock, PackageCheck } from "lucide-react";
import { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

interface KanbanItemProps {
    id: string;
    client: string;
    products: string;
    status: Status;
    created_at?: string;
}

const STATUS_META: Record<Status, { icon: React.ElementType; color: string; bg: string; bar: string }> = {
    novo:       { icon: Clock,        color: "text-blue-500",    bg: "bg-blue-50",    bar: "bg-blue-400" },
    confirmado: { icon: CheckCircle2, color: "text-amber-500",   bg: "bg-amber-50",   bar: "bg-amber-400" },
    rota:       { icon: Truck,        color: "text-violet-500",  bg: "bg-violet-50",  bar: "bg-violet-400" },
    entregue:   { icon: PackageCheck, color: "text-emerald-500", bg: "bg-emerald-50", bar: "bg-emerald-400" },
};

function formatRelativeTime(dateStr?: string) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000); // minutes
    if (diff < 60) return diff <= 1 ? "agora" : `${diff}min atrás`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h atrás`;
    const days = Math.floor(h / 24);
    if (days === 1) return "Ontem";
    return `${days}d atrás`;
}

export function KanbanItem({ id, client, products, status, created_at }: KanbanItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = { transform: CSS.Transform.toString(transform), transition };
    const meta  = STATUS_META[status];
    const Icon  = meta.icon;
    const formattedId = `#ORD-${id.padStart(4, "0")}`;
    const time = formatRelativeTime(created_at);

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <div className={cn(
                "relative bg-white rounded-xl border border-slate-200/80 shadow-sm",
                "hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5",
                "active:shadow-xl active:scale-[0.98] cursor-grab active:cursor-grabbing",
                "transition-all duration-150 overflow-hidden",
                isDragging && "opacity-50 rotate-1 shadow-2xl scale-105 border-primary/30"
            )}>
                {/* Left accent bar */}
                <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", meta.bar)} />

                <div className="pl-4 pr-3 pt-3 pb-3 space-y-2">
                    {/* Top row: ID + time */}
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-orange-500 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-md tracking-wide">
                            {formattedId}
                        </span>
                        {time && (
                            <span className="text-[10px] text-slate-400 font-medium">{time}</span>
                        )}
                    </div>

                    {/* Client name */}
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{client}</p>

                    {/* Products */}
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{products}</p>

                    {/* Footer */}
                    <div className="flex items-center justify-end pt-1 border-t border-slate-100/80">
                        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold", meta.bg, meta.color)}>
                            <Icon className="w-3 h-3" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
