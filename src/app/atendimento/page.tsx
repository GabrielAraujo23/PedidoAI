"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };
const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";

type Step = 1 | 2 | 3;

interface SelectedClient {
    id: string;
    name: string;
    phone: string;
    address: string;
}

interface CartItem {
    product_id: string;
    product_name: string;
    unit: string;
    unit_price: number;
    quantity: number;
}

interface Product {
    id: string;
    name: string;
    category: string;
    unit: string;
    price: number;
    active: boolean;
}

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
    const steps: { n: Step; label: string }[] = [
        { n: 1, label: "Cliente" },
        { n: 2, label: "Produtos" },
        { n: 3, label: "Confirmar" },
    ];

    return (
        <div className="flex items-center gap-0 mb-8">
            {steps.map(({ n, label }, i) => {
                const done   = current > n;
                const active = current === n;
                return (
                    <div key={n} className="flex items-center">
                        <div className="flex flex-col items-center gap-1">
                            <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-colors",
                                done   && "bg-stone-900 border-stone-900 text-white",
                                active && "bg-orange-500 border-orange-500 text-white",
                                !done && !active && "bg-white border-stone-300 text-stone-400"
                            )}>
                                {done ? "✓" : n}
                            </div>
                            <span className={cn(
                                "text-[11px] font-semibold whitespace-nowrap",
                                active ? "text-stone-900" : "text-stone-400"
                            )}>{label}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={cn(
                                "h-0.5 w-16 sm:w-24 mx-2 mb-4 transition-colors",
                                current > n ? "bg-stone-900" : "bg-stone-200"
                            )} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AtendimentoPage() {
    const { adminSession } = useAuth();
    const router = useRouter();

    const [step, setStep]                     = useState<Step>(1);
    const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
    const [cart, setCart]                     = useState<CartItem[]>([]);
    const [notes, setNotes]                   = useState("");

    function cartTotal() {
        return cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    }

    function updateCart(product: Product, delta: number) {
        setCart((prev) => {
            const existing = prev.find((i) => i.product_id === product.id);
            if (!existing) {
                if (delta <= 0) return prev;
                return [...prev, {
                    product_id: product.id,
                    product_name: product.name,
                    unit: product.unit,
                    unit_price: product.price,
                    quantity: delta,
                }];
            }
            const newQty = existing.quantity + delta;
            if (newQty <= 0) return prev.filter((i) => i.product_id !== product.id);
            return prev.map((i) =>
                i.product_id === product.id ? { ...i, quantity: newQty } : i
            );
        });
    }

    if (!adminSession) return null;

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
                <p className={cn(eyebrowClass, "mb-3")}>Atendimento</p>
                <h1
                    className="text-[40px] leading-[0.96] tracking-tight text-stone-900"
                    style={sectionTitleStyle}
                >
                    Pedido por Ligação
                </h1>
            </header>

            <StepIndicator current={step} />

            {step === 1 && (
                <Step1Client
                    adminId={adminSession.adminId}
                    selected={selectedClient}
                    onSelect={setSelectedClient}
                    onNext={() => setStep(2)}
                />
            )}
            {step === 2 && (
                <Step2Products
                    adminId={adminSession.adminId}
                    cart={cart}
                    onUpdateCart={updateCart}
                    cartTotal={cartTotal()}
                    onBack={() => setStep(1)}
                    onNext={() => setStep(3)}
                />
            )}
            {step === 3 && (
                <Step3Confirm
                    client={selectedClient!}
                    cart={cart}
                    cartTotal={cartTotal()}
                    notes={notes}
                    onNotesChange={setNotes}
                    onBack={() => setStep(2)}
                    onDone={() => router.push("/pedidos")}
                />
            )}
        </div>
    );
}

// ── Step placeholders (replaced in Tasks 4–6) ─────────────────────────────────

function Step1Client({ adminId, selected, onSelect, onNext }: {
    adminId: string;
    selected: SelectedClient | null;
    onSelect: (c: SelectedClient | null) => void;
    onNext: () => void;
}) {
    const [query, setQuery]             = useState("");
    const [results, setResults]         = useState<SelectedClient[]>([]);
    const [searching, setSearching]     = useState(false);
    const [showForm, setShowForm]       = useState(false);
    const [newName, setNewName]         = useState("");
    const [newPhone, setNewPhone]       = useState("");
    const [newAddress, setNewAddress]   = useState("");
    const [creating, setCreating]       = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    async function search(q: string) {
        setQuery(q);
        if (q.trim().length < 2) { setResults([]); return; }
        setSearching(true);
        const { data } = await supabase
            .from("clients")
            .select("id, name, phone, address")
            .eq("admin_id", adminId)
            .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
            .limit(8);
        setResults((data ?? []) as SelectedClient[]);
        setSearching(false);
    }

    async function createClient() {
        if (!newName.trim() || !newPhone.trim()) {
            setCreateError("Nome e telefone são obrigatórios.");
            return;
        }
        setCreating(true);
        setCreateError(null);
        const { data, error } = await supabase
            .from("clients")
            .insert({
                name: newName.trim(),
                phone: newPhone.trim(),
                address: newAddress.trim() || null,
                admin_id: adminId,
            })
            .select("id, name, phone, address")
            .single();
        if (error || !data) {
            setCreateError(error?.message ?? "Erro ao cadastrar cliente.");
        } else {
            onSelect(data as SelectedClient);
            setShowForm(false);
            setNewName(""); setNewPhone(""); setNewAddress("");
        }
        setCreating(false);
    }

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="bg-white rounded-2xl border border-stone-200/70 p-6 space-y-4">
                <p className={eyebrowClass}>Buscar cliente</p>
                <div className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => search(e.target.value)}
                        placeholder="Nome ou telefone..."
                        className="w-full h-10 pl-9 pr-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 transition-colors"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[13px]">🔍</span>
                </div>

                {searching && <p className="text-[12px] text-stone-400">Buscando...</p>}

                {results.length > 0 && (
                    <div className="space-y-2">
                        {results.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(selected?.id === c.id ? null : c)}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-xl border transition-colors",
                                    selected?.id === c.id
                                        ? "border-orange-400 bg-orange-50"
                                        : "border-stone-200 hover:border-stone-400 bg-white"
                                )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-stone-900">{c.name}</p>
                                        <p className="text-[12px] text-stone-500 truncate">
                                            {c.phone}{c.address ? ` · ${c.address}` : ""}
                                        </p>
                                    </div>
                                    {selected?.id === c.id && (
                                        <span className="shrink-0 text-[11px] font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">
                                            ✓ Selecionado
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {query.trim().length >= 2 && !searching && results.length === 0 && (
                    <p className="text-[12px] text-stone-400">
                        Nenhum cliente encontrado para &ldquo;{query}&rdquo;.
                    </p>
                )}
            </div>

            {/* Inline create */}
            <div className={cn(
                "rounded-2xl border overflow-hidden",
                showForm ? "border-stone-200" : "border-dashed border-stone-300"
            )}>
                <button
                    onClick={() => setShowForm((v) => !v)}
                    className="w-full px-6 py-4 text-left text-[13px] font-semibold text-stone-600 hover:text-stone-900 transition-colors flex items-center gap-2"
                >
                    <span className="text-lg">{showForm ? "−" : "+"}</span>
                    Cadastrar novo cliente
                </button>
                {showForm && (
                    <div className="px-6 pb-6 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={cn(eyebrowClass, "block mb-1.5")}>Nome completo *</label>
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="João Silva"
                                    className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 transition-colors"
                                />
                            </div>
                            <div>
                                <label className={cn(eyebrowClass, "block mb-1.5")}>Telefone *</label>
                                <input
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder="(11) 99999-0001"
                                    className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 transition-colors"
                                />
                            </div>
                        </div>
                        <div>
                            <label className={cn(eyebrowClass, "block mb-1.5")}>Endereço</label>
                            <input
                                value={newAddress}
                                onChange={(e) => setNewAddress(e.target.value)}
                                placeholder="Rua das Flores, 42"
                                className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 transition-colors"
                            />
                        </div>
                        {createError && (
                            <p className="text-[12px] text-red-600">{createError}</p>
                        )}
                        <div className="flex justify-end">
                            <button
                                onClick={createClient}
                                disabled={creating}
                                className="h-9 px-5 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50"
                            >
                                {creating ? "Cadastrando..." : "Cadastrar e selecionar"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Advance */}
            <div className="flex justify-end">
                <button
                    onClick={onNext}
                    disabled={!selected}
                    className="h-10 px-6 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Avançar →
                </button>
            </div>
        </div>
    );
}

function Step2Products({ adminId, cart, onUpdateCart, cartTotal, onBack, onNext }: {
    adminId: string;
    cart: CartItem[];
    onUpdateCart: (product: Product, delta: number) => void;
    cartTotal: number;
    onBack: () => void;
    onNext: () => void;
}) {
    const [products, setProducts]     = useState<Product[]>([]);
    const [loading, setLoading]       = useState(true);
    const [loadError, setLoadError]   = useState<string | null>(null);
    const [category, setCategory]     = useState("Todos");
    const [search, setSearch]         = useState("");

    useEffect(() => {
        supabase
            .from("products")
            .select("id, name, category, unit, price, active")
            .eq("admin_id", adminId)
            .eq("active", true)
            .order("name")
            .then(({ data, error }) => {
                if (error) setLoadError(error.message);
                else setProducts((data ?? []) as Product[]);
                setLoading(false);
            });
    }, [adminId]);

    const categories = [
        "Todos",
        ...Array.from(new Set(products.map((p) => p.category))).sort(),
    ];

    const filtered = products.filter((p) => {
        const matchCat    = category === "Todos" || p.category === category;
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
    });

    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
    const qtyMap    = Object.fromEntries(cart.map((i) => [i.product_id, i.quantity]));

    if (loadError) return (
        <div className="bg-white rounded-2xl border border-stone-200/70 p-6 text-center space-y-3">
            <p className="text-red-500 text-[13px]">{loadError}</p>
            <button
                onClick={() => window.location.reload()}
                className="h-9 px-4 bg-stone-900 text-white rounded-xl text-[13px] font-semibold"
            >
                Tentar novamente
            </button>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Sticky cart summary */}
            <div className="bg-white rounded-2xl border border-stone-200/70 px-5 py-3 flex items-center justify-between gap-4">
                <span className="text-[13px] text-stone-500">
                    {cartCount === 0 ? (
                        "Nenhum item selecionado"
                    ) : (
                        <span>
                            <strong className="text-stone-900">{cartCount} {cartCount === 1 ? "item" : "itens"}</strong>
                            {" · "}R$ {cartTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                    )}
                </span>
                <button
                    onClick={onNext}
                    disabled={cartCount === 0}
                    className="h-9 px-5 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Avançar →
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200/70 p-5 space-y-4">
                {/* Category pills */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={cn(
                                "shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold transition-colors",
                                category === cat
                                    ? "bg-stone-900 text-white"
                                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar produto..."
                        className="w-full h-10 pl-9 pr-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 transition-colors"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[13px]">🔍</span>
                </div>

                {/* Product grid */}
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-24 bg-stone-100 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="text-[13px] text-stone-400 text-center py-6">
                        Nenhum produto encontrado.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {filtered.map((p) => {
                            const qty = qtyMap[p.id] ?? 0;
                            return (
                                <div
                                    key={p.id}
                                    className={cn(
                                        "rounded-xl border p-3 transition-all",
                                        qty > 0
                                            ? "border-orange-300 bg-orange-50/60"
                                            : "border-stone-200 bg-white"
                                    )}
                                >
                                    <p className="text-[12px] font-semibold text-stone-900 leading-tight mb-0.5">
                                        {p.name}
                                    </p>
                                    <p className="text-[11px] text-stone-400 mb-3">
                                        R$ {p.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / {p.unit}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onUpdateCart(p, -1)}
                                            disabled={qty === 0}
                                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-stone-700 font-bold text-[14px] flex items-center justify-center transition-colors"
                                        >
                                            −
                                        </button>
                                        <span className={cn(
                                            "w-6 text-center text-[13px] font-semibold tabular-nums",
                                            qty > 0 ? "text-orange-500" : "text-stone-300"
                                        )}>
                                            {qty}
                                        </span>
                                        <button
                                            onClick={() => onUpdateCart(p, 1)}
                                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[14px] flex items-center justify-center transition-colors"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex justify-start">
                <button
                    onClick={onBack}
                    className="text-[13px] text-stone-400 hover:text-stone-700 transition-colors"
                >
                    ← Voltar
                </button>
            </div>
        </div>
    );
}

function Step3Confirm({ client, cart, cartTotal, notes, onNotesChange, onBack, onDone }: {
    client: SelectedClient;
    cart: CartItem[];
    cartTotal: number;
    notes: string;
    onNotesChange: (v: string) => void;
    onBack: () => void;
    onDone: () => void;
}) {
    const [submitting, setSubmitting]   = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    async function confirm() {
        setSubmitting(true);
        setSubmitError(null);

        try {
            const res = await fetch("/api/atendimento/pedido", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: client.id,
                    client_name: client.name,
                    notes: notes.trim() || null,
                    items: cart.map((i) => ({
                        product_id: i.product_id,
                        product_name: i.product_name,
                        unit: i.unit,
                        unit_price: i.unit_price,
                        quantity: i.quantity,
                    })),
                }),
            });

            const body = await res.json() as { ok?: boolean; error?: string };

            if (res.ok && body.ok) {
                onDone();
            } else {
                setSubmitError(body.error ?? "Erro ao criar pedido. Tente novamente.");
            }
        } catch (e) {
            setSubmitError(e instanceof Error ? e.message : "Erro de rede.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Client summary */}
            <div className="bg-white rounded-2xl border border-stone-200/70 p-5">
                <p className={cn(eyebrowClass, "mb-3")}>Cliente</p>
                <p className="text-[15px] font-semibold text-stone-900">{client.name}</p>
                <p className="text-[13px] text-stone-500 mt-0.5">
                    {client.phone}{client.address ? ` · ${client.address}` : ""}
                </p>
            </div>

            {/* Items list */}
            <div className="bg-white rounded-2xl border border-stone-200/70 p-5">
                <p className={cn(eyebrowClass, "mb-3")}>Itens do pedido</p>
                <div className="divide-y divide-stone-100">
                    {cart.map((item) => (
                        <div key={item.product_id} className="py-2.5 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <span className="text-[13px] font-medium text-stone-900">
                                    {item.product_name}
                                </span>
                                <span className="text-[12px] text-stone-400 ml-2">
                                    × {item.quantity} {item.unit}
                                </span>
                            </div>
                            <span className="text-[13px] font-semibold text-stone-900 tabular-nums shrink-0">
                                R$ {(item.unit_price * item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="border-t border-stone-200 mt-2 pt-3 flex items-center justify-between">
                    <span className="text-[14px] font-bold text-stone-900">Total</span>
                    <span
                        className="text-[18px] font-bold text-stone-900 tabular-nums"
                        style={sectionTitleStyle}
                    >
                        R$ {cartTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Observations */}
            <div className="bg-white rounded-2xl border border-stone-200/70 p-5">
                <label className={cn(eyebrowClass, "block mb-3")}>Observações (opcional)</label>
                <textarea
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Entregar no fundo, portão azul..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 transition-colors resize-none"
                />
            </div>

            {submitError && (
                <p className="text-[12px] text-red-600 text-center">{submitError}</p>
            )}

            <div className="flex items-center justify-between gap-4">
                <button
                    onClick={onBack}
                    disabled={submitting}
                    className="text-[13px] text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-50"
                >
                    ← Editar produtos
                </button>
                <button
                    onClick={confirm}
                    disabled={submitting}
                    className="h-11 px-8 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {submitting ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Criando pedido...
                        </>
                    ) : (
                        "✓ Confirmar Pedido"
                    )}
                </button>
            </div>
        </div>
    );
}
