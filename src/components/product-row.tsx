"use client";

import { memo, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "@/components/quantity-stepper";

export interface CatalogProduct {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
}

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ProductRowProps {
    product: CatalogProduct;
    quantity: number;
    icon: LucideIcon;
    /** Cor de tinta da categoria, para o selo e o filete lateral. */
    tone: { bg: string; ink: string };
    onQuantityChange: (product: CatalogProduct, quantity: number) => void;
}

/**
 * Uma linha do catálogo: selo da categoria, nome, especificação, preço e
 * seletor de quantidade.
 *
 * Substituiu o card com área de imagem grande. Como a loja não tem foto de
 * produto — só um ícone por categoria —, aquele bloco ocupava ~45% do card
 * sem informar nada, e cabiam só 2 produtos por tela no celular. Material de
 * construção se escolhe por nome, unidade e preço, então a linha densa mostra
 * o que importa e cabe 4x mais por tela.
 *
 * memo() é essencial aqui: sem ele, digitar a quantidade em um item
 * re-renderiza as 200+ linhas do catálogo a cada tecla.
 */
export const ProductRow = memo(function ProductRow({
    product,
    quantity,
    icon: Icon,
    tone,
    onQuantityChange,
}: ProductRowProps) {
    const handleChange = useCallback(
        (q: number) => onQuantityChange(product, q),
        [onQuantityChange, product]
    );

    const selected = quantity > 0;

    return (
        <article
            data-product={product.id}
            className={cn(
                "defer-offscreen group relative flex items-center gap-3 sm:gap-4 rounded-xl bg-white pl-3 pr-3 sm:pl-4 sm:pr-4 py-3",
                "ring-1 transition-colors duration-200",
                selected
                    ? "ring-stone-900/90 shadow-[0_4px_18px_rgba(28,25,23,0.09)]"
                    : "ring-stone-200/70 hover:ring-stone-300"
            )}
        >
            {/* Filete lateral com a cor da categoria — dá o código visual sem gastar altura */}
            <span
                aria-hidden
                className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
                style={{ background: selected ? "#C2410C" : tone.ink, opacity: selected ? 1 : 0.32 }}
            />

            {/* Selo da categoria */}
            <div
                className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: tone.bg }}
            >
                <Icon className="w-[18px] h-[18px]" style={{ color: tone.ink }} strokeWidth={1.7} />
            </div>

            {/* Nome + especificação */}
            <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-stone-900 leading-snug line-clamp-2">
                    {product.name}
                </h3>
                <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500 mt-0.5 truncate">
                    {product.subcategory ? `${product.subcategory} · ` : ""}
                    {product.unit}
                </p>
            </div>

            {/* Preço + quantidade */}
            <div className="shrink-0 flex flex-col items-end gap-1.5">
                <p
                    className="text-stone-900 tabular-nums leading-none whitespace-nowrap"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "16px" }}
                >
                    {formatCurrency(product.price)}
                </p>
                <QuantityStepper
                    value={quantity}
                    label={product.name}
                    onChange={handleChange}
                    size="compact"
                    className="w-[124px]"
                />
            </div>
        </article>
    );
});
