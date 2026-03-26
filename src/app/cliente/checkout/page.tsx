"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ChevronRight, ShoppingCart, MapPin, QrCode,
    CreditCard, Banknote, UtensilsCrossed, Trash2,
    Rocket, Minus, Plus, AlertCircle, Check, Loader2, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ClientHeader } from "@/components/client-header";
import { useCart } from "@/context/CartContext";
import { calculateDistance } from "@/lib/haversine";
import type { ClientSession } from "@/lib/auth-context";
import { sanitizeExternalCoords, sanitizeExternalText, truncate, LIMITS } from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

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
    radius: number; // km
    rate: number;   // R$/km
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
    const [session, setSession] = useState<ClientSession | null>(null);
    const sessionRef = useRef<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [payment, setPayment] = useState<PaymentMethod>("pix");
    const [coupon, setCoupon] = useState("");
    const [placing, setPlacing] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // Address state
    const [addrForm, setAddrForm] = useState<AddrForm>(EMPTY_ADDR);
    const [addrLoadState, setAddrLoadState] = useState<"loading" | "found" | "none">("loading");
    const [editingAddress, setEditingAddress] = useState(false);
    const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError] = useState("");
    const fetchedCepRef = useRef("");

    // Delivery distance
    const [storeCoords, setStoreCoords] = useState<StoreCoords | null>(null);
    const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [distanceKm, setDistanceKm] = useState<number | null>(null);
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [deliveryStatus, setDeliveryStatus] = useState<"idle" | "ok" | "too_far">("idle");

    const router = useRouter();
    const { items, removeItem, updateQuantity, clearCart, totalItems, totalPrice } = useCart();

    // ── Mount ──────────────────────────────────────────────────────────────────

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
        sessionRef.current = sess;

        // Load store settings (parallel with client fetch)
        supabase
            .from("store_settings")
            .select("latitude, longitude, delivery_radius_km, delivery_rate_per_km")
            .eq("admin_id", sess.adminId)
            .single()
            .then(({ data }) => {
                const lat = data?.latitude ? parseFloat(data.latitude) : 0;
                const lng = data?.longitude ? parseFloat(data.longitude) : 0;
                if (lat && lng) {
                    setStoreCoords({
                        lat,
                        lng,
                        radius: parseFloat(data?.delivery_radius_km ?? "20") || 20,
                        rate:   parseFloat(data?.delivery_rate_per_km ?? "3")  || 3,
                    });
                }
            });

        // Fetch client's saved address
        supabase
            .from("clients")
            .select("*")
            .eq("id", sess.clientId)
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
                    // If coordinates are saved → trigger delivery calculation
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Redirect to catalog if cart is empty (but not while placing an order)
    useEffect(() => {
        if (mounted && totalItems === 0 && !placing) {
            router.push("/cliente/chat");
        }
    }, [mounted, totalItems, placing, router]);

    // Recalculate distance whenever customer or store coords change
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

    // Toast auto-dismiss
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    // ── CEP logic ──────────────────────────────────────────────────────────────

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
                setCepError("CEP não encontrado. Verifique e tente novamente.");
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

            // Geocode via Nominatim for distance calculation
            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/search?postalcode=${digits}&country=BR&format=json`
            );
            const geoData = await geoRes.json();

            if (fetchedCepRef.current !== digits) return;

            if (geoData[0]) {
                const coords = sanitizeExternalCoords(geoData[0].lat, geoData[0].lon);
                if (coords) {
                    setCustomerCoords(coords);

                    // Persist address + coordinates to client record immediately
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
                setCepError("CEP não encontrado. Verifique e tente novamente.");
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

    // ── Order placement ────────────────────────────────────────────────────────

    async function handlePlaceOrder() {
        if (!session || items.length === 0) return;
        setPlacing(true);

        // Update number + complement on client record
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

    // ── Derived ────────────────────────────────────────────────────────────────

    const orderTotal = totalPrice + deliveryFee;

    const canPlaceOrder =
        items.length > 0 &&
        cepStatus === "ok" &&
        addrForm.number.trim() !== "" &&
        deliveryStatus !== "too_far";

    const showSavedCard = addrLoadState === "found" && !editingAddress;
    const showCepInput  = addrLoadState === "none"  || editingAddress;

    // ── Loading state ──────────────────────────────────────────────────────────

    if (!mounted || !session || addrLoadState === "loading") {
        return (
            <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#F97316]" />
            </div>
        );
    }

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

            <ClientHeader />

            <div className="max-w-[1280px] mx-auto px-4 py-6">

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-sm mb-6">
                    <Link href="/cliente/chat" className="text-[#6B7280] hover:text-[#111827]">Carrinho</Link>
                    <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                    <span className="text-[#F97316] font-semibold">Checkout</span>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">

                    {/* ── Left column ──────────────────────────────────────── */}
                    <div className="flex-1 space-y-4">

                        {/* Cart items */}
                        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm">
                            <h2 className="font-bold text-[#111827] flex items-center gap-2 mb-4">
                                <ShoppingCart className="w-5 h-5 text-[#F97316]" />
                                Itens no Carrinho
                            </h2>

                            {items.length === 0 ? (
                                <p className="text-sm text-[#6B7280] text-center py-6">Carrinho vazio.</p>
                            ) : (
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div key={item.product_id} className="flex items-center gap-3 py-3 border-b border-[#E5E7EB] last:border-0">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm text-[#111827]">{item.name}</p>
                                                <p className="text-xs text-[#6B7280]">{item.unit}</p>
                                            </div>
                                            <div className="flex items-center border border-[#E5E7EB] rounded-lg overflow-hidden shrink-0">
                                                <button
                                                    onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                                                    className="w-7 h-7 flex items-center justify-center text-[#6B7280] hover:bg-gray-100 transition-colors"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="w-8 text-center text-sm font-semibold text-[#111827]">{item.quantity}</span>
                                                <button
                                                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                                                    className="w-7 h-7 flex items-center justify-center text-[#6B7280] hover:bg-gray-100 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <p className="text-sm font-bold text-[#F97316] w-20 text-right shrink-0">
                                                {formatCurrency(item.quantity * item.price)}
                                            </p>
                                            <button
                                                onClick={() => removeItem(item.product_id)}
                                                className="p-1.5 text-[#6B7280] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Delivery address */}
                        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm">
                            <h2 className="font-bold text-[#111827] flex items-center gap-2 mb-4">
                                <MapPin className="w-5 h-5 text-[#F97316]" />
                                Endereço de Entrega
                            </h2>

                            {/* ── Saved address card ── */}
                            {showSavedCard && (
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                                        <div className="flex items-start gap-2">
                                            <MapPin className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                            <p className="text-sm text-green-700 leading-relaxed">
                                                📍 {addrForm.street}{addrForm.number ? `, ${addrForm.number}` : ""}{" "}
                                                — {addrForm.neighborhood}, {addrForm.city} — {addrForm.state},{" "}
                                                {addrForm.cep}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleEditAddress}
                                            className="flex items-center gap-1 text-xs text-[#F97316] hover:underline shrink-0 font-medium"
                                        >
                                            <Pencil className="w-3 h-3" />
                                            Alterar endereço
                                        </button>
                                    </div>

                                    {/* Number field — only if missing from saved address */}
                                    {!addrForm.number.trim() && (
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-[#374151]">
                                                Número <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="123"
                                                value={addrForm.number}
                                                onChange={(e) => setAddrForm((prev) => ({ ...prev, number: e.target.value }))}
                                                maxLength={LIMITS.address_number}
                                                className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-colors"
                                            />
                                        </div>
                                    )}

                                    {/* Delivery status for saved address */}
                                    {deliveryStatus === "ok" && distanceKm !== null && (
                                        <p className="text-xs text-green-600 font-medium">
                                            ✅ Entrega disponível (~{distanceKm.toFixed(1)} km da loja)
                                        </p>
                                    )}
                                    {deliveryStatus === "too_far" && distanceKm !== null && storeCoords && (
                                        <p className="text-xs text-red-500 font-medium">
                                            ❌ Fora da área de entrega. Cobrimos até {storeCoords.radius} km.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── CEP input flow ── */}
                            {showCepInput && (
                                <>
                                    {/* CEP field — always visible */}
                                    <div className="space-y-1 mb-3">
                                        <label className="text-xs font-semibold text-[#374151]">CEP</label>
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
                                                    "w-full h-10 px-3 pr-9 rounded-lg border text-sm text-[#111827] outline-none focus:ring-2 focus:ring-[#F97316]/20 transition-colors",
                                                    cepStatus === "error" && "border-red-400 bg-red-50 focus:border-red-400",
                                                    cepStatus === "ok"    && "border-green-400 focus:border-green-400",
                                                    cepStatus !== "error" && cepStatus !== "ok" && "border-[#E5E7EB] focus:border-[#F97316]"
                                                )}
                                            />
                                            {cepStatus === "loading" && (
                                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#F97316] animate-spin" />
                                            )}
                                            {cepStatus === "ok" && (
                                                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                                            )}
                                        </div>

                                        {/* CEP inline error */}
                                        {cepError && (
                                            <p className="flex items-center gap-1 text-xs text-red-500">
                                                <AlertCircle className="w-3 h-3 shrink-0" />
                                                {cepError}
                                            </p>
                                        )}

                                        {/* Delivery coverage feedback */}
                                        {deliveryStatus === "ok" && distanceKm !== null && (
                                            <p className="text-xs text-green-600 font-medium">
                                                ✅ Entrega disponível (~{distanceKm.toFixed(1)} km da loja)
                                            </p>
                                        )}
                                        {deliveryStatus === "too_far" && distanceKm !== null && storeCoords && (
                                            <p className="text-xs text-red-500 font-medium">
                                                ❌ Fora da área de entrega. Cobrimos até {storeCoords.radius} km.
                                            </p>
                                        )}
                                    </div>

                                    {/* Address fields — shown after CEP is ok */}
                                    {cepStatus === "ok" && (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                                                {/* Street — read-only */}
                                                <div className="sm:col-span-2 space-y-1">
                                                    <label className="text-xs font-semibold text-[#374151]">Rua / Logradouro</label>
                                                    <input
                                                        readOnly
                                                        value={addrForm.street}
                                                        className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>

                                                {/* Neighborhood — read-only */}
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-[#374151]">Bairro</label>
                                                    <input
                                                        readOnly
                                                        value={addrForm.neighborhood}
                                                        className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>

                                                {/* City — read-only */}
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-[#374151]">Cidade</label>
                                                    <input
                                                        readOnly
                                                        value={addrForm.city}
                                                        className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>

                                                {/* State — read-only */}
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-[#374151]">Estado</label>
                                                    <input
                                                        readOnly
                                                        value={addrForm.state}
                                                        className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>

                                                {/* Number — required, editable */}
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-[#374151]">
                                                        Número <span className="text-red-400">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="123"
                                                        value={addrForm.number}
                                                        onChange={(e) => setAddrForm((prev) => ({ ...prev, number: e.target.value }))}
                                                        maxLength={LIMITS.address_number}
                                                        className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-colors"
                                                    />
                                                </div>

                                                {/* Complement — optional, editable */}
                                                <div className="sm:col-span-2 space-y-1">
                                                    <label className="text-xs font-semibold text-[#374151]">
                                                        Complemento <span className="text-[#9CA3AF] font-normal">(opcional)</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="Apto 42, Bloco B"
                                                        value={addrForm.complement}
                                                        onChange={(e) => setAddrForm((prev) => ({ ...prev, complement: e.target.value }))}
                                                        maxLength={LIMITS.complement}
                                                        className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#111827] outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-colors"
                                                    />
                                                </div>
                                            </div>

                                            {/* Confirmed address summary */}
                                            {addrForm.number.trim() && (
                                                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                                                    <MapPin className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                                    <p className="text-xs text-green-700 leading-relaxed">
                                                        {addrForm.street}, {addrForm.number}
                                                        {addrForm.complement ? `, ${addrForm.complement}` : ""}{" "}
                                                        — {addrForm.neighborhood}, {addrForm.city}/{addrForm.state}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Right sidebar ─────────────────────────────────────── */}
                    <div className="w-full lg:w-80 shrink-0 space-y-4">

                        {/* Order summary */}
                        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm sticky top-20">
                            <h2 className="font-bold text-[#111827] mb-4">Resumo do Pedido</h2>

                            <div className="space-y-2 text-sm mb-4">
                                <div className="flex justify-between text-[#6B7280]">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(totalPrice)}</span>
                                </div>
                                <div className="flex justify-between text-[#6B7280]">
                                    <span>Taxa de Entrega</span>
                                    {deliveryStatus === "ok" ? (
                                        <span>
                                            {formatCurrency(deliveryFee)}
                                            {distanceKm !== null && (
                                                <span className="text-[10px] text-[#9CA3AF] ml-1">(~{distanceKm.toFixed(1)} km)</span>
                                            )}
                                        </span>
                                    ) : deliveryStatus === "too_far" ? (
                                        <span className="text-red-500 font-medium text-xs">Fora da área</span>
                                    ) : (
                                        <span className="text-[#F97316] font-medium">A calcular</span>
                                    )}
                                </div>
                                <div className="border-t border-[#E5E7EB] pt-2 flex justify-between font-bold text-base">
                                    <span className="text-[#111827]">Total</span>
                                    <span className="text-[#F97316] text-lg">{formatCurrency(orderTotal)}</span>
                                </div>
                            </div>

                            {/* Payment method */}
                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">FORMA DE PAGAMENTO</p>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                {PAYMENT_OPTIONS.map(({ id, label, Icon }) => (
                                    <button
                                        key={id}
                                        onClick={() => setPayment(id)}
                                        className={cn(
                                            "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm font-medium",
                                            payment === id
                                                ? "border-[#F97316] bg-[#F97316]/5 text-[#F97316]"
                                                : "border-[#E5E7EB] text-[#6B7280] hover:border-[#F97316]/40"
                                        )}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* PIX QR placeholder */}
                            {payment === "pix" && (
                                <div className="border-2 border-dashed border-[#E5E7EB] rounded-xl p-4 flex flex-col items-center gap-2 mb-4">
                                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <QrCode className="w-10 h-10 text-gray-300" />
                                    </div>
                                    <p className="text-xs text-[#6B7280] text-center">
                                        O QR Code será gerado após clicar no botão de pedido.
                                    </p>
                                </div>
                            )}

                            {/* Place order button */}
                            <button
                                onClick={handlePlaceOrder}
                                disabled={placing || !canPlaceOrder}
                                className="w-full h-11 bg-[#F97316] text-white rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F97316]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Rocket className="w-4 h-4" />
                                {placing ? "Processando..." : "Fazer Pedido"}
                            </button>

                            {/* Helper hint when button is disabled */}
                            {!canPlaceOrder && !placing && (
                                <p className="text-[11px] text-[#9CA3AF] text-center mt-2">
                                    {cepStatus !== "ok"
                                        ? "Preencha o CEP para continuar."
                                        : addrForm.number.trim() === ""
                                            ? "Informe o número do endereço."
                                            : deliveryStatus === "too_far"
                                                ? "Entrega indisponível para sua região."
                                                : ""}
                                </p>
                            )}

                            <p className="text-[11px] text-[#6B7280] text-center mt-2">
                                Ao finalizar seu pedido você concorda com nossos{" "}
                                <span className="text-[#F97316] cursor-pointer hover:underline">Termos de Serviço</span>.
                            </p>
                        </div>

                        {/* Coupon */}
                        <div className="bg-[#F97316] rounded-xl p-4">
                            <div className="flex items-center gap-2 text-white mb-2">
                                <span className="text-lg">🎁</span>
                                <p className="font-bold text-sm">Tem um cupom?</p>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={coupon}
                                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                                    placeholder="CÓDIGO"
                                    className="flex-1 h-8 px-3 rounded-lg text-xs font-semibold text-[#111827] outline-none"
                                />
                                <button className="bg-white text-[#F97316] px-3 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors">
                                    APLICAR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
