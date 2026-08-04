"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutGrid, Waves, Zap, Plug, Wrench,
    Package, Home, Paintbrush, AlignJustify,
    ShoppingCart, AlertCircle, Check, ArrowUpRight,
    ArrowDownWideNarrow, ArrowUpNarrowWide, ArrowDownAZ, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ClientHeader } from "@/components/client-header";
import { ProductRow, type CatalogProduct } from "@/components/product-row";
import { useCart } from "@/context/CartContext";
import { useClientSession } from "@/lib/client-session";
import type { LucideIcon } from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
    "Todos":                    LayoutGrid,
    "Canos":                    Waves,
    "Eletricidade e Cabos":     Zap,
    "Eletroduto e Lavanderia":  Plug,
    "Ferragens":                Wrench,
    "Outros Produtos":          Package,
    "Telhas":                   Home,
    "Tintas e Massas":          Paintbrush,
    "Vigas e Cantoneiras":      AlignJustify,
};

// Tons quentes por categoria — servem de código visual no selo e no filete.
const CATEGORY_TONES: Record<string, { bg: string; ink: string }> = {
    "Canos":                    { bg: "#EFE4D2", ink: "#8B6F4E" },
    "Eletricidade e Cabos":     { bg: "#EADCC8", ink: "#9C7E5A" },
    "Eletroduto e Lavanderia":  { bg: "#E8DAC4", ink: "#947456" },
    "Ferragens":                { bg: "#E2D6C2", ink: "#7E6852" },
    "Outros Produtos":          { bg: "#ECE2D0", ink: "#8C7458" },
    "Telhas":                   { bg: "#EBC9A8", ink: "#A05E2F" },
    "Tintas e Massas":          { bg: "#F0CFB8", ink: "#A66541" },
    "Vigas e Cantoneiras":      { bg: "#DED3BD", ink: "#6F5A40" },
};

const DEFAULT_TONE = { bg: "#EFE6D5", ink: "#7C6748" };

/** Altura do ClientHeader (sticky top-0, miolo h-[76px]). */
const HEADER_H = 76;

const WARM = "#F7F2EA";

type SortKey = "nome" | "menor" | "maior";

