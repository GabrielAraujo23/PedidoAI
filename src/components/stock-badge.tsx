// src/components/stock-badge.tsx
import { cn } from "@/lib/utils";

interface StockBadgeProps {
    quantity: number;
    threshold?: number;
    showNumber?: boolean;
    className?: string;
}

export function StockBadge({ quantity, threshold = 5, showNumber = true, className }: StockBadgeProps) {
    const status = quantity === 0 ? "zero" : quantity <= threshold ? "low" : "ok";

    const config = {
        ok:  { dot: "bg-success", bg: "bg-success-surface border-success/30 text-success" },
        low: { dot: "bg-warning", bg: "bg-warning-surface border-warning/30 text-warning" },
        zero:{ dot: "bg-destructive", bg: "bg-destructive-surface border-destructive/30 text-destructive" },
    }[status];

    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold",
            config.bg, className
        )}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
            {showNumber ? `${quantity} em estoque` : status === "zero" ? "Zerado" : status === "low" ? "Baixo" : "OK"}
        </span>
    );
}
