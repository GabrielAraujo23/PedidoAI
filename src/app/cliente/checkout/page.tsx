"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ChevronRight, MapPin, QrCode,
    CreditCard, Banknote, UtensilsCrossed, Trash2,
    AlertCircle, Check, Loader2, Pencil, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ClientHeader } from "@/components/client-header";
import { QuantityStepper } from "@/components/quantity-stepper";
import { useCart } from "@/context/CartContext";
import { calculateDistance } from "@/lib/haversine";
import { useClientSession } from "@/lib/client-session";
import { sanitizeExternalCoords, sanitizeExternalText, truncate, LIMITS } from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";

type PaymentMethod = "pix" | "cartao" | "dinheiro" | "vr";

interface AddrForm {
    cep: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    number: string;
    complement: string;
}

interface StoreCoords {
    lat: number;
    lng: number;
    radius: number;
    rate: number;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; Icon: typeof QrCode }[] = [
    { id: "pix",      label: "PIX",      Icon: QrCode },
    { id: "cartao",   label: "Cartão",   Icon: CreditCard },
    { id: "dinheiro", label: "Dinheiro", Icon: Banknote },
    { id: "vr",       label: "VR / VA",  Icon: UtensilsCrossed },
];

const EMPTY_ADDR: AddrForm = {
    cep: "", street: "", neighborhood: "", city: "", state: "", number: "", complement: "",
};

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

const inputClass =
    "w-full h-10 px-3.5 rounded-xl border border-stone-200 bg-white text-[14px] text-stone-900 placeholder:text-stone-400 outline-none transition-all duration-200 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 disabled:bg-stone-50";

const eyebrowClass =
    "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";

