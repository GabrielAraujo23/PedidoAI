"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutGrid, Waves, Zap, Plug, Wrench,
    Package, Home, Paintbrush, AlignJustify,
    Minus, Plus, ShoppingCart, ShoppingBag,
    AlertCircle, Check, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ClientHeader } from "@/components/client-header";
import { useCart } from "@/context/CartContext";
import type { ClientSession } from "@/lib/auth-context";
import type { LucideIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Category icons map ─────────────────────────────────────────────────────────

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

// ── Category gradients for card image areas ────────────────────────────────────

const CATEGORY_GRADIENTS: Record<string, string> = {
    "Canos":                    "from-sky-100 via-cyan-50 to-blue-50",
    "Eletricidade e Cabos":     "from-amber-100 via-yellow-50 to-orange-50",
    "Eletroduto e Lavanderia":  "from-violet-100 via-purple-50 to-fuchsia-50",
    "Ferragens":                "from-stone-200 via-stone-100 to-zinc-100",
    "Outros Produtos":          "from-emerald-100 via-green-50 to-teal-50",
    "Telhas":                   "from-red-100 via-orange-50 to-amber-50",
    "Tintas e Massas":          "from-pink-100 via-rose-50 to-red-50",
    "Vigas e Cantoneiras":      "from-slate-200 via-gray-100 to-stone-100",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CatalogPage() {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("Todos");
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const router = useRouter();
    const { items, addItem, updateQuantity, totalItems, totalPrice } = useCart();

    // Derive quantity map for O(1) lookups in the render loop
    const quantityMap = Object.fromEntries(items.map((i) => [i.product_id, i.quantity]));

    useEffect(() => {
        setMounted(true);
        const raw = localStorage.getItem("pedidoai_client_session");
        if (!raw) { router.push("/login"); return; }
        const sess = JSON.parse(raw) as ClientSession;
        if (!sess.adminId) {
            localStorage.removeItem("pedidoai_client_session");
            router.push("/login");
            return;
        }
        setSession(sess);
        supabase
            .from("products")
            .select("*")
            .eq("active", true)
            .eq("admin_id", sess.adminId)
            .order("category", { ascending: true })
            .order("name", { ascending: true })
            .then(({ data, error }) => {
                if (error) setToast({ type: "error", message: "Erro ao carregar produtos." });
                else setProducts((data as Product[]) ?? []);
                setLoadingProducts(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    // ── Derived state ──────────────────────────────────────────────────────────

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

    if (!mounted || !session) return null;

    // Header height: 3px accent + 60px bar = 63px
    const headerH = "63px";

    return (
        <div className="min-h-screen bg-[#FAF9F7]">

            {/* ── Toast ────────────────────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -20, x: "-50%" }}
                        className={cn(
                            "fixed top-20 left-1/2 z-[60] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold backdrop-blur-lg",
                            toast.type === "success"
                                ? "bg-emerald-500/90 text-white"
                                : "bg-red-500/90 text-white"
                        )}
                    >
                        {toast.type === "success"
                            ? <Check className="w-4 h-4 shrink-0" />
                            : <AlertCircle className="w-4 h-4 shrink-0" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            <ClientHeader searchValue={search} onSearchChange={setSearch} />

            {/* ── Hero welcome ─────────────────────────────────────────── */}
            <div className="relative bg-[#1C1917] overflow-hidden">
                {/* Decorative gradient orbs */}
                <div className="absolute top-0 right-0 w-72 h-72 bg-[#F97316]/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-[#FBBF24]/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="relative max-w-[1440px] mx-auto px-4 sm:px-6 py-7 sm:py-9">
                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p className="text-[#F97316] text-xs sm:text-sm font-semibold tracking-wide uppercase">
                            Bem-vindo, {session.name.split(" ")[0]}
                        </p>
                        <h1 className="text-white text-2xl sm:text-[32px] font-black mt-1.5 tracking-tight leading-tight">
                            O que vamos construir hoje?
                        </h1>
                        <p className="text-white/35 text-sm mt-1.5">
                            {products.length} produto{products.length !== 1 ? "s" : ""} disponive{products.length !== 1 ? "is" : "l"} no catalogo
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* ── Category bar (all screen sizes) ──────────────────────── */}
            <div
                className="sticky z-30 bg-[#FAF9F7]/95 backdrop-blur-lg border-b border-stone-200/80"
                style={{ top: headerH }}
            >
                <div className="max-w-[1440px] mx-auto">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 sm:px-6 py-3">
                        {categories.map((cat) => {
                            const Icon = CATEGORY_ICONS[cat] ?? Package;
                            const isActive = selectedCategory === cat;
                            return (
                                <motion.button
                                    key={cat}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-all duration-200 border",
                                        isActive
                                            ? "bg-[#1C1917] text-white border-[#1C1917] shadow-lg shadow-stone-900/15"
                                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700 hover:shadow-md"
                                    )}
                                >
                                    <Icon className={cn("w-3.5 h-3.5", isActive && "text-[#F97316]")} />
                                    {cat}
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 pb-40">
                <div className="flex gap-8">

                    {/* ── Desktop sidebar ──────────────────────────────── */}
                    <aside className="hidden lg:flex flex-col gap-5 w-[280px] shrink-0">

                        {/* Cart summary */}
                        <div className="bg-[#1C1917] rounded-2xl p-5 overflow-hidden relative">
                            {/* Decorative warm glow */}
                            <div className="absolute -top-8 -right-8 w-28 h-28 bg-[#F97316]/15 rounded-full blur-2xl pointer-events-none" />

                            <div className="relative">
                                <div className="flex items-center gap-2 mb-3">
                                    <ShoppingBag className="w-4 h-4 text-[#F97316]" />
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Seu Carrinho</p>
                                </div>
                                <p className="text-[28px] font-black text-white tracking-tight leading-none">
                                    {formatCurrency(totalPrice)}
                                </p>
                                <p className="text-sm text-white/40 mt-1.5">
                                    {totalItems} {totalItems === 1 ? "item selecionado" : "itens selecionados"}
                                </p>
                                {totalItems > 0 && (
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => router.push("/cliente/checkout")}
                                        className="mt-4 w-full bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#F97316]/30 hover:shadow-[#F97316]/40 transition-shadow"
                                    >
                                        Finalizar Compra
                                        <ArrowRight className="w-4 h-4" />
                                    </motion.button>
                                )}
                            </div>
                        </div>

                        {/* Category nav */}
                        <div>
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3 px-1">Categorias</p>
                            <div className="space-y-0.5">
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
                                                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-200 text-left group",
                                                isActive
                                                    ? "bg-[#1C1917] text-white shadow-md shadow-stone-900/10"
                                                    : "text-stone-500 hover:bg-white hover:text-stone-700 hover:shadow-sm"
                                            )}
                                        >
                                            <Icon className={cn(
                                                "w-4 h-4 shrink-0 transition-colors",
                                                isActive ? "text-[#F97316]" : "group-hover:text-stone-500"
                                            )} />
                                            <span className="flex-1 truncate font-medium">{cat}</span>
                                            <span className={cn(
                                                "text-[11px] tabular-nums",
                                                isActive ? "text-white/40" : "text-stone-400"
                                            )}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>

                    {/* ── Main content ─────────────────────────────────── */}
                    <div className="flex-1 min-w-0">

                        {/* Results header */}
                        <div className="flex items-baseline justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-stone-800">
                                    {selectedCategory === "Todos" ? "Todos os Produtos" : selectedCategory}
                                </h2>
                                <p className="text-[13px] text-stone-400 mt-0.5">
                                    {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
                                    {search && <span> para &ldquo;{search}&rdquo;</span>}
                                </p>
                            </div>
                        </div>

                        {/* Loading skeleton */}
                        {loadingProducts ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {Array.from({ length: 9 }).map((_, i) => (
                                    <div key={i} className="animate-pulse rounded-2xl overflow-hidden bg-white ring-1 ring-stone-100">
                                        <div className="bg-gradient-to-br from-stone-100 to-stone-200 aspect-[4/3]" />
                                        <div className="p-3.5 space-y-2.5">
                                            <div className="bg-stone-200 rounded-full h-2.5 w-16" />
                                            <div className="bg-stone-200 rounded-full h-3.5 w-full" />
                                            <div className="bg-stone-200 rounded-full h-3.5 w-20" />
                                            <div className="flex justify-between items-center pt-1">
                                                <div className="bg-stone-200 rounded-full h-4 w-16" />
                                                <div className="bg-stone-200 rounded-lg h-8 w-8" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            /* Empty state */
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3 }}
                                className="flex flex-col items-center justify-center py-24 text-center"
                            >
                                <div className="w-20 h-20 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
                                    <Package className="w-8 h-8 text-stone-300" />
                                </div>
                                <p className="font-bold text-stone-700 text-lg">Nenhum produto encontrado</p>
                                <p className="text-sm text-stone-400 mt-1 max-w-xs">
                                    Tente ajustar sua busca ou selecione outra categoria.
                                </p>
                                {search && (
                                    <button
                                        onClick={() => setSearch("")}
                                        className="mt-4 text-sm text-[#F97316] font-semibold hover:underline"
                                    >
                                        Limpar busca
                                    </button>
                                )}
                            </motion.div>
                        ) : (
                            /* Product groups */
                            <div className="space-y-10">
                                {Object.entries(grouped).map(([category, prods], groupIndex) => {
                                    const CatIcon = CATEGORY_ICONS[category] ?? Package;
                                    return (
                                        <motion.section
                                            key={category}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                delay: groupIndex * 0.08,
                                                duration: 0.4,
                                                ease: [0.22, 1, 0.36, 1],
                                            }}
                                        >
                                            {/* Category header */}
                                            <div className="flex items-center gap-3 mb-5">
                                                <div className="w-8 h-8 rounded-lg bg-[#1C1917] flex items-center justify-center shrink-0">
                                                    <CatIcon className="w-4 h-4 text-[#F97316]" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-stone-800 text-[15px] leading-tight">{category}</p>
                                                    <p className="text-[11px] text-stone-400">
                                                        {prods.length} produto{prods.length !== 1 ? "s" : ""}
                                                    </p>
                                                </div>
                                                <div className="flex-1 h-px bg-gradient-to-r from-stone-200 to-transparent" />
                                            </div>

                                            {/* Product grid */}
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                                                {prods.map((p, i) => {
                                                    const qty = quantityMap[p.id] ?? 0;
                                                    const Icon = CATEGORY_ICONS[p.category] ?? Package;
                                                    const gradient = CATEGORY_GRADIENTS[p.category] ?? "from-stone-100 via-stone-50 to-zinc-50";
                                                    return (
                                                        <motion.div
                                                            key={p.id}
                                                            initial={{ opacity: 0, y: 16 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{
                                                                delay: groupIndex * 0.08 + i * 0.025,
                                                                duration: 0.35,
                                                                ease: [0.22, 1, 0.36, 1],
                                                            }}
                                                            className={cn(
                                                                "group bg-white rounded-2xl overflow-hidden transition-all duration-300",
                                                                qty > 0
                                                                    ? "ring-2 ring-[#F97316] shadow-lg shadow-[#F97316]/8"
                                                                    : "ring-1 ring-stone-200/80 shadow-sm hover:shadow-lg hover:ring-stone-300"
                                                            )}
                                                        >
                                                            {/* Image area */}
                                                            <div className={cn(
                                                                "relative aspect-[4/3] bg-gradient-to-br flex items-center justify-center overflow-hidden",
                                                                gradient
                                                            )}>
                                                                <Icon className="w-10 h-10 text-stone-300/70 group-hover:scale-110 transition-transform duration-500 ease-out" />

                                                                {/* Quantity badge */}
                                                                <AnimatePresence>
                                                                    {qty > 0 && (
                                                                        <motion.div
                                                                            initial={{ scale: 0 }}
                                                                            animate={{ scale: 1 }}
                                                                            exit={{ scale: 0 }}
                                                                            transition={{ type: "spring", damping: 15, stiffness: 400 }}
                                                                            className="absolute top-2.5 right-2.5 min-w-[26px] h-[26px] px-1.5 bg-[#F97316] text-white rounded-full flex items-center justify-center text-[11px] font-black shadow-lg shadow-[#F97316]/30"
                                                                        >
                                                                            {qty}
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>

                                                                {/* Category label */}
                                                                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-white/70 backdrop-blur-sm rounded-md">
                                                                    <p className="text-[8px] sm:text-[9px] font-bold text-stone-500 uppercase tracking-wider leading-tight">
                                                                        {p.category.length > 12 ? p.category.split(" ")[0] : p.category}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Card body */}
                                                            <div className="p-3 sm:p-3.5">
                                                                <p className="font-bold text-stone-800 text-[13px] sm:text-sm leading-tight line-clamp-2 mb-0.5">
                                                                    {p.name}
                                                                </p>
                                                                {p.subcategory && (
                                                                    <p className="text-[10px] sm:text-[11px] text-stone-400 leading-tight">{p.subcategory}</p>
                                                                )}
                                                                <p className="text-[10px] sm:text-[11px] text-stone-400 mb-2.5">{p.unit}</p>

                                                                <div className="flex items-end justify-between gap-1.5">
                                                                    <p className="font-black text-stone-900 text-[15px] sm:text-base tabular-nums leading-none">
                                                                        {formatCurrency(p.price)}
                                                                    </p>

                                                                    {/* Add / Quantity controls */}
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
                                                                                        className="w-7 h-7 flex items-center justify-center text-stone-500 hover:bg-stone-200 active:bg-stone-300 transition-colors"
                                                                                    >
                                                                                        <Minus className="w-3 h-3" />
                                                                                    </button>
                                                                                    <span className="w-5 text-center text-[11px] font-bold text-stone-800 tabular-nums">
                                                                                        {qty}
                                                                                    </span>
                                                                                    <button
                                                                                        onClick={() => updateQuantity(p.id, qty + 1)}
                                                                                        className="w-7 h-7 flex items-center justify-center text-stone-500 hover:bg-stone-200 active:bg-stone-300 transition-colors"
                                                                                    >
                                                                                        <Plus className="w-3 h-3" />
                                                                                    </button>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                        <motion.button
                                                                            whileTap={{ scale: 0.88 }}
                                                                            onClick={() =>
                                                                                qty === 0
                                                                                    ? addItem({ product_id: p.id, name: p.name, unit: p.unit, price: p.price })
                                                                                    : updateQuantity(p.id, 0)
                                                                            }
                                                                            className={cn(
                                                                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
                                                                                qty > 0
                                                                                    ? "bg-[#F97316] text-white shadow-md shadow-[#F97316]/25"
                                                                                    : "bg-[#1C1917] text-white hover:bg-stone-700 active:bg-stone-600"
                                                                            )}
                                                                        >
                                                                            {qty > 0
                                                                                ? <Check className="w-3.5 h-3.5" />
                                                                                : <Plus className="w-3.5 h-3.5" />}
                                                                        </motion.button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        </motion.section>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Sticky Bottom Bar ────────────────────────────────────── */}
            <AnimatePresence>
                {totalItems > 0 && (
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        exit={{ y: 100 }}
                        transition={{ type: "spring", damping: 26, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-40"
                    >
                        {/* Fade gradient */}
                        <div className="h-8 bg-gradient-to-t from-[#1C1917]/90 to-transparent pointer-events-none" />

                        <div className="bg-[#1C1917] border-t border-white/[0.06]">
                            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-4">

                                {/* Item previews */}
                                <div className="flex -space-x-2 shrink-0">
                                    {items.slice(0, 3).map((item, i) => (
                                        <motion.div
                                            key={item.product_id}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: i * 0.05, type: "spring", damping: 15 }}
                                            style={{ zIndex: 3 - i }}
                                            className="w-9 h-9 rounded-full bg-gradient-to-br from-stone-600 to-stone-700 border-2 border-[#1C1917] flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                        >
                                            {item.name.charAt(0).toUpperCase()}
                                        </motion.div>
                                    ))}
                                    {items.length > 3 && (
                                        <div className="w-9 h-9 rounded-full bg-stone-600 border-2 border-[#1C1917] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                            +{items.length - 3}
                                        </div>
                                    )}
                                </div>

                                {/* Total */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-stone-500 leading-none uppercase tracking-wider font-medium">Total do Pedido</p>
                                    <p className="text-lg sm:text-xl font-black text-[#F97316] leading-tight tracking-tight tabular-nums">
                                        {formatCurrency(totalPrice)}
                                    </p>
                                    <p className="text-[10px] text-stone-600">
                                        {totalItems} {totalItems === 1 ? "item" : "itens"}
                                    </p>
                                </div>

                                {/* CTA */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => router.push("/cliente/checkout")}
                                        className="bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white px-5 sm:px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-[#F97316]/30"
                                    >
                                        <span className="hidden sm:inline">FINALIZAR COMPRA</span>
                                        <span className="sm:hidden">FINALIZAR</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </motion.button>
                                    <button
                                        onClick={() => router.push("/cliente/checkout")}
                                        className="w-11 h-11 bg-white/[0.07] text-[#F97316] rounded-xl flex items-center justify-center hover:bg-white/[0.12] transition-colors"
                                    >
                                        <ShoppingCart className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
