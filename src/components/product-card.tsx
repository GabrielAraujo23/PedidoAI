"use client";

import { memo, useCallback } from "react";
import { Check, Plus } from "lucide-react";
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

interface ProductCardProps {
    product: CatalogProduct;
    quantity: number;
    icon: LucideIcon;
    /** Tinta quente da categoria — pinta a capa, o traçado e o selo. */
    tone: { bg: string; ink: string };
    onQuantityChange: (product: CatalogProduct, quantity: number) => void;
}

/**
 * Card de produto do catálogo.
 *
 * A capa não tem foto — a loja não cadastra imagem —, então em vez de um
 * ícone solto num retângulo chapado ela recebe uma malha técnica discreta,
 * tipo papel de planta baixa, com um halo suave atrás do ícone. Dá textura
 * e profundidade e combina com material de construção, sem inventar uma
 * imagem que não existe.
 *
 * memo() é essencial: sem ele, digitar a quantidade em um card
 * re-renderiza os 200+ cards do catálogo a cada tecla.
 */
export const ProductCard = memo(function ProductCard({
    product,
    quantity,
    icon: Icon,
    tone,
    onQuantityChange,
}: ProductCardProps) {
    const handleChange = useCallback(
        (q: number) => onQuantityChange(product, q),
        [onQuantityChange, product]
    );

    const toggle = useCallback(
        () => onQuantityChange(product, quantity > 0 ? 0 : 1),
        [onQuantityChange, product, quantity]
    );

    const selected = quantity > 0;

    // Vários produtos repetem a categoria no campo subcategoria ("Ferragens" /
    // "Ferragens"). Como a capa já estampa a categoria, só mostramos a
    // subcategoria quando ela de fato acrescenta algo.
    const subtitle =
        product.subcategory && product.subcategory.trim().toLowerCase() !== product.category.trim().toLowerCase()
            ? product.subcategory
            : null;

    return (
        <article
            data-product={product.id}
            className={cn(
                "defer-offscreen group relative flex flex-col rounded-2xl overflow-hidden bg-white",
                "transition-[box-shadow,transform,outline-color] duration-300 ease-out",
                "outline outline-offset-0",
                selected
                    ? "outline-2 outline-orange-700 shadow-[0_10px_34px_-8px_rgba(154,52,18,0.28)]"
                    : "outline-1 outline-stone-200/80 hover:outline-stone-300 hover:shadow-[0_10px_28px_-10px_rgba(28,25,23,0.18)] hover:-translate-y-[3px]"
            )}
            style={{ containIntrinsicSize: "auto 320px" }}
        >
            {/* ── Capa ───────────────────────────────────────────────── */}
            <div
                className="relative aspect-[5/4] overflow-hidden"
                style={{ background: tone.bg }}
            >
                {/* Malha técnica + halo central numa camada só.
                    O gradiente radial vem primeiro para apagar a malha atrás
                    do ícone; empilhar em um elemento evita 205 divs extras. */}
                <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                        backgroundImage:
                            `radial-gradient(circle at 50% 46%, ${tone.bg} 24%, transparent 60%),` +
                            `linear-gradient(${tone.ink}1A 1px, transparent 1px),` +
                            `linear-gradient(90deg, ${tone.ink}1A 1px, transparent 1px)`,
                        backgroundSize: "100% 100%, 18px 18px, 18px 18px",
                    }}
                />

                {/* Ícone da categoria */}
                <Icon
                    className={cn(
                        "absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2",
                        "w-[46px] h-[46px] transition-transform duration-500 ease-out",
                        "group-hover:scale-[1.08] group-hover:-rotate-2"
                    )}
                    style={{ color: tone.ink, opacity: 0.5 }}
                    strokeWidth={1.35}
                />

                {/* Categoria */}
                <p
                    className="absolute top-3 left-3.5 text-[9px] uppercase tracking-[0.22em] font-bold"
                    style={{ color: tone.ink, opacity: 0.75 }}
                >
                    {product.category.split(" ")[0]}
                </p>

                {/* Selo de quantidade */}
                {selected ? (
                    <div className="absolute top-2.5 right-2.5 min-w-[26px] h-[26px] px-2 bg-orange-700 text-white rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums shadow-[0_2px_10px_rgba(154,52,18,0.4)]">
                        {quantity}
                    </div>
                ) : null}

                {/* Filete de base com a tinta da categoria */}
                <div
                    aria-hidden
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ background: selected ? "#C2410C" : tone.ink, opacity: selected ? 1 : 0.18 }}
                />
            </div>

            {/* ── Corpo ──────────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 p-3.5 sm:p-4">
                <h3 className="font-semibold text-stone-900 text-[14px] leading-snug line-clamp-2">
                    {product.name}
                </h3>

                {subtitle ? (
                    <p
                        className="text-[12px] text-stone-500 leading-tight mt-0.5"
                        style={{ fontStyle: "italic", fontFamily: "var(--font-display)" }}
                    >
                        {subtitle}
                    </p>
                ) : null}

                <p className="text-[9.5px] uppercase tracking-[0.2em] text-stone-400 font-semibold mt-1.5">
                    {product.unit}
                </p>

                {/* Empurra preço e controles para a base, alinhando cards de alturas diferentes */}
                <div className="mt-auto pt-3">
                    <div className="flex items-end justify-between gap-2 pt-3 border-t border-stone-100">
                        <p
                            className="text-stone-900 tabular-nums leading-none"
                            style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "21px" }}
                        >
                            {formatCurrency(product.price)}
                        </p>

                        <button
                            type="button"
                            onClick={toggle}
                            aria-label={
                                selected
                                    ? `Remover ${product.name} do carrinho`
                                    : `Adicionar ${product.name} ao carrinho`
                            }
                            className={cn(
                                "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center shadow-sm cursor-pointer",
                                "transition-colors duration-200 active:scale-95",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2",
                                selected
                                    ? "bg-orange-700 text-white hover:bg-orange-800"
                                    : "bg-stone-900 text-white hover:bg-stone-800"
                            )}
                        >
                            {selected
                                ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                                : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />}
                        </button>
                    </div>

                    <QuantityStepper
                        value={quantity}
                        label={product.name}
                        onChange={handleChange}
                        className="mt-2.5"
                    />
                </div>
            </div>
        </article>
    );
});
