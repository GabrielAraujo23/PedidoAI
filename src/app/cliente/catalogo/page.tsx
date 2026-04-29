"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutGrid, Waves, Zap, Plug, Wrench,
    Package, Home, Paintbrush, AlignJustify,
    Minus, Plus, ShoppingCart,
    AlertCircle, Check, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ClientHeader } from "@/components/client-header";
import { useCart } from "@/context/CartContext";
import { useClientSession } from "@/lib/client-session";
import type { LucideIcon } from "lucide-react";

interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
}

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

// Subtle warm tones for product card image area — no candy gradients
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

function tone(cat: string) {
    return CATEGORY_TONES[cat] ?? { bg: "#EFE6D5", ink: "#7C6748" };
}

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CatalogPage() {
    const { session, loading: sessionLoading } = useClientSession();
    const [mounted, setMounted] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("Todos");
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const router = useRouter();
    const { items, addItem, updateQuantity, totalItems, totalPrice } = useCart();
    const quantityMap = Object.fromEntries(items.map((i) => [i.product_id, i.quantity]));

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
                else setProducts((data as Product[]) ?? []);
                setLoadingProducts(false);
            });
    }, [session]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    const categories = ["Todos", ...Array.from(new Set(products.map((p) => p.category)))];

    const filtered = products.filter((p) => {
        const q = search.toLowerCase();
        const matchSearch =
            p.name.toLowerCase().includes(q) ||
            (p.subcategory ?? "").toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q);
        const matchCat = selectedCategory === "Todos" || p.category === selectedCategory;
        return matchSearch && matchCat;
    });

    const grouped = filtered.reduce<Record<string, Product[]>>((acc, p) => {
        (acc[p.category] ??= []).push(p);
        return acc;
    }, {});

    if (!mounted || sessionLoading || !session) return null;

    const headerH = "64px";

    return (
        <div
            className="min-h-screen relative bg-warm"
            style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            {/* ── Toast ───────────────────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -16, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -16, x: "-50%" }}
                        className={cn(
                            "fixed top-20 left-1/2 z-[60] flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl text-[13px] font-semibold",
                            toast.type === "success"
                                ? "bg-emerald-700 text-white"
                                : "bg-red-700 text-white"
                        )}
                    >
                        {toast.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            <ClientHeader session={session} searchValue={search} onSearchChange={setSearch} />

            {/* ── Hero ───────────────────────────────────────────────── */}
            <section className="relative z-10 max-w-[1320px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-8">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="max-w-[820px]"
                >
                    <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500 mb-4 font-semibold">
                        Olá, {session.name.split(" ")[0]} · {products.length} {products.length === 1 ? "item" : "itens"} disponíveis
                    </p>
                    <h1
                        className="text-[44px] sm:text-[64px] leading-[0.96] tracking-tight text-stone-900"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                    >
                        O que vamos{" "}
                        <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>
                            construir
                        </em>{" "}
                        hoje?
                    </h1>
                    <p className="text-[15px] text-stone-600 mt-5 leading-relaxed max-w-[520px]">
                        Escolha os materiais, monte seu pedido e a gente entrega na sua obra.
                        Tudo direto pelo app, sem complicação.
                    </p>
                </motion.div>
            </section>

            {/* ── Sticky filter rail ─────────────────────────────────── */}
            <div
                className="sticky z-30"
                style={{
                    top: headerH,
                    background: "rgba(247, 242, 234, 0.96)",
                    borderBottom: "1px solid rgba(120, 113, 108, 0.12)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                }}
            >
                <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-3">
                        {categories.map((cat) => {
                            const Icon = CATEGORY_ICONS[cat] ?? Package;
                            const isActive = selectedCategory === cat;
                            const count = cat === "Todos"
                                ? products.length
                                : products.filter((p) => p.category === cat).length;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={cn(
                                        "group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] whitespace-nowrap shrink-0 transition-all duration-200 border",
                                        isActive
                                            ? "bg-stone-900 text-white border-stone-900 shadow-[0_2px_10px_rgba(28,25,23,0.18)]"
                                            : "bg-transparent text-stone-600 border-stone-300/70 hover:border-stone-500 hover:text-stone-900"
                                    )}
                                >
                                    <Icon className={cn("w-3 h-3", isActive ? "text-orange-400" : "text-stone-400 group-hover:text-stone-700")} />
                                    <span className="font-medium">{cat}</span>
                                    <span className={cn(
                                        "tabular-nums text-[10.5px] tracking-wider",
                                        isActive ? "text-white/40" : "text-stone-400"
                                    )}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <main className="relative z-10 max-w-[1320px] mx-auto px-5 sm:px-8 py-10 pb-44">

                {/* Section heading */}
                <div className="flex items-baseline justify-between mb-8 pb-4 border-b border-stone-300/40">
                    <div>
                        <h2
                            className="text-[26px] sm:text-[30px] tracking-tight text-stone-900"
                            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                        >
                            {selectedCategory === "Todos" ? "Catálogo completo" : selectedCategory}
                        </h2>
                        <p className="text-[12px] text-stone-500 mt-1 uppercase tracking-[0.18em] font-medium">
                            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
                            {search && <span className="normal-case tracking-normal"> · para &ldquo;{search}&rdquo;</span>}
                        </p>
                    </div>

                    {selectedCategory !== "Todos" && (
                        <button
                            onClick={() => setSelectedCategory("Todos")}
                            className="text-[12px] uppercase tracking-[0.18em] font-semibold text-stone-500 hover:text-stone-900 transition-colors"
                        >
                            Ver todos →
                        </button>
                    )}
                </div>

                {/* Loading */}
                {loadingProducts ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="rounded-2xl overflow-hidden bg-white/40 border border-stone-200/60">
                                <div className="aspect-[5/4] bg-stone-200/50 animate-pulse" />
                                <div className="p-4 space-y-2.5">
                                    <div className="h-3 bg-stone-200/60 rounded w-1/3 animate-pulse" />
                                    <div className="h-4 bg-stone-200/60 rounded w-4/5 animate-pulse" />
                                    <div className="h-4 bg-stone-200/60 rounded w-1/3 animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center justify-center py-32 text-center"
                    >
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
                                className="mt-5 text-[12px] uppercase tracking-[0.2em] font-semibold text-orange-700 hover:text-orange-900 transition-colors"
                            >
                                Limpar busca
                            </button>
                        )}
                    </motion.div>
                ) : (
                    <div className="space-y-14">
                        {Object.entries(grouped).map(([category, prods], groupIndex) => {
                            const CatIcon = CATEGORY_ICONS[category] ?? Package;
                            return (
                                <motion.section
                                    key={category}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: groupIndex * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                >
                                    {/* Category divider */}
                                    {selectedCategory === "Todos" && (
                                        <div className="flex items-baseline gap-4 mb-6">
                                            <CatIcon className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                            <p className="text-[11px] uppercase tracking-[0.25em] font-semibold text-stone-500">
                                                {category}
                                            </p>
                                            <div className="flex-1 h-px bg-stone-300/40" />
                                            <p className="text-[11px] tabular-nums text-stone-400">
                                                {prods.length}
                                            </p>
                                        </div>
                                    )}

                                    {/* Product grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                                        {prods.map((p, i) => {
                                            const qty = quantityMap[p.id] ?? 0;
                                            const Icon = CATEGORY_ICONS[p.category] ?? Package;
                                            const t = tone(p.category);
                                            return (
                                                <motion.article
                                                    key={p.id}
                                                    initial={{ opacity: 0, y: 12 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        delay: groupIndex * 0.04 + i * 0.02,
                                                        duration: 0.32,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                    className={cn(
                                                        "group relative rounded-2xl overflow-hidden bg-white transition-all duration-300",
                                                        qty > 0
                                                            ? "ring-2 ring-stone-900 shadow-[0_8px_30px_rgba(28,25,23,0.10)]"
                                                            : "ring-1 ring-stone-200/70 hover:ring-stone-300 hover:shadow-[0_8px_24px_rgba(28,25,23,0.06)] hover:-translate-y-0.5"
                                                    )}
                                                >
                                                    {/* Image area — warm flat tone */}
                                                    <div
                                                        className="relative aspect-[5/4] flex items-center justify-center overflow-hidden"
                                                        style={{ background: t.bg }}
                                                    >
                                                        {/* Quantity ribbon */}
                                                        <AnimatePresence>
                                                            {qty > 0 && (
                                                                <motion.div
                                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                                    animate={{ scale: 1, opacity: 1 }}
                                                                    exit={{ scale: 0.5, opacity: 0 }}
                                                                    transition={{ type: "spring", damping: 18, stiffness: 320 }}
                                                                    className="absolute top-3 right-3 min-w-[24px] h-6 px-2 bg-stone-900 text-white rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums z-10"
                                                                >
                                                                    {qty}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* Eyebrow category label */}
                                                        <p
                                                            className="absolute top-3 left-3 text-[9px] uppercase tracking-[0.22em] font-bold"
                                                            style={{ color: t.ink }}
                                                        >
                                                            {p.category.split(" ")[0]}
                                                        </p>

                                                        {/* Icon stamp */}
                                                        <Icon
                                                            className="w-12 h-12 transition-transform duration-500 ease-out group-hover:scale-110 group-hover:rotate-3"
                                                            style={{ color: t.ink, opacity: 0.45 }}
                                                            strokeWidth={1.4}
                                                        />

                                                        {/* Subtle bottom hairline */}
                                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-stone-900/[0.04]" />
                                                    </div>

                                                    {/* Body */}
                                                    <div className="p-3.5 sm:p-4">
                                                        <p className="font-semibold text-stone-900 text-[13.5px] leading-snug line-clamp-2 mb-0.5">
                                                            {p.name}
                                                        </p>
                                                        {p.subcategory && (
                                                            <p
                                                                className="text-[11.5px] text-stone-500 leading-tight"
                                                                style={{ fontStyle: "italic", fontFamily: "var(--font-display)" }}
                                                            >
                                                                {p.subcategory}
                                                            </p>
                                                        )}
                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-medium mt-1.5">
                                                            {p.unit}
                                                        </p>

                                                        <div className="flex items-end justify-between gap-2 mt-3 pt-3 border-t border-stone-100">
                                                            <p
                                                                className="text-stone-900 tabular-nums leading-none"
                                                                style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "20px" }}
                                                            >
                                                                {formatCurrency(p.price)}
                                                            </p>

                                                            <div className="flex items-center gap-1.5">
                                                                <AnimatePresence>
                                                                    {qty > 0 && (
                                                                        <motion.div
                                                                            initial={{ width: 0, opacity: 0 }}
                                                                            animate={{ width: "auto", opacity: 1 }}
                                                                            exit={{ width: 0, opacity: 0 }}
                                                                            transition={{ duration: 0.2 }}
                                                                            className="flex items-center bg-stone-100 rounded-lg overflow-hidden"
                                                                        >
                                                                            <button
                                                                                onClick={() => updateQuantity(p.id, qty - 1)}
                                                                                className="w-7 h-7 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors"
                                                                            >
                                                                                <Minus className="w-3 h-3" />
                                                                            </button>
                                                                            <span className="w-5 text-center text-[11px] font-bold text-stone-800 tabular-nums">{qty}</span>
                                                                            <button
                                                                                onClick={() => updateQuantity(p.id, qty + 1)}
                                                                                className="w-7 h-7 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors"
                                                                            >
                                                                                <Plus className="w-3 h-3" />
                                                                            </button>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                                <motion.button
                                                                    whileTap={{ scale: 0.9 }}
                                                                    onClick={() =>
                                                                        qty === 0
                                                                            ? addItem({ product_id: p.id, name: p.name, unit: p.unit, price: p.price })
                                                                            : updateQuantity(p.id, 0)
                                                                    }
                                                                    className={cn(
                                                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm",
                                                                        qty > 0
                                                                            ? "bg-orange-700 text-white hover:bg-orange-800"
                                                                            : "bg-stone-900 text-white hover:bg-stone-800"
                                                                    )}
                                                                >
                                                                    {qty > 0 ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />}
                                                                </motion.button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.article>
                                            );
                                        })}
                                    </div>
                                </motion.section>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* ── Sticky cart bar ─────────────────────────────────────── */}
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
                                        // Slight gradient feel using a derived tone
                                        // (uses item index to vary)
                                    >
                                        <div className="w-full h-full rounded-full flex items-center justify-center"
                                             style={{ background: `hsl(${20 + i * 15}, 35%, 30%)` }}>
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
                                className="group inline-flex items-center gap-1.5 bg-white text-stone-900 px-4 sm:px-5 h-10 rounded-xl text-[13px] font-semibold tracking-wide hover:bg-stone-100 transition-all duration-200 shrink-0"
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
