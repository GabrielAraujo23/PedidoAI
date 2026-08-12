"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
    const { aplicado, alternar } = useTheme();
    const paraEscuro = aplicado === "claro";

    return (
        <button
            onClick={alternar}
            title={paraEscuro ? "Mudar para o tema escuro" : "Mudar para o tema claro"}
            aria-label={paraEscuro ? "Mudar para o tema escuro" : "Mudar para o tema claro"}
            className={cn(
                "w-9 h-9 rounded-xl inline-flex items-center justify-center text-muted-foreground",
                "hover:bg-muted hover:text-foreground transition-colors",
                className
            )}
        >
            {paraEscuro ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
    );
}
