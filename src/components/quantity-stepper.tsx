"use client";

import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mesmo teto de validateQuantity() em @/lib/validators. */
export const MAX_QUANTITY = 9_999;

interface QuantityStepperProps {
    value: number;
    onChange: (quantity: number) => void;
    /** Nome do produto — compõe o rótulo acessível dos controles. */
    label: string;
    /**
     * "compact" estreita os botões para caber nas linhas do catálogo.
     * A altura continua 44px nos dois tamanhos: em lista densa o espaço
     * apertado é o horizontal, então encolhemos só a largura e o alvo de
     * toque segue confortável no eixo vertical.
     */
    size?: "md" | "compact";
    className?: string;
}

/**
 * Seletor de quantidade com campo digitável.
 *
 * O número é um <input> de verdade, não um <span>: toca/clica e o cursor
 * pisca ali, com teclado numérico no celular (inputMode="numeric") e digitação
 * livre no desktop. Ao focar, o valor atual já vem selecionado — digitar "50"
 * substitui direto, sem precisar apertar "+" cinquenta vezes.
 *
 * Usamos type="text" + inputMode="numeric" em vez de type="number" de propósito:
 * type="number" muda o valor sem querer ao rolar a página com o cursor em cima,
 * e desenha setinhas de incremento no desktop que brigam com os botões daqui.
 */
export function QuantityStepper({
    value,
    onChange,
    label,
    size = "md",
    className,
}: QuantityStepperProps) {
    // Enquanto o cliente digita mantemos o texto cru, para que apagar o campo
    // não force um "0" no meio da edição. Ao sair/confirmar, normalizamos.
    const [draft, setDraft] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const shown = draft ?? String(value);
    const btnWidth = size === "compact" ? "w-9" : "w-11";

    function commit(raw: string) {
        const digits = raw.replace(/\D/g, "");
        const parsed = digits === "" ? 0 : Math.min(parseInt(digits, 10), MAX_QUANTITY);
        setDraft(null);
        if (parsed !== value) onChange(parsed);
    }

    return (
        <div
            className={cn(
                "flex items-stretch rounded-xl bg-stone-100 ring-1 ring-stone-200/80 overflow-hidden",
                "focus-within:ring-2 focus-within:ring-orange-600",
                className
            )}
        >
            <button
                type="button"
                aria-label={`Diminuir quantidade de ${label}`}
                onClick={() => onChange(Math.max(0, value - 1))}
                disabled={value <= 0}
                className={cn(
                    btnWidth,
                    "h-11 shrink-0 flex items-center justify-center text-stone-600 cursor-pointer",
                    "hover:bg-stone-200 active:bg-stone-300 transition-colors",
                    "disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-600"
                )}
            >
                <Minus className="w-4 h-4" strokeWidth={2.5} />
            </button>

            <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                aria-label={`Quantidade de ${label}`}
                value={shown}
                // Seleciona tudo ao focar: digitar já substitui o valor inteiro.
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onBlur={(e) => commit(e.currentTarget.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        commit(e.currentTarget.value);
                        inputRef.current?.blur();
                    } else if (e.key === "Escape") {
                        setDraft(null);
                        inputRef.current?.blur();
                    }
                }}
                className={cn(
                    "flex-1 min-w-0 w-full h-11 bg-white text-center tabular-nums cursor-text",
                    "text-[15px] font-bold text-stone-900",
                    // caret laranja e grosso o suficiente para a barra piscando ficar óbvia
                    "caret-orange-700",
                    "border-x border-stone-200/80 outline-none",
                    "focus:bg-orange-50/70 transition-colors"
                )}
            />

            <button
                type="button"
                aria-label={`Aumentar quantidade de ${label}`}
                onClick={() => onChange(Math.min(MAX_QUANTITY, value + 1))}
                disabled={value >= MAX_QUANTITY}
                className={cn(
                    btnWidth,
                    "h-11 shrink-0 flex items-center justify-center text-stone-600 cursor-pointer",
                    "hover:bg-stone-200 active:bg-stone-300 transition-colors",
                    "disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-600"
                )}
            >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
        </div>
    );
}