export default function CheckoutPage() {
    const { session, loading: sessionLoading } = useClientSession();
    const sessionRef = useRef(session);
    const [mounted, setMounted] = useState(false);
    const [payment, setPayment] = useState<PaymentMethod>("pix");
    const [coupon, setCoupon] = useState("");
    const [placing, setPlacing] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const [addrForm, setAddrForm] = useState<AddrForm>(EMPTY_ADDR);
    const [addrLoadState, setAddrLoadState] = useState<"loading" | "found" | "none">("loading");
    const [editingAddress, setEditingAddress] = useState(false);
    const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError] = useState("");
    const fetchedCepRef = useRef("");

    const [storeCoords, setStoreCoords] = useState<StoreCoords | null>(null);
    const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [distanceKm, setDistanceKm] = useState<number | null>(null);
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [deliveryStatus, setDeliveryStatus] = useState<"idle" | "ok" | "too_far">("idle");

    const router = useRouter();
    const { items, removeItem, updateQuantity, clearCart, totalItems, totalPrice } = useCart();

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { sessionRef.current = session; }, [session]);

    useEffect(() => {
        if (!session) return;

        supabase
            .from("store_settings")
            .select("latitude, longitude, delivery_radius_km, delivery_rate_per_km")
            .eq("admin_id", session.adminId)
            .single()
            .then(({ data }) => {
                const lat = data?.latitude ? parseFloat(data.latitude) : 0;
                const lng = data?.longitude ? parseFloat(data.longitude) : 0;
                if (lat && lng) {
                    setStoreCoords({
                        lat, lng,
                        radius: parseFloat(data?.delivery_radius_km ?? "20") || 20,
                        rate:   parseFloat(data?.delivery_rate_per_km ?? "3")  || 3,
                    });
                }
            });

        supabase
            .from("clients")
            .select("*")
            .eq("id", session.clientId)
            .single()
            .then(({ data }) => {
                if (data?.cep && data?.street) {
                    setAddrForm({
                        cep:          data.cep,
                        street:       data.street       || "",
                        neighborhood: data.neighborhood || "",
                        city:         data.city         || "",
                        state:        data.state        || "",
                        number:       data.number       || "",
                        complement:   data.complement   || "",
                    });
                    setCepStatus("ok");
                    setAddrLoadState("found");
                    if (data.latitude && data.longitude) {
                        setCustomerCoords({
                            lat: parseFloat(String(data.latitude)),
                            lng: parseFloat(String(data.longitude)),
                        });
                    }
                } else {
                    setAddrLoadState("none");
                }
            });
    }, [session]);

    useEffect(() => {
        if (mounted && totalItems === 0 && !placing) {
            router.push("/cliente/catalogo");
        }
    }, [mounted, totalItems, placing, router]);

    useEffect(() => {
        if (!customerCoords || !storeCoords) return;
        const dist = calculateDistance(
            storeCoords.lat, storeCoords.lng,
            customerCoords.lat, customerCoords.lng
        );
        const rounded = Math.round(dist * 10) / 10;
        setDistanceKm(rounded);
        if (rounded > storeCoords.radius) {
            setDeliveryStatus("too_far");
            setDeliveryFee(0);
        } else {
            setDeliveryStatus("ok");
            setDeliveryFee(Math.round(rounded * storeCoords.rate * 100) / 100);
        }
    }, [customerCoords, storeCoords]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    async function fetchCep(digits: string) {
        setCepStatus("loading");
        setCepError("");
        setCustomerCoords(null);
        setDistanceKm(null);
        setDeliveryStatus("idle");
        setDeliveryFee(0);

        try {
            const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
            const viaData = await res.json();
            if (fetchedCepRef.current !== digits) return;

            if (viaData.erro) {
                setCepStatus("error");
                setCepError("CEP não encontrado.");
                return;
            }

            setAddrForm((prev) => ({
                ...prev,
                street:       sanitizeExternalText(viaData.logradouro, LIMITS.street),
                neighborhood: sanitizeExternalText(viaData.bairro,     LIMITS.neighborhood),
                city:         sanitizeExternalText(viaData.localidade,  LIMITS.city),
                state:        sanitizeExternalText(viaData.uf,          LIMITS.state),
            }));
            setCepStatus("ok");

            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/search?postalcode=${digits}&country=BR&format=json`
            );
            const geoData = await geoRes.json();
            if (fetchedCepRef.current !== digits) return;

            if (geoData[0]) {
                const coords = sanitizeExternalCoords(geoData[0].lat, geoData[0].lon);
                if (coords) {
                    setCustomerCoords(coords);
                    if (sessionRef.current) {
                        await supabase.from("clients").update({
                            cep:          digits,
                            street:       sanitizeExternalText(viaData.logradouro, LIMITS.street),
                            neighborhood: sanitizeExternalText(viaData.bairro,     LIMITS.neighborhood),
                            city:         sanitizeExternalText(viaData.localidade,  LIMITS.city),
                            state:        sanitizeExternalText(viaData.uf,          LIMITS.state),
                            latitude:     coords.lat,
                            longitude:    coords.lng,
                        }).eq("id", sessionRef.current.clientId);
                    }
                }
            }
        } catch {
            if (fetchedCepRef.current === digits) {
                setCepStatus("error");
                setCepError("CEP não encontrado.");
            }
        }
    }

    function handleCepChange(raw: string) {
        const masked = maskCep(raw);
        setAddrForm({ ...EMPTY_ADDR, cep: masked, number: addrForm.number, complement: addrForm.complement });
        setCepStatus("idle");
        setCepError("");
        setCustomerCoords(null);
        setDistanceKm(null);
        setDeliveryStatus("idle");
        setDeliveryFee(0);

        const digits = masked.replace(/\D/g, "");
        if (digits.length === 8) {
            fetchedCepRef.current = digits;
            fetchCep(digits);
        } else {
            fetchedCepRef.current = "";
        }
    }

    function handleCepBlur() {
        const digits = addrForm.cep.replace(/\D/g, "");
        if (digits.length === 8 && digits !== fetchedCepRef.current) {
            fetchedCepRef.current = digits;
            fetchCep(digits);
        }
    }

    function handleEditAddress() {
        setEditingAddress(true);
        setAddrForm(EMPTY_ADDR);
        setCepStatus("idle");
        setCepError("");
        setCustomerCoords(null);
        setDistanceKm(null);
        setDeliveryStatus("idle");
        setDeliveryFee(0);
        fetchedCepRef.current = "";
    }

    async function handlePlaceOrder() {
        if (!session || items.length === 0) return;
        setPlacing(true);

        await supabase.from("clients").update({
            number:     addrForm.number     || null,
            complement: addrForm.complement || null,
        }).eq("id", session.clientId);

        const { data: allOrders } = await supabase.from("orders").select("id, status");
        const ids = (allOrders ?? []).map((o: { id: string }) => parseInt(o.id) || 0);
        const nextId = String((ids.length > 0 ? Math.max(...ids) : 0) + 1);
        const novoCount = (allOrders ?? []).filter((o: { status: string }) => o.status === "novo").length;
        const productsStr = items.map((i) => `${i.quantity}x ${i.name}`).join(", ");

        const { data: orderData, error } = await supabase
            .from("orders")
            .insert({
                id:           nextId,
                client:       truncate(session.name, LIMITS.name),
                client_id:    session.clientId,
                products:     productsStr,
                status:       "novo",
                position:     novoCount,
                cep:          addrForm.cep.replace(/\D/g, "") || null,
                street:       addrForm.street       ? truncate(addrForm.street, LIMITS.street)             : null,
                number:       addrForm.number       ? truncate(addrForm.number, LIMITS.address_number)     : null,
                complement:   addrForm.complement   ? truncate(addrForm.complement, LIMITS.complement)     : null,
                neighborhood: addrForm.neighborhood ? truncate(addrForm.neighborhood, LIMITS.neighborhood) : null,
                city:         addrForm.city         ? truncate(addrForm.city, LIMITS.city)                 : null,
                state:        addrForm.state        ? truncate(addrForm.state, LIMITS.state)               : null,
                distance_km:  distanceKm,
                delivery_fee: deliveryStatus === "ok" ? deliveryFee : null,
                admin_id:     session.adminId || null,
            })
            .select("id")
            .single();

        if (error || !orderData) {
            logError("order_checkout", error ?? "no order data");
            logEvent({
                event_type: "order_failed",
                actor_type: "client",
                actor_id: session.clientId,
                metadata: { channel: "checkout" },
            });
            setToast({ type: "error", message: "Erro ao criar pedido. Tente novamente." });
            setPlacing(false);
            return;
        }

        const { error: itemsError } = await supabase.from("order_items").insert(
            items.map((i) => ({
                order_id:     orderData.id,
                product_id:   i.product_id,
                product_name: i.name,
                unit:         i.unit,
                quantity:     i.quantity,
                unit_price:   i.price,
            }))
        );
        if (itemsError) logError("order_items_insert", itemsError);

        logEvent({
            event_type: "order_created",
            actor_type: "client",
            actor_id: session.clientId,
            resource_type: "order",
            resource_id: orderData.id,
            metadata: { item_count: items.length, channel: "checkout" },
        });
        clearCart();
        router.push(`/cliente/pedido/${orderData.id}`);
    }

    const orderTotal = totalPrice + deliveryFee;
    const canPlaceOrder =
        items.length > 0 &&
        cepStatus === "ok" &&
        addrForm.number.trim() !== "" &&
        deliveryStatus !== "too_far";
    const showSavedCard = addrLoadState === "found" && !editingAddress;
    const showCepInput  = addrLoadState === "none"  || editingAddress;

    if (!mounted || sessionLoading || !session || addrLoadState === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-warm">
                <Loader2 className="w-7 h-7 animate-spin text-stone-700" />
            </div>
        );
    }

    return (
        <div
            className="min-h-screen relative bg-warm"
            style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl text-[13px] font-semibold",
                    toast.type === "success"
                        ? "bg-emerald-700 text-white"
                        : "bg-red-700 text-white"
                )}>
                    {toast.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {toast.message}
                </div>
            )}

            <ClientHeader session={session} />

            <main className="relative z-10 max-w-[1280px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-24">

                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-[12px] mb-8" aria-label="breadcrumb">
                    <Link href="/cliente/catalogo" className="text-stone-500 hover:text-stone-900 transition-colors">
                        Catálogo
                    </Link>
                    <ChevronRight className="w-3 h-3 text-stone-400" />
                    <span className="text-stone-900 font-semibold">Checkout</span>
                </nav>

                {/* Page heading */}
                <header className="mb-10 max-w-[820px]">
                    <p className={cn(eyebrowClass, "mb-3")}>Última etapa</p>
                    <h1
                        className="text-[40px] sm:text-[52px] leading-[0.96] tracking-tight text-stone-900"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                    >
                        Confirme e{" "}
                        <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>
                            finalize
                        </em>{" "}
                        seu pedido.
                    </h1>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">

                    {/* ── Left column ─────────────────────────────────────── */}
                    <div className="space-y-6">

                        {/* Cart items */}
                        <section className="bg-white rounded-2xl border border-stone-200/70 overflow-hidden">
                            <header className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-stone-100">
                                <div>
                                    <p className={eyebrowClass}>Carrinho</p>
                                    <h2
                                        className="text-[20px] tracking-tight text-stone-900 mt-0.5"
                                        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                                    >
                                        {totalItems} {totalItems === 1 ? "item" : "itens"}
                                    </h2>
                                </div>
                                <span className="text-[12px] text-stone-500 tabular-nums">
                                    {formatCurrency(totalPrice)}
                                </span>
                            </header>

                            {items.length === 0 ? (
                                <p className="text-[13px] text-stone-500 text-center py-10">Carrinho vazio.</p>
                            ) : (
                                <ul className="divide-y divide-stone-100">
                                    {items.map((item) => (
                                        <li key={item.product_id} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50/50 transition-colors">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[14px] font-semibold text-stone-900 truncate">{item.name}</p>
                                                <p className="text-[11px] text-stone-500 mt-0.5 uppercase tracking-wider">
                                                    {item.unit} · {formatCurrency(item.price)}/un
                                                </p>
                                            </div>

                                            <QuantityStepper
                                                value={item.quantity}
                                                label={item.name}
                                                onChange={(n) => updateQuantity(item.product_id, n)}
                                                className="shrink-0 w-[132px]"
                                            />

                                            <p
                                                className="text-stone-900 tabular-nums w-24 text-right shrink-0 leading-none"
                                                style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "16px" }}
                                            >
                                                {formatCurrency(item.quantity * item.price)}
                                            </p>

                                            <button
                                                onClick={() => removeItem(item.product_id)}
                                                className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                                title="Remover"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {/* Delivery address */}
                        <section className="bg-white rounded-2xl border border-stone-200/70 p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <p className={eyebrowClass}>Entrega</p>
                                    <h2
                                        className="text-[20px] tracking-tight text-stone-900 mt-0.5"
                                        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                                    >
                                        Endereço de entrega
                                    </h2>
                                </div>
                                <MapPin className="w-5 h-5 text-stone-400" />
                            </div>

                            {/* Saved address */}
                            {showSavedCard && (
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3 p-4 bg-stone-50/80 border border-stone-200/60 rounded-xl">
                                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                            <p className="text-[13px] text-stone-700 leading-relaxed">
                                                {addrForm.street}{addrForm.number ? `, ${addrForm.number}` : ""}
                                                {addrForm.complement ? ` · ${addrForm.complement}` : ""}
                                                <br />
                                                <span className="text-stone-500">
                                                    {addrForm.neighborhood} · {addrForm.city}/{addrForm.state} · {addrForm.cep}
                                                </span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleEditAddress}
                                            className="flex items-center gap-1 text-[11px] text-stone-700 hover:text-stone-900 font-semibold uppercase tracking-wider shrink-0"
                                        >
                                            <Pencil className="w-3 h-3" />
                                            Alterar
                                        </button>
                                    </div>

                                    {!addrForm.number.trim() && (
                                        <div className="space-y-1.5">
                                            <label className={eyebrowClass}>
                                                Número <span className="text-red-500 normal-case tracking-normal">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="123"
                                                value={addrForm.number}
                                                onChange={(e) => setAddrForm((prev) => ({ ...prev, number: e.target.value }))}
                                                maxLength={LIMITS.address_number}
                                                className={inputClass}
                                            />
                                        </div>
                                    )}

                                    {deliveryStatus === "ok" && distanceKm !== null && (
                                        <div className="flex items-center gap-2 text-[12px] text-emerald-700 bg-emerald-50/80 border border-emerald-200/60 rounded-xl px-3.5 py-2.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                            <span>
                                                <span className="font-semibold">Entrega disponível</span> · {distanceKm.toFixed(1)} km da loja
                                            </span>
                                        </div>
                                    )}
                                    {deliveryStatus === "too_far" && distanceKm !== null && storeCoords && (
                                        <div className="flex items-center gap-2 text-[12px] text-red-700 bg-red-50/80 border border-red-200/60 rounded-xl px-3.5 py-2.5">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                            <span>
                                                <span className="font-semibold">Fora da área.</span> Cobrimos até {storeCoords.radius} km.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CEP input flow */}
                            {showCepInput && (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className={eyebrowClass}>CEP</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="00000-000"
                                                maxLength={9}
                                                value={addrForm.cep}
                                                onChange={(e) => handleCepChange(e.target.value)}
                                                onBlur={handleCepBlur}
                                                className={cn(
                                                    inputClass, "pr-9",
                                                    cepStatus === "error" && "border-red-300 focus:border-red-500 focus:ring-red-500/10",
                                                    cepStatus === "ok"    && "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/10",
                                                )}
                                            />
                                            {cepStatus === "loading" && (
                                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
                                            )}
                                            {cepStatus === "ok" && (
                                                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" strokeWidth={3} />
                                            )}
                                        </div>
                                        {cepError && (
                                            <p className="flex items-center gap-1 text-[12px] text-red-600 pt-0.5">
                                                <AlertCircle className="w-3 h-3" />
                                                {cepError}
                                            </p>
                                        )}
                                    </div>

                                    {cepStatus === "ok" && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="grid grid-cols-3 gap-3 p-3.5 bg-stone-50/60 border border-stone-200/50 rounded-xl">
                                                <div className="col-span-3">
                                                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">Endereço</p>
                                                    <p className="text-[13px] text-stone-700 leading-snug mt-0.5">
                                                        {addrForm.street}, <span className="text-stone-500">{addrForm.neighborhood}</span>
                                                    </p>
                                                    <p className="text-[12px] text-stone-500">{addrForm.city}/{addrForm.state}</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className={cn(eyebrowClass)}>
                                                        Número <span className="text-red-500 normal-case tracking-normal">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="123"
                                                        value={addrForm.number}
                                                        onChange={(e) => setAddrForm((prev) => ({ ...prev, number: e.target.value }))}
                                                        maxLength={LIMITS.address_number}
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={eyebrowClass}>
                                                        Complemento <span className="text-stone-400 normal-case tracking-normal">(opcional)</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="Apto, bloco, ref."
                                                        value={addrForm.complement}
                                                        onChange={(e) => setAddrForm((prev) => ({ ...prev, complement: e.target.value }))}
                                                        maxLength={LIMITS.complement}
                                                        className={inputClass}
                                                    />
                                                </div>
                                            </div>

                                            {deliveryStatus === "ok" && distanceKm !== null && (
                                                <div className="flex items-center gap-2 text-[12px] text-emerald-700 bg-emerald-50/80 border border-emerald-200/60 rounded-xl px-3.5 py-2.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    <span>
                                                        <span className="font-semibold">Entrega disponível</span> · {distanceKm.toFixed(1)} km da loja
                                                    </span>
                                                </div>
                                            )}
                                            {deliveryStatus === "too_far" && distanceKm !== null && storeCoords && (
                                                <div className="flex items-center gap-2 text-[12px] text-red-700 bg-red-50/80 border border-red-200/60 rounded-xl px-3.5 py-2.5">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    <span>
                                                        <span className="font-semibold">Fora da área.</span> Cobrimos até {storeCoords.radius} km.
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* Payment method */}
                        <section className="bg-white rounded-2xl border border-stone-200/70 p-6">
                            <div className="mb-5">
                                <p className={eyebrowClass}>Pagamento</p>
                                <h2
                                    className="text-[20px] tracking-tight text-stone-900 mt-0.5"
                                    style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                                >
                                    Como prefere pagar?
                                </h2>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {PAYMENT_OPTIONS.map(({ id, label, Icon }) => (
                                    <button
                                        key={id}
                                        onClick={() => setPayment(id)}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all duration-200 text-[12.5px] font-semibold",
                                            payment === id
                                                ? "border-stone-900 bg-stone-50 text-stone-900"
                                                : "border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-800"
                                        )}
                                    >
                                        <Icon className={cn("w-5 h-5", payment === id ? "text-orange-700" : "text-stone-500")} />
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {payment === "pix" && (
                                <div className="mt-4 border border-dashed border-stone-300 rounded-xl p-4 flex items-center gap-4 bg-stone-50/40">
                                    <div className="w-14 h-14 bg-white border border-stone-200 rounded-lg flex items-center justify-center shrink-0">
                                        <QrCode className="w-7 h-7 text-stone-400" />
                                    </div>
                                    <p className="text-[12px] text-stone-600 leading-relaxed">
                                        O QR Code do PIX será gerado quando você finalizar o pedido.
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* ── Right column — Order summary ─────────────────────── */}
                    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">

                        <div className="bg-white rounded-2xl border border-stone-200/70 p-6">
                            <p className={eyebrowClass}>Resumo</p>
                            <h2
                                className="text-[22px] tracking-tight text-stone-900 mt-0.5 mb-5"
                                style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                            >
                                Seu pedido
                            </h2>

                            <dl className="space-y-2.5 text-[13px] mb-5">
                                <div className="flex justify-between">
                                    <dt className="text-stone-500">Subtotal</dt>
                                    <dd className="text-stone-900 tabular-nums">{formatCurrency(totalPrice)}</dd>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <dt className="text-stone-500">Entrega</dt>
                                    <dd className="text-right">
                                        {deliveryStatus === "ok" ? (
                                            <span className="text-stone-900 tabular-nums">
                                                {formatCurrency(deliveryFee)}
                                                {distanceKm !== null && (
                                                    <span className="block text-[10px] text-stone-400 uppercase tracking-wider mt-0.5">
                                                        ~{distanceKm.toFixed(1)} km
                                                    </span>
                                                )}
                                            </span>
                                        ) : deliveryStatus === "too_far" ? (
                                            <span className="text-red-600 text-[12px] font-medium">Fora da área</span>
                                        ) : (
                                            <span className="text-stone-400 text-[12px] italic">A calcular</span>
                                        )}
                                    </dd>
                                </div>

                                <div className="border-t border-stone-200 pt-3 mt-3 flex justify-between items-baseline">
                                    <dt className={eyebrowClass}>Total</dt>
                                    <dd
                                        className="text-stone-900 tabular-nums leading-none"
                                        style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "28px" }}
                                    >
                                        {formatCurrency(orderTotal)}
                                    </dd>
                                </div>
                            </dl>

                            <button
                                onClick={handlePlaceOrder}
                                disabled={placing || !canPlaceOrder}
                                className="group w-full h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all duration-200 hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
                            >
                                {placing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        Finalizar pedido
                                        <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                    </>
                                )}
                            </button>

                            {!canPlaceOrder && !placing && (
                                <p className="text-[11px] text-stone-500 text-center mt-3 leading-relaxed">
                                    {cepStatus !== "ok"
                                        ? "Preencha o CEP para continuar."
                                        : addrForm.number.trim() === ""
                                            ? "Informe o número do endereço."
                                            : deliveryStatus === "too_far"
                                                ? "Entrega indisponível para sua região."
                                                : ""}
                                </p>
                            )}

                            <p className="text-[10px] text-stone-400 text-center mt-3 leading-relaxed">
                                Ao finalizar, você concorda com os{" "}
                                <span className="text-stone-700 cursor-pointer hover:underline">Termos de Serviço</span>.
                            </p>
                        </div>

                        {/* Coupon — minimal */}
                        <div className="bg-stone-900 rounded-2xl p-5 relative overflow-hidden">
                            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-orange-700/20 blur-2xl pointer-events-none" />
                            <div className="relative">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-stone-400 mb-1 font-semibold">Cupom</p>
                                <p
                                    className="text-white text-[18px] mb-3"
                                    style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                                >
                                    Tem um <em style={{ fontStyle: "italic" }} className="text-orange-300">desconto?</em>
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={coupon}
                                        onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                                        placeholder="CÓDIGO"
                                        className="flex-1 h-9 px-3 rounded-lg bg-white/10 text-white placeholder:text-white/30 text-[12px] font-semibold outline-none focus:bg-white/15 focus:ring-2 focus:ring-white/20 transition-all"
                                    />
                                    <button className="bg-white text-stone-900 px-3.5 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider hover:bg-stone-100 transition-colors">
                                        Aplicar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
