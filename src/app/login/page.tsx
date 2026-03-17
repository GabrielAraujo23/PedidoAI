"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Phone, User, MapPin, Loader2, ArrowLeft, MessageSquare, CheckCircle, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { calculateDistance } from "@/lib/haversine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Client } from "@/lib/types";
import type { ClientSession } from "@/lib/auth-context";

type Step = "phone" | "returning" | "new_client";

interface AddrFields {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
}

const EMPTY_ADDR: AddrFields = { street: "", neighborhood: "", city: "", state: "" };

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function LoginPage() {
    const [step, setStep] = useState<Step>("phone");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [foundClient, setFoundClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    // CEP / address state (new_client step)
    const [cep, setCep] = useState("");
    const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError] = useState("");
    const [addrFields, setAddrFields] = useState<AddrFields>(EMPTY_ADDR);
    const [numberField, setNumberField] = useState("");
    const fetchedCepRef = useRef("");

    // Delivery estimate
    const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number; radius: number; rate: number } | null>(null);
    const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [deliveryInfo, setDeliveryInfo] = useState<{ distanceKm: number; fee: number } | null>(null);

    // Load store coords once on mount
    useEffect(() => {
        supabase
            .from("store_settings")
            .select("latitude, longitude, delivery_radius_km, delivery_rate_per_km")
            .limit(1)
            .single()
            .then(({ data }) => {
                const lat = data?.latitude ? parseFloat(data.latitude) : 0;
                const lng = data?.longitude ? parseFloat(data.longitude) : 0;
                if (lat && lng) {
                    setStoreCoords({
                        lat,
                        lng,
                        radius: parseFloat(data?.delivery_radius_km ?? "20") || 20,
                        rate: parseFloat(data?.delivery_rate_per_km ?? "3") || 3,
                    });
                }
            });
    }, []);

    // Recalculate delivery estimate whenever customer or store coords arrive
    useEffect(() => {
        if (!customerCoords || !storeCoords) return;
        const dist = Math.round(
            calculateDistance(storeCoords.lat, storeCoords.lng, customerCoords.lat, customerCoords.lng) * 10
        ) / 10;
        const chargedKm = Math.max(0, dist - storeCoords.radius);
        const fee = Math.round(chargedKm * storeCoords.rate * 100) / 100;
        setDeliveryInfo({ distanceKm: dist, fee });
    }, [customerCoords, storeCoords]);

    // ── CEP helpers ─────────────────────────────────────────────────────────────

    async function fetchCep(digits: string) {
        setCepStatus("loading");
        setCepError("");
        setCustomerCoords(null);
        setDeliveryInfo(null);

        try {
            const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
            const data = await res.json();

            if (fetchedCepRef.current !== digits) return;

            if (data.erro) {
                setCepStatus("error");
                setCepError("CEP não encontrado. Verifique e tente novamente.");
                return;
            }

            setAddrFields({
                street:       data.logradouro ?? "",
                neighborhood: data.bairro     ?? "",
                city:         data.localidade ?? "",
                state:        data.uf         ?? "",
            });
            setCepStatus("ok");

            // Geocode for distance estimate
            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/search?postalcode=${digits}&country=BR&format=json`
            );
            const geoData = await geoRes.json();

            if (fetchedCepRef.current !== digits) return;
            if (geoData[0]) {
                setCustomerCoords({ lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) });
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

    // ── Auth handlers ────────────────────────────────────────────────────────────

    async function handlePhoneContinue(e: React.FormEvent) {
        e.preventDefault();
        if (!phone.trim()) return;
        setLoading(true);
        setError("");

        const { data: clients } = await supabase
            .from("clients")
            .select("*")
            .eq("phone", phone.trim())
            .limit(1);

        setLoading(false);

        if (clients && clients.length > 0) {
            setFoundClient(clients[0] as Client);
            setStep("returning");
        } else {
            setStep("new_client");
        }
    }

    function saveSessionAndRedirect(client: Client) {
        const session: ClientSession = {
            clientId: client.id,
            name: client.name,
            phone: client.phone ?? "",
        };
        localStorage.setItem("pedidoai_client_session", JSON.stringify(session));
        router.push("/cliente/chat");
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        setError("");

        const { data: allClients } = await supabase.from("clients").select("id");
        const nums = (allClients || []).map((c: { id: string }) => parseInt(c.id.replace("CL", "")) || 0);
        const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
        const clientId = `CL${String(maxNum + 1).padStart(3, "0")}`;

        const fullAddress = cepStatus === "ok" && addrFields.street
            ? [addrFields.street, numberField.trim(), addrFields.neighborhood, `${addrFields.city}/${addrFields.state}`]
                .filter(Boolean).join(", ")
            : "";

        const newClient: Client = {
            id: clientId,
            name: name.trim(),
            phone: phone.trim(),
            address: fullAddress || null,
        };

        const { error } = await supabase.from("clients").insert(newClient);

        if (error) {
            setError("Erro ao cadastrar. Tente novamente.");
            setLoading(false);
            return;
        }

        saveSessionAndRedirect(newClient);
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
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-100">
            <div className="w-full max-w-md space-y-8">
                {/* Logo */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-primary rounded-3xl flex items-center justify-center shadow-xl shadow-primary/30">
                        <MessageSquare className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-secondary">PedidoAI</h1>
                        <p className="text-muted-foreground text-sm">Faça seu pedido agora</p>
                    </div>
                </div>

                <Card className="glass border-none shadow-2xl">
                    {/* Step 1: Phone entry */}
                    {step === "phone" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl text-secondary">Bem-vindo!</CardTitle>
                                <CardDescription>
                                    Digite seu número de telefone para continuar.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handlePhoneContinue} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Telefone</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="phone"
                                                type="tel"
                                                placeholder="(11) 99999-9999"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="pl-10 glass border-none h-11"
                                                autoComplete="tel"
                                                autoFocus
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                        disabled={loading || !phone.trim()}
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continuar"}
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}

                    {/* Step 2a: Returning client */}
                    {step === "returning" && foundClient && (
                        <>
                            <CardHeader className="pb-4 items-center text-center">
                                <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-2">
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                </div>
                                <CardTitle className="text-xl text-secondary">
                                    Olá, {foundClient.name}!
                                </CardTitle>
                                <CardDescription>
                                    Seja bem-vindo de volta. Pronto para fazer um pedido?
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button
                                    className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    onClick={() => saveSessionAndRedirect(foundClient)}
                                >
                                    Entrar e Pedir
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full gap-2 text-muted-foreground"
                                    onClick={() => {
                                        setStep("phone");
                                        setFoundClient(null);
                                        setPhone("");
                                    }}
                                >
                                    <ArrowLeft className="w-4 h-4" /> Não sou eu
                                </Button>
                            </CardContent>
                        </>
                    )}

                    {/* Step 2b: New client registration */}
                    {step === "new_client" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl text-secondary">Primeiro acesso</CardTitle>
                                <CardDescription>
                                    Número não encontrado. Complete seu cadastro para continuar.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleRegister} className="space-y-4">
                                    {/* Phone — read-only, pre-filled */}
                                    <div className="space-y-2">
                                        <Label>Telefone</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                value={phone}
                                                className="pl-10 glass border-none h-11 text-muted-foreground"
                                                disabled
                                                readOnly
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="name">Nome completo *</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="name"
                                                type="text"
                                                placeholder="Seu nome completo"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="pl-10 glass border-none h-11"
                                                autoComplete="name"
                                                autoFocus
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>

                                    {/* CEP field */}
                                    <div className="space-y-1">
                                        <Label htmlFor="cep">
                                            CEP <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                                        </Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <input
                                                id="cep"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="00000-000"
                                                maxLength={9}
                                                value={cep}
                                                onChange={(e) => handleCepChange(e.target.value)}
                                                onBlur={handleCepBlur}
                                                disabled={loading}
                                                className={cn(
                                                    "w-full h-11 pl-10 pr-9 rounded-lg border text-sm text-[#111827] outline-none focus:ring-2 transition-colors bg-white/60",
                                                    cepStatus === "error" && "border-red-400 bg-red-50 focus:border-red-400",
                                                    cepStatus === "ok"    && "border-green-400 focus:border-green-400",
                                                    cepStatus !== "error" && cepStatus !== "ok" && "border-input focus:border-primary focus:ring-primary/20"
                                                )}
                                            />
                                            {cepStatus === "loading" && (
                                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                                            )}
                                            {cepStatus === "ok" && (
                                                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                                            )}
                                        </div>
                                        {cepError && (
                                            <p className="flex items-center gap-1 text-xs text-red-500">
                                                <AlertCircle className="w-3 h-3 shrink-0" />
                                                {cepError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Auto-filled address fields — shown after CEP ok */}
                                    {cepStatus === "ok" && (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="col-span-2 space-y-1">
                                                    <Label className="text-xs">Rua / Logradouro</Label>
                                                    <input
                                                        readOnly
                                                        value={addrFields.street}
                                                        className="w-full h-9 px-3 rounded-lg border border-input text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Bairro</Label>
                                                    <input
                                                        readOnly
                                                        value={addrFields.neighborhood}
                                                        className="w-full h-9 px-3 rounded-lg border border-input text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Cidade/UF</Label>
                                                    <input
                                                        readOnly
                                                        value={`${addrFields.city}/${addrFields.state}`}
                                                        className="w-full h-9 px-3 rounded-lg border border-input text-sm text-[#111827] bg-[#F9FAFB] outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Número</Label>
                                                    <input
                                                        type="text"
                                                        placeholder="123"
                                                        value={numberField}
                                                        onChange={(e) => setNumberField(e.target.value)}
                                                        disabled={loading}
                                                        className="w-full h-9 px-3 rounded-lg border border-input text-sm text-[#111827] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                                                    />
                                                </div>
                                            </div>

                                            {/* Delivery estimate */}
                                            {deliveryInfo && (
                                                deliveryInfo.fee === 0
                                                    ? <p className="text-xs text-green-600 font-medium bg-green-50 px-3 py-2 rounded-lg">
                                                        ✅ Entrega grátis para sua região! (~{deliveryInfo.distanceKm.toFixed(1)} km da loja)
                                                      </p>
                                                    : <p className="text-xs text-orange-600 font-medium bg-orange-50 px-3 py-2 rounded-lg">
                                                        🛵 Frete estimado: {formatCurrency(deliveryInfo.fee)} (~{deliveryInfo.distanceKm.toFixed(1)} km da loja)
                                                      </p>
                                            )}
                                        </div>
                                    )}

                                    {error && (
                                        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                                            {error}
                                        </p>
                                    )}

                                    <Button
                                        type="submit"
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                        disabled={loading || !name.trim()}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            "Cadastrar e Entrar"
                                        )}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full gap-2 text-muted-foreground"
                                        onClick={resetNewClientStep}
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Voltar
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
