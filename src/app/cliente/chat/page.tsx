"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    LayoutGrid, Waves, Zap, Plug, Wrench,
    Package, Home, Paintbrush, AlignJustify,
    Minus, Plus, ShoppingCart, ShoppingBag,
    AlertCircle, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
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
        setSession(JSON.parse(raw) as ClientSession);

        supabase
            .from("products")
            .select("*")
            .eq("active", true)
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

    return (
        <div className="min-h-screen bg-[#F9FAFB]">

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
                    toast.type === "success" ? "bg-[#22C55E] text-white" : "bg-red-500 text-white"
                )}>
                    {toast.type === "success"
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            <ClientHeader searchValue={search} onSearchChange={setSearch} />

            {/* Body */}
            <div className="max-w-[1280px] mx-auto px-4 py-6 flex gap-6 pb-36">

                {/* ── Left Sidebar (desktop only) ──────────────────────────── */}
                <aside className="hidden lg:flex flex-col gap-4 w-64 shrink-0">

                    {/* Cart summary */}
                    <div className="bg-[#F97316] rounded-xl p-4 text-white">
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">SEU CARRINHO</p>
                        <p className="text-2xl font-bold mt-1">{formatCurrency(totalPrice)}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-sm opacity-90">
                            <ShoppingBag className="w-4 h-4 shrink-0" />
                            <span>
                                {totalItems} {totalItems === 1 ? "item selecionado" : "itens selecionados"}
                            </span>
                        </div>
                    </div>

                    {/* Categories */}
                    <div>
                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2 px-1">CATEGORIAS</p>
                        <div className="space-y-0.5">
                            {categories.map((cat) => {
                                const Icon = CATEGORY_ICONS[cat] ?? Package;
                                const isActive = selectedCategory === cat;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left",
                                            isActive
                                                ? "bg-[#F97316]/10 text-[#F97316] font-semibold"
                                                : "text-[#6B7280] hover:bg-white hover:text-[#111827]"
                                        )}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{cat}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* ── Main content ──────────────────────────────────────────── */}
                <div className="flex-1 min-w-0">

                    {/* Title bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between mb-4">
                        <div>
                            <h1 className="text-xl font-bold text-[#111827]">Materiais de Construção</h1>
                            <p className="text-sm text-[#6B7280]">
                                Exibindo {filtered.length} produto{filtered.length !== 1 ? "s" : ""} disponível{filtered.length !== 1 ? "is" : ""}
                            </p>
                        </div>
                    </div>

                    {/* Mobile category pills */}
                    <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
                        {categories.map((cat) => {
                            const Icon = CATEGORY_ICONS[cat] ?? Package;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors border",
                                        selectedCategory === cat
                                            ? "bg-[#F97316] text-white border-[#F97316]"
                                            : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#F97316]/40"
                                    )}
                                >
                                    <Icon className="w-3 h-3" />
                                    {cat}
                                </button>
                            );
                        })}
                    </div>

                    {/* Product grid */}
                    {loadingProducts ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <Skeleton key={i} className="h-64 rounded-xl" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <Package className="w-12 h-12 text-[#6B7280]/30 mb-3" />
                            <p className="font-semibold text-[#111827]">Nenhum produto encontrado</p>
                            <p className="text-sm text-[#6B7280] mt-1">Tente ajustar sua busca ou categoria.</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {Object.entries(grouped).map(([category, prods]) => {
                                const CatIcon = CATEGORY_ICONS[category] ?? Package;
                                return (
                                    <div key={category}>
                                        {/* Category header */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <CatIcon className="w-4 h-4 text-[#F97316]" />
                                            <p className="text-sm font-bold text-[#F97316] uppercase tracking-wider">{category}</p>
                                            <div className="flex-1 h-px bg-[#E5E7EB]" />
                                            <span className="text-xs text-[#6B7280]">{prods.length} produto{prods.length !== 1 ? "s" : ""}</span>
                                        </div>

                                        {/* Grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {prods.map((p) => {
                                                const qty = quantityMap[p.id] ?? 0;
                                                const Icon = CATEGORY_ICONS[p.category] ?? Package;
                                                return (
                                                    <div
                                                        key={p.id}
                                                        className={cn(
                                                            "bg-white rounded-xl border-2 overflow-hidden transition-all duration-200",
                                                            qty > 0
                                                                ? "border-[#F97316] shadow-[0_4px_12px_rgba(249,115,22,0.15)]"
                                                                : "border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-md"
                                                        )}
                                                    >
                                                        {/* Image placeholder */}
                                                        <div className="bg-gradient-to-br from-gray-100 to-gray-200 aspect-[4/3] flex items-center justify-center">
                                                            <Icon className="w-8 h-8 text-gray-400" />
                                                        </div>

                                                        {/* Card body */}
                                                        <div className="p-3">
                                                            <p className="text-[11px] font-bold text-[#F97316] uppercase tracking-wide mb-0.5">{p.category}</p>
                                                            <p className="font-bold text-[#111827] text-sm leading-tight line-clamp-2 mb-0.5">{p.name}</p>
                                                            {p.subcategory && (
                                                                <p className="text-[11px] text-[#6B7280]">{p.subcategory}</p>
                                                            )}
                                                            <p className="text-[11px] text-[#6B7280] mb-2">{p.unit}</p>
                                                            <p className="font-bold text-[#111827] text-sm mb-3">{formatCurrency(p.price)}</p>

                                                            {/* Controls */}
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex items-center border border-[#E5E7EB] rounded-lg overflow-hidden">
                                                                    <button
                                                                        onClick={() => updateQuantity(p.id, qty - 1)}
                                                                        disabled={qty === 0}
                                                                        className="w-7 h-7 flex items-center justify-center text-[#6B7280] hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                                    >
                                                                        <Minus className="w-3 h-3" />
                                                                    </button>
                                                                    <span className="w-7 text-center text-sm font-semibold text-[#111827]">{qty}</span>
                                                                    <button
                                                                        onClick={() => qty === 0
                                                                            ? addItem({ product_id: p.id, name: p.name, unit: p.unit, price: p.price })
                                                                            : updateQuantity(p.id, qty + 1)
                                                                        }
                                                                        className="w-7 h-7 flex items-center justify-center text-[#6B7280] hover:bg-gray-100 transition-colors"
                                                                    >
                                                                        <Plus className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                                <button
                                                                    onClick={() => qty === 0
                                                                        ? addItem({ product_id: p.id, name: p.name, unit: p.unit, price: p.price })
                                                                        : updateQuantity(p.id, 0)
                                                                    }
                                                                    className="relative flex-1 h-7 bg-[#F97316] text-white rounded-lg flex items-center justify-center hover:bg-[#F97316]/90 transition-colors"
                                                                >
                                                                    <ShoppingCart className="w-3.5 h-3.5" />
                                                                    {qty > 0 && (
                                                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#111827] text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                                                                            {qty}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Sticky Bottom Bar ─────────────────────────────────────────── */}
            {totalItems > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#111827] shadow-2xl">
                    <div className="max-w-[1280px] mx-auto px-4 py-3 flex items-center gap-4">

                        {/* Thumbnails */}
                        <div className="flex -space-x-2 shrink-0">
                            {items.slice(0, 3).map((item, i) => (
                                <div
                                    key={item.product_id}
                                    style={{ zIndex: 3 - i }}
                                    className="w-9 h-9 rounded-full bg-gray-700 border-2 border-[#111827] flex items-center justify-center text-white text-xs font-bold shrink-0"
                                >
                                    {item.name.charAt(0)}
                                </div>
                            ))}
                            {items.length > 3 && (
                                <div className="w-9 h-9 rounded-full bg-gray-600 border-2 border-[#111827] flex items-center justify-center text-white text-xs font-bold">
                                    +{items.length - 3}
                                </div>
                            )}
                        </div>

                        {/* Total */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-gray-400 leading-none">Total do Pedido</p>
                            <p className="text-lg font-bold text-[#F97316] leading-tight">{formatCurrency(totalPrice)}</p>
                            <p className="text-[10px] text-gray-500">Entrega a calcular</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => router.push("/cliente/checkout")}
                                className="bg-[#F97316] text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#F97316]/90 transition-colors flex items-center gap-2"
                            >
                                FINALIZAR COMPRA
                                <span>→</span>
                            </button>
                            <button
                                onClick={() => router.push("/cliente/checkout")}
                                className="w-10 h-10 bg-[#F97316]/20 text-[#F97316] rounded-full flex items-center justify-center hover:bg-[#F97316]/30 transition-colors"
                            >
                                <ShoppingCart className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