const SORTS: { key: SortKey; label: string; icon: LucideIcon }[] = [
    { key: "nome",  label: "A–Z",          icon: ArrowDownAZ },
    { key: "menor", label: "Menor preço",  icon: ArrowUpNarrowWide },
    { key: "maior", label: "Maior preço",  icon: ArrowDownWideNarrow },
];

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CatalogPage() {
    const { session, loading: sessionLoading } = useClientSession();
    const [mounted, setMounted] = useState(false);
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("Todos");
    const [sort, setSort] = useState<SortKey>("nome");
    const [onlyInCart, setOnlyInCart] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const router = useRouter();
    const { items, setQuantity, totalItems, totalPrice } = useCart();

    const quantityMap = useMemo(
        () => Object.fromEntries(items.map((i) => [i.product_id, i.quantity])),
        [items]
    );

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!session) return;
        supabase
            .from("products")
            .select("*")
            .eq("active", true)
            .eq("admin_id", session.adminId)
            .order("category", { ascending: true })
            .order("name", { ascending: true })
            .then(({ data, error }) => {
                if (error) setToast({ type: "error", message: "Erro ao carregar produtos." });
                else setProducts((data as CatalogProduct[]) ?? []);
                setLoadingProducts(false);
            });
    }, [session]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    // Se o cliente esvazia o carrinho com o filtro "no carrinho" ligado,
    // desliga sozinho para não deixar a tela vazia sem explicação.
    useEffect(() => {
        if (onlyInCart && items.length === 0) setOnlyInCart(false);
    }, [onlyInCart, items.length]);

    // O cabeçalho de categoria gruda logo abaixo do trilho de filtros. A altura
    // do trilho muda com a largura da tela (os chips quebram de linha), então
    // medimos em vez de cravar um número que desalinha em algum breakpoint.
    const railRef = useRef<HTMLDivElement>(null);
    const [railH, setRailH] = useState(0);

    useEffect(() => {
        const el = railRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setRailH(Math.round(entry.contentRect.height));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const categories = useMemo(
        () => ["Todos", ...Array.from(new Set(products.map((p) => p.category)))],
        [products]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = products.filter((p) => {
            const matchSearch =
                !q ||
                p.name.toLowerCase().includes(q) ||
                (p.subcategory ?? "").toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q);
            const matchCat = selectedCategory === "Todos" || p.category === selectedCategory;
            const matchCart = !onlyInCart || (quantityMap[p.id] ?? 0) > 0;
            return matchSearch && matchCat && matchCart;
        });

        if (sort === "menor") return [...list].sort((a, b) => a.price - b.price);
        if (sort === "maior") return [...list].sort((a, b) => b.price - a.price);
        return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }, [products, search, selectedCategory, onlyInCart, quantityMap, sort]);

    // Só agrupamos por categoria quando faz sentido: em "Todos", sem busca e
    // ordenado por nome. Ordenar por preço entre grupos esconderia o barato.
    const showGroups = selectedCategory === "Todos" && sort === "nome" && !search.trim() && !onlyInCart;

    const grouped = useMemo(() => {
        if (!showGroups) return null;
        return filtered.reduce<Record<string, CatalogProduct[]>>((acc, p) => {
            (acc[p.category] ??= []).push(p);
            return acc;
        }, {});
    }, [filtered, showGroups]);

    const handleQuantityChange = useCallback(
        (product: CatalogProduct, quantity: number) => {
            setQuantity(
                { product_id: product.id, name: product.name, unit: product.unit, price: product.price },
                quantity
            );
        },
        [setQuantity]
    );

    if (!mounted || sessionLoading || !session) return null;

    const renderRow = (p: CatalogProduct) => (
        <ProductRow
            key={p.id}
            product={p}
            quantity={quantityMap[p.id] ?? 0}
            icon={CATEGORY_ICONS[p.category] ?? Package}
            tone={CATEGORY_TONES[p.category] ?? DEFAULT_TONE}
            onQuantityChange={handleQuantityChange}
        />
    );

    return (
        <div
            className="min-h-screen relative bg-warm"
            style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            {/* ── Toast ───────────────────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, y: -16, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -16, x: "-50%" }}
                        className={cn(
                            "fixed top-20 left-1/2 z-[60] flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl text-[13px] font-semibold",
                            toast.type === "success" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
                        )}
                    >
                        {toast.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            <ClientHeader session={session} searchValue={search} onSearchChange={setSearch} />

            {/* ── Cabeçalho editorial ─────────────────────────────────────
                O catálogo é tela de uso diário, não landing page: no celular o
                herói fica enxuto para o primeiro produto aparecer sem rolagem.
                No desktop sobra altura, então ele respira. */}
            <section className="relative z-10 max-w-[1320px] mx-auto px-5 sm:px-8 pt-5 sm:pt-14 pb-4 sm:pb-6">
                <p className="text-[10px] sm:text-[10.5px] uppercase tracking-[0.28em] text-stone-500 mb-2 sm:mb-3 font-semibold">
                    Olá, {session.name.split(" ")[0]} · {products.length} {products.length === 1 ? "item" : "itens"}
                </p>
                <h1
                    className="text-[27px] sm:text-[58px] leading-[1.02] sm:leading-[0.98] tracking-tight text-stone-900"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                >
                    O que vamos{" "}
                    <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>
                        construir
                    </em>{" "}
                    hoje?
                </h1>
                {/* Texto de boas-vindas só onde há altura sobrando */}
                <p className="hidden sm:block text-[15px] text-stone-600 mt-4 leading-relaxed max-w-[460px]">
                    Escolha os materiais, defina as quantidades e a gente entrega na sua obra.
                </p>
            </section>

            {/* ── Trilho fixo: categorias + ordenação ─────────────────── */}
            <div
                ref={railRef}
                className="sticky z-30"
                style={{
                    top: HEADER_H,
                    background: "rgba(247, 242, 234, 0.96)",
                    borderBottom: "1px solid rgba(120, 113, 108, 0.14)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                }}
            >
                <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
                    {/* Categorias */}
                    <div
                        className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-3 pb-2"
                        role="tablist"
                        aria-label="Categorias"
                    >
                        {categories.map((cat) => {
                            const Icon = CATEGORY_ICONS[cat] ?? Package;
                            const isActive = selectedCategory === cat;
                            const count = cat === "Todos"
                                ? products.length
                                : products.filter((p) => p.category === cat).length;
                            return (
                                <button
                                    key={cat}
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={cn(
                                        "group inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12.5px] whitespace-nowrap shrink-0 border cursor-pointer",
                                        "transition-colors duration-200",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F2EA]",
                                        isActive
                                            ? "bg-stone-900 text-white border-stone-900 shadow-[0_2px_10px_rgba(28,25,23,0.18)]"
                                            : "bg-transparent text-stone-600 border-stone-300/70 hover:border-stone-500 hover:text-stone-900"
                                    )}
                                >
                                    <Icon className={cn("w-3 h-3", isActive ? "text-orange-400" : "text-stone-400 group-hover:text-stone-700")} />
                                    <span className="font-medium">{cat}</span>
                                    <span className={cn("tabular-nums text-[10.5px] tracking-wider", isActive ? "text-white/45" : "text-stone-400")}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Ordenação + atalho para o carrinho */}
                    <div className="flex items-center gap-2 pb-2.5 overflow-x-auto scrollbar-hide">
                        <SlidersHorizontal className="w-3 h-3 text-stone-400 shrink-0" aria-hidden />
                        <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold shrink-0 mr-0.5">
                            Ordenar
                        </span>
                        {SORTS.map(({ key, label, icon: Icon }) => {
                            const isActive = sort === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setSort(key)}
                                    aria-pressed={isActive}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11.5px] font-medium whitespace-nowrap shrink-0 cursor-pointer",
                                        "transition-colors duration-200",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600",
                                        isActive
                                            ? "bg-stone-200/80 text-stone-900"
                                            : "text-stone-500 hover:text-stone-900 hover:bg-stone-200/50"
                                    )}
                                >
                                    <Icon className="w-3 h-3" />
                                    {label}
                                </button>
                            );
                        })}

                        {items.length > 0 && (
                            <>
                                <span className="w-px h-4 bg-stone-300/70 shrink-0 mx-1" aria-hidden />
                                <button
                                    onClick={() => setOnlyInCart((v) => !v)}
                                    aria-pressed={onlyInCart}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11.5px] font-medium whitespace-nowrap shrink-0 cursor-pointer",
                                        "transition-colors duration-200",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600",
                                        onlyInCart
                                            ? "bg-orange-700 text-white"
                                            : "text-orange-800 bg-orange-100/70 hover:bg-orange-200/70"
                                    )}
                                >
                                    <ShoppingCart className="w-3 h-3" />
                                    No carrinho
                                    <span className="tabular-nums opacity-70">{items.length}</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Corpo ───────────────────────────────────────────────── */}
            <main className="relative z-10 max-w-[1320px] mx-auto px-5 sm:px-8 py-4 sm:py-8 pb-44">

                {/* Título da seção — uma linha só no celular, para não empurrar a lista */}
                <div className="flex items-baseline justify-between gap-4 mb-4 sm:mb-6 pb-2.5 sm:pb-3.5 border-b border-stone-300/50">
                    <div className="min-w-0 flex items-baseline gap-2.5 sm:block">
                        <h2
                            className="text-[17px] sm:text-[28px] tracking-tight text-stone-900 truncate shrink-0"
                            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                        >
                            {onlyInCart
                                ? "Seu carrinho"
                                : selectedCategory === "Todos" ? "Catálogo completo" : selectedCategory}
                        </h2>
                        <p className="text-[10.5px] sm:text-[11.5px] text-stone-500 sm:mt-1 uppercase tracking-[0.18em] font-medium truncate">
                            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
                            {search && <span className="normal-case tracking-normal"> · &ldquo;{search}&rdquo;</span>}
                        </p>
                    </div>

                    {(selectedCategory !== "Todos" || onlyInCart) && (
                        <button
                            onClick={() => { setSelectedCategory("Todos"); setOnlyInCart(false); }}
                            className="text-[10.5px] sm:text-[11.5px] uppercase tracking-[0.18em] font-semibold text-stone-500 hover:text-stone-900 transition-colors shrink-0 cursor-pointer"
                        >
                            Ver todos →
                        </button>
                    )}
                </div>

                {/* Carregando */}
                {loadingProducts ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-xl bg-white/50 ring-1 ring-stone-200/60 px-4 py-3">
                                <div className="w-10 h-10 rounded-lg bg-stone-200/70 animate-pulse shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3.5 bg-stone-200/70 rounded w-4/5 animate-pulse" />
                                    <div className="h-2.5 bg-stone-200/60 rounded w-2/5 animate-pulse" />
                                </div>
                                <div className="w-[124px] h-11 rounded-xl bg-stone-200/60 animate-pulse shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-28 text-center">
                        <div className="w-16 h-16 rounded-full bg-stone-200/60 flex items-center justify-center mb-5">
                            <Package className="w-7 h-7 text-stone-400" />
                        </div>
                        <p
                            className="text-[22px] tracking-tight text-stone-800"
                            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                        >
                            Nada por aqui ainda.
                        </p>
                        <p className="text-[13px] text-stone-500 mt-2 max-w-xs leading-relaxed">
                            Tente ajustar sua busca ou selecione outra categoria do catálogo.
                        </p>
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="mt-5 text-[12px] uppercase tracking-[0.2em] font-semibold text-orange-700 hover:text-orange-900 transition-colors cursor-pointer"
                            >
                                Limpar busca
                            </button>
                        )}
                    </div>
                ) : grouped ? (
                    // Agrupado por categoria
                    <div className="space-y-10">
                        {Object.entries(grouped).map(([category, prods]) => {
                            const CatIcon = CATEGORY_ICONS[category] ?? Package;
                            return (
                                <section key={category} aria-labelledby={`cat-${category}`}>
                                    <div
                                        className="flex items-baseline gap-3 mb-3 sticky z-20 py-2"
                                        style={{ top: HEADER_H + railH, background: WARM }}
                                    >
                                        <CatIcon className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-hidden />
                                        <p
                                            id={`cat-${category}`}
                                            className="text-[10.5px] uppercase tracking-[0.25em] font-semibold text-stone-500"
                                        >
                                            {category}
                                        </p>
                                        <div className="flex-1 h-px bg-stone-300/40" />
                                        <p className="text-[10.5px] tabular-nums text-stone-400">{prods.length}</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                                        {prods.map(renderRow)}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    // Lista plana (busca, categoria única ou ordenação por preço)
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {filtered.map(renderRow)}
                    </div>
                )}
            </main>

            {/* ── Barra fixa do carrinho ──────────────────────────────── */}
            <AnimatePresence>
                {totalItems > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: "spring", damping: 24, stiffness: 280 }}
                        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2.5rem)] max-w-[640px]"
                    >
                        <div
                            className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 rounded-2xl"
                            style={{
                                background: "#1C1917",
                                boxShadow: "0 20px 50px -12px rgba(28, 25, 23, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset",
                            }}
                        >
                            <div className="flex -space-x-1.5 shrink-0">
                                {items.slice(0, 3).map((item, i) => (
                                    <div
                                        key={item.product_id}
                                        style={{ zIndex: 3 - i }}
                                        className="w-8 h-8 rounded-full border-2 border-stone-900 flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                    >
                                        <div
                                            className="w-full h-full rounded-full flex items-center justify-center"
                                            style={{ background: `hsl(${20 + i * 15}, 35%, 30%)` }}
                                        >
                                            {item.name.charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                ))}
                                {items.length > 3 && (
                                    <div className="w-8 h-8 rounded-full bg-stone-700 border-2 border-stone-900 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                        +{items.length - 3}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-stone-400 uppercase tracking-[0.22em] leading-none font-semibold">
                                    {totalItems} {totalItems === 1 ? "item" : "itens"}
                                </p>
                                <p
                                    className="text-white tabular-nums leading-tight mt-0.5"
                                    style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "18px" }}
                                >
                                    {formatCurrency(totalPrice)}
                                </p>
                            </div>

                            <button
                                onClick={() => router.push("/cliente/checkout")}
                                className="group inline-flex items-center gap-1.5 bg-white text-stone-900 px-4 sm:px-5 h-10 rounded-xl text-[13px] font-semibold tracking-wide hover:bg-stone-100 transition-colors duration-200 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900"
                            >
                                <span className="hidden sm:inline">Finalizar</span>
                                <ShoppingCart className="w-4 h-4 sm:hidden" />
                                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
