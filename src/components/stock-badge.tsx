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
        ok:  { dot: "bg-emerald-500", bg: "bg-emerald-50  border-emerald-200/60 text-emerald-700" },
        low: { dot: "bg-amber-400",   bg: "bg-amber-50   border-amber-200/60   text-amber-700"   },
        zero:{ dot: "bg-red-500",     bg: "bg-red-50     border-red-200/60     text-red-700"     },
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
