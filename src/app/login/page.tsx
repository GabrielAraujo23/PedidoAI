"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Phone, User, MapPin, Loader2, ArrowLeft, AlertCircle, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { calculateDistance } from "@/lib/haversine";
import type { Client } from "@/lib/types";
import {
    validateName, validatePhone, sanitizeExternalCoords, sanitizeExternalText, LIMITS,
} from "@/lib/validators";
import { logEvent } from "@/lib/logger";

type Step = "phone" | "returning" | "new_client";

function getAdminIdFromUrl(): string {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("admin") ?? "";
}

interface AddrFields {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
}

const EMPTY_ADDR: AddrFields = { street: "", neighborhood: "", city: "", state: "" };

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

function maskPhone(v: string): string {
    let d = v.replace(/\D/g, "");
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ─── Refined Input — flat with bottom-line focus ──────────────────────── */
interface FieldProps {
    icon?: React.ElementType;
    label: string;
    optional?: boolean;
    error?: string;
    children: React.ReactNode;
}
function Field({ icon: Icon, label, optional, error, children }: FieldProps) {
    return (
        <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-stone-500">
                {Icon && <Icon className="w-3 h-3" />}
                {label}
                {optional && <span className="text-stone-400 text-[10px] normal-case tracking-normal font-normal">(opcional)</span>}
            </label>
            {children}
            {error && (
                <p className="flex items-start gap-1 text-xs text-red-600 pt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </p>
            )}
        </div>
    );
}

const inputClass =
    "w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-[15px] text-stone-900 placeholder:text-stone-400 outline-none transition-all duration-200 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 disabled:bg-stone-50 disabled:text-stone-500";

export default function LoginPage() {
    const [step, setStep] = useState<Step>("phone");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [foundClient, setFoundClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const [adminId, setAdminId] = useState("");
    useEffect(() => { setAdminId(getAdminIdFromUrl()); }, []);
    const foundAdminIdRef = useRef("");

    const [cep, setCep] = useState("");
    const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError] = useState("");
    const [addrFields, setAddrFields] = useState<AddrFields>(EMPTY_ADDR);
    const [numberField, setNumberField] = useState("");
    const fetchedCepRef = useRef("");

    const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number; radius: number; rate: number } | null>(null);
    const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [deliveryInfo, setDeliveryInfo] = useState<{ distanceKm: number; fee: number } | null>(null);

    useEffect(() => {
        if (!adminId) return;
        supabase
            .from("store_settings")
            .select("latitude, longitude, delivery_radius_km, delivery_rate_per_km")
            .eq("admin_id", adminId)
            .single()
            .then(({ data }) => {
                const lat = data?.latitude ? parseFloat(data.latitude) : 0;
                const lng = data?.longitude ? parseFloat(data.longitude) : 0;
                if (lat && lng) {
                    setStoreCoords({
                        lat, lng,
                        radius: parseFloat(data?.delivery_radius_km ?? "20") || 20,
                        rate: parseFloat(data?.delivery_rate_per_km ?? "3") || 3,
                    });
                }
            });
    }, [adminId]);

    useEffect(() => {
        if (!customerCoords || !storeCoords) return;
        const dist = Math.round(
            calculateDistance(storeCoords.lat, storeCoords.lng, customerCoords.lat, customerCoords.lng) * 10
        ) / 10;
        const chargedKm = Math.max(0, dist - storeCoords.radius);
        const fee = Math.round(chargedKm * storeCoords.rate * 100) / 100;
        setDeliveryInfo({ distanceKm: dist, fee });
    }, [customerCoords, storeCoords]);

    async function fetchCep(digits: string) {
        setCepStatus("loading");
        setCepError("");
        setCustomerCoords(null);
        setDeliveryInfo(null);

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8_000);

        try {
            const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ac.signal });
            const data = await res.json();
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

            const geoAc = new AbortController();
            const geoTimer = setTimeout(() => geoAc.abort(), 5_000);
            try {
                const geoRes = await fetch(
                    `https://nominatim.openstreetmap.org/search?postalcode=${digits}&country=BR&format=json`,
                    { signal: geoAc.signal, headers: { "User-Agent": "PedidoAI/1.0" } }
                );
                const geoData = await geoRes.json();
                if (fetchedCepRef.current === digits && geoData[0]) {
                    const coords = sanitizeExternalCoords(geoData[0].lat, geoData[0].lon);
                    if (coords) setCustomerCoords(coords);
                }
            } catch { /* non-fatal */ }
            finally { clearTimeout(geoTimer); }
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
        setCustomerCoords(null);
        setDeliveryInfo(null);

        const digits = masked.replace(/\D/g, "");
        if (digits.length === 8) {
            fetchedCepRef.current = digits;
            fetchCep(digits);
        } else {
            fetchedCepRef.current = "";
        }
    }

    function handleCepBlur() {
        const digits = cep.replace(/\D/g, "");
        if (digits.length === 8 && digits !== fetchedCepRef.current) {
            fetchedCepRef.current = digits;
            fetchCep(digits);
        }
    }

    async function handlePhoneContinue(e: React.FormEvent) {
        e.preventDefault();
        const phoneVal = validatePhone(phone, true);
        if (!phoneVal.ok) { setError(phoneVal.error); return; }
        setLoading(true);
        setError("");

        let query = supabase.from("clients").select("*").eq("phone", phone.trim());
        if (adminId) query = query.eq("admin_id", adminId);
        const { data: clients } = await query.limit(1);

        setLoading(false);

        if (clients && clients.length > 0) {
            const found = clients[0] as Client & { admin_id?: string };
            foundAdminIdRef.current = found.admin_id ?? "";
            logEvent({ event_type: "client_login", actor_type: "client", actor_id: found.id });
            setFoundClient(found);
            setStep("returning");
        } else {
            setStep("new_client");
        }
    }

    async function saveSessionAndRedirect(client: Client) {
        const effectiveAdminId = adminId || foundAdminIdRef.current || "";
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/client", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "login", phone: client.phone, adminId: effectiveAdminId }),
            });
            if (!res.ok) throw new Error("auth failed");
            router.push("/cliente/catalogo");
        } catch {
            setError("Erro ao entrar. Tente novamente.");
            setLoading(false);
        }
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        const nameVal = validateName(name);
        if (!nameVal.ok) { setError(nameVal.error); return; }
        setLoading(true);
        setError("");

        const fullAddress = cepStatus === "ok" && addrFields.street
            ? [addrFields.street, numberField.trim(), addrFields.neighborhood, `${addrFields.city}/${addrFields.state}`]
                .filter(Boolean).join(", ")
            : "";

        try {
            const res = await fetch("/api/auth/client", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "register",
                    phone: phone.trim(),
                    name: name.trim(),
                    adminId: adminId || "",
                    address: fullAddress || null,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({})) as { error?: string };
                setError(data.error || "Erro ao cadastrar. Tente novamente.");
                setLoading(false);
                return;
            }
            logEvent({ event_type: "client_registered", actor_type: "client" });
            router.push("/cliente/catalogo");
        } catch {
            setError("Erro ao cadastrar. Tente novamente.");
            setLoading(false);
        }
    }

    function resetNewClientStep() {
        setStep("phone");
        setName("");
        setCep("");
        setCepStatus("idle");
        setCepError("");
        setAddrFields(EMPTY_ADDR);
        setNumberField("");
        setCustomerCoords(null);
        setDeliveryInfo(null);
        setError("");
        fetchedCepRef.current = "";
    }

    return (
        <div
            className="min-h-screen relative overflow-hidden bg-warm"
            style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            {/* Soft warm blooms — kept (no SVG, GPU-friendly) */}
            <div aria-hidden className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full opacity-50"
                     style={{ background: "radial-gradient(circle at 30% 30%, #F0BC8E 0%, transparent 65%)" }} />
                <div className="absolute -bottom-32 -right-20 w-[420px] h-[420px] rounded-full opacity-40"
                     style={{ background: "radial-gradient(circle at 50% 50%, #D89B7A 0%, transparent 60%)" }} />
            </div>

            {/* Top brand bar */}
            <header className="relative z-10 px-6 sm:px-10 pt-8 flex items-center justify-between">
                <div className="flex items-center">
                    <Image src="/Logo_PedidoAi.png" alt="PedidoAI" width={280} height={153} className="w-[280px] h-auto object-contain" />
                </div>
                <span className="text-[11px] uppercase tracking-[0.22em] text-stone-500 hidden sm:block">
                    Loja Aberta
                </span>
            </header>

            {/* Main */}
            <main className="relative z-10 flex items-center justify-center px-6 py-10 sm:py-16">
                <div className="w-full max-w-[440px]">

                    {/* Step indicator dots */}
                    <div className="flex items-center justify-center gap-1.5 mb-8">
                        {(["phone", step === "returning" ? "returning" : "new_client"] as const).map((s, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1 rounded-full transition-all duration-500",
                                    step === s || (i === 0)
                                        ? "w-6 bg-stone-900"
                                        : "w-1.5 bg-stone-300",
                                    i === 0 && step !== "phone" && "bg-stone-400 w-3",
                                )}
                            />
                        ))}
                    </div>

                    {/* ── STEP: phone ── */}
                    {step === "phone" && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <div className="text-center mb-8">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Bem-vindo</p>
                                <h1
                                    className="text-[44px] sm:text-[52px] leading-[0.95] tracking-tight text-stone-900"
                                    style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                                >
                                    Faça seu pedido <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>agora.</em>
                                </h1>
                                <p className="text-[14px] text-stone-600 mt-4 max-w-[320px] mx-auto leading-relaxed">
                                    Digite seu telefone para começar. Tudo rapidinho, sem cadastro chato.
                                </p>
                            </div>

                            <form onSubmit={handlePhoneContinue} className="space-y-5">
                                <Field icon={Phone} label="Telefone">
                                    <input
                                        type="tel"
                                        placeholder="(11) 99999-9999"
                                        value={phone}
                                        onChange={(e) => setPhone(maskPhone(e.target.value))}
                                        maxLength={15}
                                        autoComplete="tel"
                                        autoFocus
                                        disabled={loading}
                                        className={cn(inputClass, "text-[16px] font-medium tracking-wide")}
                                    />
                                </Field>

                                {error && (
                                    <p className="flex items-start gap-1.5 text-xs text-red-600">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !phone.trim()}
                                    className="group w-full h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all duration-200 hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            Continuar
                                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <p className="text-center text-[11px] text-stone-500 mt-8 leading-relaxed">
                                Ao continuar, você concorda com receber pedidos via WhatsApp.
                            </p>
                        </section>
                    )}

                    {/* ── STEP: returning ── */}
                    {step === "returning" && foundClient && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500 text-center">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 ring-8 ring-emerald-50 mb-6">
                                <Check className="w-7 h-7 text-emerald-700" strokeWidth={2.5} />
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Que bom te ver</p>
                            <h1
                                className="text-[40px] sm:text-[48px] leading-[1.0] tracking-tight text-stone-900"
                                style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                            >
                                Olá,{" "}
                                <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>
                                    {foundClient.name.split(" ")[0]}
                                </em>
                            </h1>
                            <p className="text-[14px] text-stone-600 mt-4 max-w-[320px] mx-auto leading-relaxed">
                                Pronto pra montar mais um pedido?
                            </p>

                            <div className="space-y-3 mt-8">
                                <button
                                    onClick={() => saveSessionAndRedirect(foundClient)}
                                    disabled={loading}
                                    className="group w-full h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all duration-200 hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40 shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                        <>Entrar e pedir <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>
                                    )}
                                </button>
                                <button
                                    onClick={() => { setStep("phone"); setFoundClient(null); setPhone(""); }}
                                    className="w-full h-10 text-[13px] text-stone-500 hover:text-stone-900 inline-flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Não sou eu
                                </button>
                            </div>
                        </section>
                    )}

                    {/* ── STEP: new_client ── */}
                    {step === "new_client" && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <div className="text-center mb-8">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Primeiro acesso</p>
                                <h1
                                    className="text-[36px] sm:text-[42px] leading-[1.0] tracking-tight text-stone-900"
                                    style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                                >
                                    Vamos te <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>conhecer</em>.
                                </h1>
                                <p className="text-[14px] text-stone-600 mt-4 max-w-[340px] mx-auto leading-relaxed">
                                    Só uns dados rápidos para conseguirmos entregar direitinho na sua casa.
                                </p>
                            </div>

                            <form onSubmit={handleRegister} className="space-y-5">
                                <Field icon={Phone} label="Telefone">
                                    <input
                                        value={phone}
                                        disabled
                                        readOnly
                                        className={cn(inputClass, "bg-stone-50 text-stone-500 font-medium")}
                                    />
                                </Field>

                                <Field icon={User} label="Nome completo">
                                    <input
                                        type="text"
                                        placeholder="Como posso te chamar?"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        autoComplete="name"
                                        autoFocus
                                        disabled={loading}
                                        maxLength={LIMITS.name}
                                        className={inputClass}
                                    />
                                </Field>

                                <Field icon={MapPin} label="CEP" optional error={cepError}>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="00000-000"
                                            maxLength={9}
                                            value={cep}
                                            onChange={(e) => handleCepChange(e.target.value)}
                                            onBlur={handleCepBlur}
                                            disabled={loading}
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
                                </Field>

                                {/* Address — appears smoothly when CEP found */}
                                {cepStatus === "ok" && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 pt-1">
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="col-span-3">
                                                <label className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">Endereço</label>
                                                <p className="text-[14px] text-stone-700 leading-snug mt-0.5">
                                                    {addrFields.street}, <span className="text-stone-500">{addrFields.neighborhood}</span>
                                                </p>
                                                <p className="text-[12px] text-stone-500">{addrFields.city}/{addrFields.state}</p>
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-[10px] uppercase tracking-[0.18em] font-semibold text-stone-400">Número</label>
                                                <input
                                                    type="text"
                                                    placeholder="123"
                                                    value={numberField}
                                                    onChange={(e) => setNumberField(e.target.value)}
                                                    disabled={loading}
                                                    maxLength={LIMITS.address_number}
                                                    className={cn(inputClass, "h-10 mt-1")}
                                                />
                                            </div>
                                        </div>

                                        {deliveryInfo && (
                                            <div className={cn(
                                                "flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border",
                                                deliveryInfo.fee === 0
                                                    ? "bg-emerald-50/80 border-emerald-200/60"
                                                    : "bg-amber-50/80 border-amber-200/60"
                                            )}>
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                                                    deliveryInfo.fee === 0 ? "bg-emerald-500" : "bg-amber-500"
                                                )} />
                                                <div className="text-[12px] leading-relaxed">
                                                    {deliveryInfo.fee === 0 ? (
                                                        <>
                                                            <span className="font-semibold text-emerald-800">Entrega grátis</span>
                                                            <span className="text-emerald-700"> • {deliveryInfo.distanceKm.toFixed(1)} km da loja</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-semibold text-amber-800">Frete: {formatCurrency(deliveryInfo.fee)}</span>
                                                            <span className="text-amber-700"> • {deliveryInfo.distanceKm.toFixed(1)} km da loja</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {error && (
                                    <p className="flex items-start gap-1.5 text-xs text-red-600">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </p>
                                )}

                                <div className="space-y-3 pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading || !name.trim()}
                                        className="group w-full h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all duration-200 hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                            <>Cadastrar e entrar <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetNewClientStep}
                                        className="w-full h-10 text-[13px] text-stone-500 hover:text-stone-900 inline-flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}
                </div>
            </main>

            {/* Footer credit */}
            <footer className="relative z-10 px-6 pb-6 text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-stone-400">
                    PedidoAI · feito com ♡ no Brasil
                </p>
            </footer>
        </div>
    );
}
