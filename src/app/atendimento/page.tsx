"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MapPin, Search, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { sanitizeExternalText, LIMITS } from "@/lib/validators";

// ── Design tokens ──────────────────────────────────────────────────────────────
const displayStyle   = { fontFamily: "var(--font-display)", fontWeight: 400 };
const eyebrowClass   = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";
const labelClass     = "block text-[11px] uppercase tracking-[0.18em] font-semibold text-stone-500 mb-1.5";
const inputClass     = "w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-[14px] text-stone-900 placeholder:text-stone-400 outline-none transition-all duration-200 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5";
const cardClass      = "bg-white rounded-2xl border border-stone-200/70 shadow-sm";

// ── Types ──────────────────────────────────────────────────────────────────────
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

interface AddrFields {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
}

const EMPTY_ADDR: AddrFields = { street: "", neighborhood: "", city: "", state: "" };

// ── Masks ──────────────────────────────────────────────────────────────────────
function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

function maskPhone(v: string): string {
    let d = v.replace(/\D/g, "").slice(0, 11);
    if (!d) return "";
    if (d.length <= 2)  return `(${d}`;
    if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ── Step Indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: Step }) {
    const steps: { n: Step; label: string }[] = [
        { n: 1, label: "Cliente" },
        { n: 2, label: "Produtos" },
        { n: 3, label: "Confirmar" },
    ];

    return (
        <div className="flex items-start justify-center gap-0 mb-10">
            {steps.map(({ n, label }, i) => {
                const done   = current > n;
                const active = current === n;
                return (
                    <div key={n} className="flex items-start">
                        <div className="flex flex-col items-center gap-1.5">
                            <div className={cn(
                                "w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold transition-all duration-300",
                                done   && "bg-stone-900 text-white shadow-[0_2px_8px_rgba(28,25,23,0.22)]",
                                active && "bg-orange-500 text-white shadow-[0_2px_12px_rgba(249,115,22,0.35)] ring-4 ring-orange-500/20",
                                !done && !active && "bg-white border-2 border-stone-200 text-stone-400"
                            )}>
                                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : n}
                            </div>
                            <span className={cn(
                                "text-[11px] font-semibold whitespace-nowrap transition-colors",
                                active ? "text-stone-900" : done ? "text-stone-500" : "text-stone-400"
                            )}>{label}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={cn(
                                "h-[2px] w-20 sm:w-28 mx-3 mt-[17px] rounded-full transition-all duration-500",
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

    const stepSubtitles: Record<Step, string> = {
        1: "Selecione ou cadastre o cliente que ligou",
        2: "Adicione os produtos ao pedido",
        3: "Revise e confirme o pedido",
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="space-y-1">
                <p className={cn(eyebrowClass)}>Atendimento</p>
                <h1
                    className="text-[42px] leading-[0.96] tracking-tight text-stone-900"
                    style={displayStyle}
                >
                    Pedido por Ligação
                </h1>
                <p className="text-[13px] text-stone-500 pt-1">{stepSubtitles[step]}</p>
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

// ── Step 1: Client Search + Inline Create with CEP ────────────────────────────
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

    // New client fields
    const [newName, setNewName]         = useState("");
    const [newPhone, setNewPhone]       = useState("");
    const [creating, setCreating]       = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // CEP state
    const [cep, setCep]                 = useState("");
    const [cepStatus, setCepStatus]     = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError]       = useState("");
    const [addrFields, setAddrFields]   = useState<AddrFields>(EMPTY_ADDR);
    const [numberField, setNumberField] = useState("");
    const fetchedCepRef                 = useRef("");

    async function fetchCep(digits: string) {
        setCepStatus("loading");
        setCepError("");

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8_000);

        try {
            const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ac.signal });
            const data = await res.json() as Record<string, string>;
            if (fetchedCepRef.current !== digits) return;

            if (data.erro) {
                setCepStatus("error");
                setCepError("CEP não encontrado.");
                return;
            }

            setAddrFields({
                street:       sanitizeExternalText(data.logradouro, LIMITS.street),
                neighborhood: sanitizeExternalText(data.bairro,     LIMITS.neighborhood),
                city:         sanitizeExternalText(data.localidade,  LIMITS.city),
                state:        sanitizeExternalText(data.uf,          LIMITS.state),
            });
            setCepStatus("ok");
        } catch {
            if (fetchedCepRef.current === digits) {
                setCepStatus("error");
                setCepError("CEP não encontrado.");
            }
        } finally {
            clearTimeout(timer);
        }
    }

    function handleCepChange(raw: string) {
        const masked = maskCep(raw);
        setCep(masked);
        setAddrFields(EMPTY_ADDR);
        setCepStatus("idle");
        setCepError("");
        const digits = masked.replace(/\D/g, "");
        if (digits.length === 8) {
            fetchedCepRef.current = digits;
            fetchCep(digits);
        } else {
            fetchedCepRef.current = "";
        }
    }

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

        const fullAddress = cepStatus === "ok" && addrFields.street
            ? [addrFields.street, numberField.trim(), addrFields.neighborhood, `${addrFields.city}/${addrFields.state}`]
                .filter(Boolean).join(", ")
            : null;

        const { data, error } = await supabase
            .from("clients")
            .insert({
                name: newName.trim(),
                phone: newPhone.trim(),
                address: fullAddress,
                admin_id: adminId,
            })
            .select("id, name, phone, address")
            .single();

        if (error || !data) {
            setCreateError(error?.message ?? "Erro ao cadastrar cliente.");
        } else {
            onSelect(data as SelectedClient);
            setShowForm(false);
            setNewName(""); setNewPhone("");
            setCep(""); setCepStatus("idle"); setAddrFields(EMPTY_ADDR); setNumberField("");
            fetchedCepRef.current = "";
        }
        setCreating(false);
    }

    return (
        <div className="space-y-3">
            {/* Search */}
            <div className={cn(cardClass, "p-6 space-y-4")}>
                <p className={eyebrowClass}>Buscar cliente existente</p>
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => search(e.target.value)}
                        placeholder="Nome ou telefone..."
                        className={cn(inputClass, "pl-10")}
                    />
                    {searching && (
                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
                    )}
                </div>

                {results.length > 0 && (
                    <div className="space-y-1.5">
                        {results.map((c) => {
                            const isSelected = selected?.id === c.id;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => onSelect(isSelected ? null : c)}
                                    className={cn(
                                        "w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-200",
                                        isSelected
                                            ? "border-orange-400 bg-orange-50 shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
                                            : "border-stone-200 hover:border-stone-300 bg-white hover:shadow-sm"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold",
                                                isSelected ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-500"
                                            )}>
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-semibold text-stone-900">{c.name}</p>
                                                <p className="text-[12px] text-stone-400 truncate">
                                                    {c.phone}{c.address ? ` · ${c.address}` : ""}
                                                </p>
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="shrink-0 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {query.trim().length >= 2 && !searching && results.length === 0 && (
                    <div className="flex items-center gap-2 py-2 text-stone-400">
                        <User className="w-4 h-4 shrink-0" />
                        <p className="text-[13px]">Nenhum cliente encontrado para &ldquo;{query}&rdquo;.</p>
                    </div>
                )}
            </div>

            {/* Inline create */}
            <div className={cn(
                cardClass,
                "overflow-hidden transition-shadow",
                showForm ? "shadow-md" : "shadow-none border-dashed"
            )}>
                <button
                    onClick={() => setShowForm((v) => !v)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between gap-2 hover:bg-stone-50/80 transition-colors"
                >
                    <span className="text-[13px] font-semibold text-stone-700">
                        {showForm ? "Cancelar cadastro" : "+ Cadastrar novo cliente"}
                    </span>
                    {showForm && (
                        <span className="text-stone-400 text-[11px] font-medium">ESC para fechar</span>
                    )}
                </button>

                {showForm && (
                    <div className="px-6 pb-6 space-y-4 border-t border-stone-100 pt-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>
                                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> Nome completo *</span>
                                </label>
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="João Silva"
                                    maxLength={LIMITS.name}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone *</span>
                                </label>
                                <input
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(maskPhone(e.target.value))}
                                    placeholder="(11) 99999-0001"
                                    inputMode="tel"
                                    maxLength={15}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        {/* CEP */}
                        <div>
                            <label className={labelClass}>
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> CEP <span className="normal-case tracking-normal font-normal text-stone-400">(opcional)</span></span>
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="00000-000"
                                    maxLength={9}
                                    value={cep}
                                    onChange={(e) => handleCepChange(e.target.value)}
                                    className={cn(
                                        inputClass, "pr-10",
                                        cepStatus === "error" && "border-red-300 focus:border-red-400 focus:ring-red-400/10",
                                        cepStatus === "ok"    && "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/10",
                                    )}
                                />
                                {cepStatus === "loading" && (
                                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
                                )}
                                {cepStatus === "ok" && (
                                    <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" strokeWidth={3} />
                                )}
                            </div>
                            {cepStatus === "error" && (
                                <p className="text-[12px] text-red-600 mt-1">{cepError}</p>
                            )}
                        </div>

                        {/* Address preview — appears when CEP resolves */}
                        {cepStatus === "ok" && addrFields.street && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-3 bg-stone-50/80 rounded-xl p-4 border border-stone-100">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400 mb-0.5">Endereço</p>
                                    <p className="text-[13px] text-stone-800 leading-snug">
                                        {addrFields.street}
                                        {addrFields.neighborhood ? <span className="text-stone-500">, {addrFields.neighborhood}</span> : null}
                                    </p>
                                    <p className="text-[12px] text-stone-500">{addrFields.city}/{addrFields.state}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400 block mb-1">Número</label>
                                    <input
                                        type="text"
                                        placeholder="123"
                                        value={numberField}
                                        onChange={(e) => setNumberField(e.target.value)}
                                        maxLength={LIMITS.address_number}
                                        className={cn(inputClass, "h-10 max-w-[160px]")}
                                    />
                                </div>
                            </div>
                        )}

                        {createError && (
                            <p className="text-[12px] text-red-600">{createError}</p>
                        )}

                        <div className="flex justify-end pt-1">
                            <button
                                onClick={createClient}
                                disabled={creating}
                                className="h-10 px-6 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_2px_8px_rgba(28,25,23,0.18)]"
                            >
                                {creating ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Cadastrando...</>
                                ) : (
                                    "Cadastrar e selecionar"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Selected client badge + advance */}
            <div className="flex items-center justify-between gap-4 pt-1">
                <div className="min-w-0">
                    {selected ? (
                        <div className="flex items-center gap-2 text-[13px]">
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </div>
                            <span className="font-semibold text-stone-900 truncate">{selected.name}</span>
                            <span className="text-stone-400 shrink-0">selecionado</span>
                        </div>
                    ) : (
                        <p className="text-[13px] text-stone-400">Nenhum cliente selecionado</p>
                    )}
                </div>
                <button
                    onClick={onNext}
                    disabled={!selected}
                    className="h-10 px-6 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-400 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_10px_rgba(249,115,22,0.3)] disabled:shadow-none shrink-0"
                >
                    Avançar →
                </button>
            </div>
        </div>
    );
}

// ── Step 2: Product Catalog + Cart ────────────────────────────────────────────
function Step2Products({ adminId, cart, onUpdateCart, cartTotal, onBack, onNext }: {
    adminId: string;
    cart: CartItem[];
    onUpdateCart: (product: Product, delta: number) => void;
    cartTotal: number;
    onBack: () => void;
    onNext: () => void;
}) {
    const [products, setProducts]   = useState<Product[]>([]);
    const [loading, setLoading]     = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [category, setCategory]   = useState("Todos");
    const [search, setSearch]       = useState("");

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

    const categories = ["Todos", ...Array.from(new Set(products.map((p) => p.category))).sort()];

    const filtered = products.filter((p) => {
        const matchCat    = category === "Todos" || p.category === category;
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
    });

    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
    const qtyMap    = Object.fromEntries(cart.map((i) => [i.product_id, i.quantity]));

    if (loadError) return (
        <div className={cn(cardClass, "p-8 text-center space-y-3")}>
            <p className="text-red-500 text-[13px]">{loadError}</p>
            <button onClick={() => window.location.reload()} className="h-9 px-4 bg-stone-900 text-white rounded-xl text-[13px] font-semibold">
                Tentar novamente
            </button>
        </div>
    );

    return (
        <div className="space-y-3">
            {/* Cart summary bar */}
            <div className={cn(cardClass, "px-5 py-3.5 flex items-center justify-between gap-4")}>
                <div className="flex items-center gap-2.5 min-w-0">
                    {cartCount > 0 ? (
                        <>
                            <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                {cartCount}
                            </span>
                            <span className="text-[13px] text-stone-700 font-medium truncate">
                                R$ {cartTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                        </>
                    ) : (
                        <span className="text-[13px] text-stone-400">Nenhum item selecionado</span>
                    )}
                </div>
                <button
                    onClick={onNext}
                    disabled={cartCount === 0}
                    className="h-9 px-5 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-400 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(249,115,22,0.25)] disabled:shadow-none shrink-0"
                >
                    Avançar →
                </button>
            </div>

            <div className={cn(cardClass, "p-5 space-y-4")}>
                {/* Category pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={cn(
                                "shrink-0 h-7 px-3 rounded-full text-[12px] font-semibold transition-all duration-200",
                                category === cat
                                    ? "bg-stone-900 text-white shadow-sm"
                                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar produto..."
                        className={cn(inputClass, "h-10 pl-10")}
                    />
                </div>

                {/* Product grid */}
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-[100px] bg-stone-100 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="text-[13px] text-stone-400 text-center py-8">Nenhum produto encontrado.</p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                        {filtered.map((p) => {
                            const qty = qtyMap[p.id] ?? 0;
                            return (
                                <div
                                    key={p.id}
                                    className={cn(
                                        "rounded-xl border p-3.5 transition-all duration-200",
                                        qty > 0
                                            ? "border-orange-300 bg-orange-50/70 shadow-sm"
                                            : "border-stone-200 bg-white hover:border-stone-300"
                                    )}
                                >
                                    {qty > 0 && (
                                        <div className="flex justify-end mb-1">
                                            <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                                                ×{qty}
                                            </span>
                                        </div>
                                    )}
                                    <p className={cn(
                                        "text-[12px] font-semibold leading-tight",
                                        qty > 0 ? "text-stone-900" : "text-stone-800",
                                        qty === 0 && "mb-1"
                                    )}>
                                        {p.name}
                                    </p>
                                    <p className="text-[11px] text-stone-400 mb-3">
                                        R$ {p.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / {p.unit}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onUpdateCart(p, -1)}
                                            disabled={qty === 0}
                                            className="w-7 h-7 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-25 disabled:cursor-not-allowed text-stone-700 font-bold text-[15px] flex items-center justify-center transition-colors"
                                        >
                                            −
                                        </button>
                                        <span className={cn(
                                            "flex-1 text-center text-[13px] font-bold tabular-nums",
                                            qty > 0 ? "text-orange-500" : "text-stone-300"
                                        )}>
                                            {qty || "·"}
                                        </span>
                                        <button
                                            onClick={() => onUpdateCart(p, 1)}
                                            className="w-7 h-7 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 font-bold text-[15px] flex items-center justify-center transition-colors"
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

            <button onClick={onBack} className="text-[13px] text-stone-400 hover:text-stone-700 transition-colors">
                ← Voltar
            </button>
        </div>
    );
}

// ── Step 3: Confirmation + Submission ─────────────────────────────────────────
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
        <div className="space-y-3">
            {/* Client */}
            <div className={cn(cardClass, "p-5 flex items-center gap-4")}>
                <div className="w-11 h-11 rounded-full bg-stone-900 flex items-center justify-center text-white text-[15px] font-bold shrink-0" style={displayStyle}>
                    {client.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                    <p className={cn(eyebrowClass, "mb-0.5")}>Cliente</p>
                    <p className="text-[15px] font-semibold text-stone-900 leading-tight">{client.name}</p>
                    <p className="text-[12px] text-stone-400 truncate mt-0.5">
                        {client.phone}{client.address ? ` · ${client.address}` : ""}
                    </p>
                </div>
            </div>

            {/* Items */}
            <div className={cn(cardClass, "p-5")}>
                <p className={cn(eyebrowClass, "mb-4")}>Itens do pedido</p>
                <div className="divide-y divide-stone-100">
                    {cart.map((item) => (
                        <div key={item.product_id} className="py-3 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium text-stone-900">{item.product_name}</p>
                                <p className="text-[12px] text-stone-400 mt-0.5">
                                    {item.quantity} {item.unit} × R$ {item.unit_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <span className="text-[13px] font-semibold text-stone-900 tabular-nums shrink-0">
                                R$ {(item.unit_price * item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="border-t border-stone-200 mt-1 pt-4 flex items-center justify-between">
                    <span className="text-[14px] font-bold text-stone-900">Total</span>
                    <span className="text-[22px] font-bold text-stone-900 tabular-nums" style={displayStyle}>
                        R$ {cartTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Notes */}
            <div className={cn(cardClass, "p-5")}>
                <label className={cn(labelClass)}>
                    Observações <span className="normal-case tracking-normal font-normal text-stone-400">(opcional)</span>
                </label>
                <textarea
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Entregar no fundo, portão azul..."
                    rows={3}
                    className="w-full px-3.5 py-3 rounded-xl border border-stone-200 bg-white text-[14px] text-stone-900 placeholder:text-stone-400 outline-none transition-all duration-200 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 resize-none"
                />
            </div>

            {submitError && (
                <p className="text-[12px] text-red-600 text-center py-1">{submitError}</p>
            )}

            <div className="flex items-center justify-between gap-4 pt-1">
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
                    className="h-11 px-8 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2.5 shadow-[0_4px_14px_rgba(28,25,23,0.22)]"
                >
                    {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Criando pedido...</>
                    ) : (
                        <><Check className="w-4 h-4" strokeWidth={3} /> Confirmar Pedido</>
                    )}
                </button>
            </div>
        </div>
    );
}
