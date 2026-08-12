"use client";

import type { ElementType } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, Truck, Clock, PackageCheck, XCircle, MoreVertical } from "lucide-react";
import { Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const STATUS_LABELS: Record<Status, string> = {
    novo:       "Novo",
    confirmado: "Confirmado",
    rota:       "Em Rota",
    entregue:   "Entregue",
    cancelado:  "Cancelado",
};

const MOVE_ORDER: Status[] = ["novo", "confirmado", "rota", "entregue", "cancelado"];

interface KanbanItemProps {
    id: string;
    client: string;
    products: string;
    status: Status;
    created_at?: string;
    cancelled?: boolean;
    onMoveTo?: (status: Status) => void;
}

// As 5 cores de status não têm token dedicado na tabela de conversão do plano
// (só existem tokens para os 3 estados success/warning/destructive). Reaproveita
// a paleta categórica de --chart-1..5 para novo/confirmado/rota, que já é a
// paleta de 5 cores do produto, e os tokens semânticos para entregue (sucesso)
// e cancelado (erro). Mesma escolha usada em kanban-board.tsx — manter os dois
// em sincronia, e replicar em pedidos/page.tsx na Task 3 para consistência.
const STATUS_META: Record<Status, { icon: ElementType; color: string; bg: string; bar: string }> = {
    novo:       { icon: Clock,        color: "text-chart-2",   bg: "bg-chart-2/10",       bar: "bg-chart-2" },
    confirmado: { icon: CheckCircle2, color: "text-chart-4",   bg: "bg-chart-4/10",       bar: "bg-chart-4" },
    rota:       { icon: Truck,        color: "text-chart-5",   bg: "bg-chart-5/10",       bar: "bg-chart-5" },
    entregue:   { icon: PackageCheck, color: "text-success",   bg: "bg-success-surface",  bar: "bg-success" },
    cancelado:  { icon: XCircle,      color: "text-destructive", bg: "bg-destructive-surface", bar: "bg-destructive" },
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

export function KanbanItem({ id, client, products, status, created_at, cancelled, onMoveTo }: KanbanItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = { transform: CSS.Transform.toString(transform), transition };
    const meta  = STATUS_META[status];
    const Icon  = meta.icon;
    const formattedId = `#ORD-${id.padStart(4, "0")}`;
    const time = formatRelativeTime(created_at);

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <div className={cn(
                "relative bg-card rounded-xl border border-border/80 shadow-sm",
                "hover:shadow-md hover:border-border hover:-translate-y-0.5",
                "active:shadow-xl active:scale-[0.98] cursor-grab active:cursor-grabbing",
                "transition-all duration-150 overflow-hidden",
                isDragging && "opacity-50 rotate-1 shadow-2xl scale-105 border-primary/30",
                cancelled && "border-destructive/30"
            )}>
                {/* Left accent bar */}
                <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", meta.bar)} />

                {onMoveTo && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
                                aria-label="Mover pedido"
                            >
                                <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onPointerDown={(e) => e.stopPropagation()}>
                            {MOVE_ORDER.filter((s) => s !== status).map((s) => (
                                <DropdownMenuItem key={s} onClick={() => onMoveTo(s)}>
                                    Mover para {STATUS_LABELS[s]}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                <div className="pl-4 pr-3 pt-3 pb-3 space-y-2">
                    {/* Top row: ID + time */}
                    <div className="flex items-center justify-between pr-6">
                        <span className="text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md tracking-wide">
                            {formattedId}
                        </span>
                        {time && (
                            <span className="text-[10px] text-muted-foreground font-medium">{time}</span>
                        )}
                    </div>

                    {/* Client name */}
                    <p className="text-sm font-semibold text-foreground leading-snug">{client}</p>

                    {/* Products */}
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{products}</p>

                    {/* Footer */}
                    <div className="flex items-center justify-end pt-1 border-t border-border/80">
                        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold", meta.bg, meta.color)}>
                            <Icon className="w-3 h-3" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
