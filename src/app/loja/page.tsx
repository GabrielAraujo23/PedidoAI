"use client";

import { useState, useEffect, useRef } from "react";
import {
    Store, MapPin, Phone, FileText, Truck, Clock,
    Save, Upload, Package, Plus, X, Loader2, Check, AlertCircle, Link2, Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
    validateStoreName, validatePhone, validateDeliveryRate, validateDeliveryRadius,
    validateLatitude, validateLongitude, validateCategory, validateBusinessHours,
    sanitizeExternalCoords, sanitizeExternalText, truncate, LIMITS,
} from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";

// ── Input masks ────────────────────────────────────────────────────────────

function maskCnpj(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskPhone(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskStateReg(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 12);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}.${d.slice(9)}`;
}

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TAX_REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];

// ── Types ──────────────────────────────────────────────────────────────────

interface FormState {
    storeName: string;
    cnpj: string;
    // address kept as derived formatted string (backward compat)
    address: string;
    // structured address
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    phone: string;
    businessHours: string;
    deliveryRate: string;
    deliveryRadius: string;
    latitude: string;
    longitude: string;
    categories: string[];
    taxRegime: string;
    stateRegistration: string;
    logoUrl: string;
}

const EMPTY: FormState = {
    storeName: "", cnpj: "", address: "",
    cep: "", street: "", number: "", complement: "",
    neighborhood: "", city: "", state: "",
    phone: "", businessHours: "", deliveryRate: "", deliveryRadius: "",
    latitude: "", longitude: "", categories: [],
    taxRegime: "", stateRegistration: "", logoUrl: "",
};

type ToastState = { type: "success" | "error"; message: string } | null;

// ── Validation ─────────────────────────────────────────────────────────────

function validate(f: FormState): Record<string, string> {
    const e: Record<string, string> = {};
    const sn = validateStoreName(f.storeName);
    if (!sn.ok) e.storeName = sn.error;
    if (f.cnpj && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(f.cnpj))
        e.cnpj = "Formato inválido: 00.000.000/0000-00";
    const ph = validatePhone(f.phone);
    if (!ph.ok) e.phone = ph.error;
    if (f.deliveryRate !== "") {
        const dr = validateDeliveryRate(f.deliveryRate);
        if (!dr.ok) e.deliveryRate = dr.error;
    }
    if (f.deliveryRadius !== "") {
        const radius = validateDeliveryRadius(f.deliveryRadius);
        if (!radius.ok) e.deliveryRadius = radius.error;
    }
    if (f.latitude !== "") {
        const lat = validateLatitude(f.latitude);
        if (!lat.ok) e.latitude = lat.error;
    }
    if (f.longitude !== "") {
        const lng = validateLongitude(f.longitude);
        if (!lng.ok) e.longitude = lng.error;
    }
    if (f.businessHours !== "") {
        const bh = validateBusinessHours(f.businessHours);
        if (!bh.ok) e.businessHours = bh.error;
    }
    return e;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function LojaPage() {
    const { adminSession } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [settingId, setSettingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<ToastState>(null);
    const [newCategory, setNewCategory] = useState("");
    const [addingCategory, setAddingCategory] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // CEP state
    const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError] = useState("");
    const [coordsAutoFilled, setCoordsAutoFilled] = useState(false);
    const [coordsNotFound, setCoordsNotFound] = useState(false);
    const fetchedCepRef = useRef("");

    const adminId = useRef<string | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────

    useEffect(() => {
        adminId.current = adminSession?.adminId ?? null;

        if (!adminId.current) { setLoading(false); return; }

        supabase
            .from("store_settings")
            .select("*")
            .eq("admin_id", adminId.current)
            .single()
            .then(({ data }) => {
                if (data) {
                    setSettingId(data.id);
                    setForm({
                        storeName: data.store_name ?? "",
                        cnpj: data.cnpj ?? "",
                        address: data.address ?? "",
                        cep: data.cep ?? "",
                        street: data.street ?? "",
                        number: data.number ?? "",
                        complement: data.complement ?? "",
                        neighborhood: data.neighborhood ?? "",
                        city: data.city ?? "",
                        state: data.state ?? "",
                        phone: data.phone ?? "",
                        businessHours: data.business_hours ?? "",
                        deliveryRate: data.delivery_rate_per_km != null ? String(data.delivery_rate_per_km) : "",
                        deliveryRadius: data.delivery_radius_km != null ? String(data.delivery_radius_km) : "",
                        latitude: data.latitude != null ? String(data.latitude) : "",
                        longitude: data.longitude != null ? String(data.longitude) : "",
                        categories: data.product_categories ?? [],
                        taxRegime: data.tax_regime ?? "",
                        stateRegistration: data.state_registration ?? "",
                        logoUrl: data.logo_url ?? "",
                    });
                    // If CEP already saved, show it as validated
                    if (data.cep && data.street) {
                        setCepStatus("ok");
                    }
                }
                setLoading(false);
            });
    }, []);

    // ── Unsaved changes warning ───────────────────────────────────────────

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!dirty) return;
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    // ── Toast auto-dismiss ───────────────────────────────────────────────

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    // ── Field helpers ─────────────────────────────────────────────────────

    function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((f) => ({ ...f, [key]: value }));
        setDirty(true);
        if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    }

    // ── CEP auto-fill ─────────────────────────────────────────────────────

    async function fetchStoreCep(rawCep: string) {
        const digits = rawCep.replace(/\D/g, "");
        if (digits.length !== 8) return;
        if (fetchedCepRef.current === digits) return;
        fetchedCepRef.current = digits;

        setCepStatus("loading");
        setCepError("");
        setCoordsAutoFilled(false);
        setCoordsNotFound(false);

        try {
            // Primary: BrasilAPI v2 (includes coordinates for many CEPs)
            const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
            if (fetchedCepRef.current !== digits) return; // stale

            if (!res.ok) {
                setCepStatus("error");
                setCepError("CEP não encontrado. Verifique e tente novamente.");
                fetchedCepRef.current = "";
                return;
            }

            const data = await res.json();
            if (fetchedCepRef.current !== digits) return; // stale

            const street       = sanitizeExternalText(data.street,       LIMITS.street);
            const neighborhood = sanitizeExternalText(data.neighborhood, LIMITS.neighborhood);
            const city         = sanitizeExternalText(data.city,         LIMITS.city);
            const state        = sanitizeExternalText(data.state,        LIMITS.state);

            setForm((f) => ({
                ...f,
                street,
                neighborhood,
                city,
                state,
            }));
            setDirty(true);

            // Try to get coordinates
            let lat: string | null = null;
            let lng: string | null = null;

            const brasilLat = data.location?.coordinates?.latitude;
            const brasilLng = data.location?.coordinates?.longitude;

            const brasilCoords = sanitizeExternalCoords(brasilLat, brasilLng);
            if (brasilCoords) {
                lat = String(brasilCoords.lat);
                lng = String(brasilCoords.lng);
            } else {
                // Fallback: AwesomeAPI
                try {
                    const awRes = await fetch(`https://cep.awesomeapi.com.br/json/${digits}`);
                    if (fetchedCepRef.current !== digits) return; // stale
                    if (awRes.ok) {
                        const awData = await awRes.json();
                        const awCoords = sanitizeExternalCoords(awData.lat, awData.lng);
                        if (awCoords) {
                            lat = String(awCoords.lat);
                            lng = String(awCoords.lng);
                        }
                    }
                } catch { /* ignore fallback errors */ }
            }

            if (fetchedCepRef.current !== digits) return; // stale

            if (lat && lng) {
                setForm((f) => ({ ...f, latitude: lat!, longitude: lng! }));
                setCoordsAutoFilled(true);
            } else {
                setCoordsNotFound(true);
            }

            setCepStatus("ok");
        } catch {
            if (fetchedCepRef.current !== digits) return;
            setCepStatus("error");
            setCepError("CEP não encontrado. Verifique e tente novamente.");
            fetchedCepRef.current = "";
        }
    }

    // ── Logo upload ───────────────────────────────────────────────────────

    async function handleLogoUpload(file: File) {
        if (file.size > 2 * 1024 * 1024) {
            setToast({ type: "error", message: "Arquivo muito grande. Máximo: 2MB." });
            return;
        }
        setUploading(true);
        const path = `${adminId.current}/logo`;
        const { error } = await supabase.storage
            .from("store-logos")
            .upload(path, file, { upsert: true, contentType: file.type });

        if (error) {
            setToast({ type: "error", message: "Erro ao fazer upload da logo. Verifique o bucket 'store-logos'." });
        } else {
            const { data: urlData } = supabase.storage.from("store-logos").getPublicUrl(path);
            const url = `${urlData.publicUrl}?t=${Date.now()}`;
            setField("logoUrl", url);
            setToast({ type: "success", message: "Logo atualizada com sucesso!" });
        }
        setUploading(false);
    }

    // ── Save ──────────────────────────────────────────────────────────────

    async function handleSave() {
        const errs = validate(form);
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            setToast({ type: "error", message: "Corrija os campos destacados antes de salvar." });
            return;
        }

        if (!adminId.current) {
            setToast({ type: "error", message: "Sessão não encontrada. Faça login novamente." });
            return;
        }

        // Derive formatted address string for backward compat
        const formattedAddress = form.street
            ? `${form.street}${form.number ? `, ${form.number}` : ""}${form.neighborhood ? `, ${form.neighborhood}` : ""}${form.city ? ` - ${form.city}` : ""}${form.state ? `/${form.state}` : ""}`
            : form.address;

        setSaving(true);
        const payload = {
            admin_id: adminId.current,
            store_name:           form.storeName     ? truncate(form.storeName, LIMITS.store_name)       : null,
            cnpj:                 form.cnpj          || null,
            address:              formattedAddress   ? truncate(formattedAddress, 255)                   : null,
            cep:                  form.cep           || null,
            street:               form.street        ? truncate(form.street, LIMITS.street)              : null,
            number:               form.number        ? truncate(form.number, LIMITS.address_number)      : null,
            complement:           form.complement    ? truncate(form.complement, LIMITS.complement)      : null,
            neighborhood:         form.neighborhood  ? truncate(form.neighborhood, LIMITS.neighborhood)  : null,
            city:                 form.city          ? truncate(form.city, LIMITS.city)                  : null,
            state:                form.state         ? truncate(form.state, LIMITS.state)                : null,
            phone:                form.phone         || null,
            business_hours:       form.businessHours ? truncate(form.businessHours, LIMITS.business_hours) : null,
            delivery_rate_per_km: form.deliveryRate  ? parseFloat(form.deliveryRate)  : null,
            delivery_radius_km:   form.deliveryRadius ? parseFloat(form.deliveryRadius) : null,
            latitude:             form.latitude      ? parseFloat(form.latitude)      : null,
            longitude:            form.longitude     ? parseFloat(form.longitude)     : null,
            tax_regime:           form.taxRegime     || null,
            state_registration:   form.stateRegistration || null,
            product_categories:   form.categories.map((c) => truncate(c, LIMITS.category)),
            logo_url:             form.logoUrl       || null,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = settingId
            ? await supabase.from("store_settings").update(payload).eq("id", settingId).select("id").single()
            : await supabase.from("store_settings").insert(payload).select("id").single();

        if (error) {
            logError("store_settings_save", error);
            logEvent({ event_type: "store_settings_failed", actor_type: "admin", metadata: { error_code: error.code } });
            const detail = error.code === "42P01"
                ? "Tabela não encontrada. Execute a migration 005 no Supabase."
                : error.message ?? "Erro desconhecido.";
            setToast({ type: "error", message: `Erro ao salvar: ${detail}` });
        } else {
            if (!settingId && data) setSettingId(data.id);
            logEvent({ event_type: "store_settings_saved", actor_type: "admin", resource_type: "store_settings", resource_id: settingId ?? (data as { id: string } | null)?.id ?? undefined });
            setDirty(false);
            setToast({ type: "success", message: "Configurações salvas com sucesso!" });
        }
        setSaving(false);
    }

    // ── Category helpers ──────────────────────────────────────────────────

    function addCategory() {
        const t = newCategory.trim();
        const catVal = validateCategory(t);
        if (catVal.ok && !form.categories.includes(t)) setField("categories", [...form.categories, t]);
        setNewCategory("");
        setAddingCategory(false);
    }

    function removeCategory(cat: string) {
        setField("categories", form.categories.filter((c) => c !== cat));
    }

    // ── Skeleton field ────────────────────────────────────────────────────

    function SkelField() { return <Skeleton className="h-10 w-full rounded-md" />; }

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm",
                    toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                )}>
                    {toast.type === "success"
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            {/* Link do cliente */}
            {adminId.current && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Link2 className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-secondary mb-0.5">Link para seus clientes</p>
                                <p className="text-xs text-muted-foreground mb-2">Compartilhe este link para que seus clientes façam pedidos.</p>
                                <div className="flex items-center gap-2">
                                    <code className="text-xs bg-white/80 border border-primary/20 rounded-lg px-3 py-1.5 text-primary font-mono truncate flex-1">
                                        {typeof window !== "undefined" ? `${window.location.origin}/login?admin=${adminId.current}` : ""}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0 border-primary/30 hover:bg-primary/10"
                                        onClick={() => {
                                            if (typeof window !== "undefined") {
                                                navigator.clipboard.writeText(`${window.location.origin}/login?admin=${adminId.current}`);
                                                setToast({ type: "success", message: "Link copiado!" });
                                            }
                                        }}
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Informações da Loja</h2>
                    <p className="text-muted-foreground">Configure os dados fundamentais para o funcionamento do seu negócio.</p>
                </div>
                <div className="flex items-center gap-3">
                    {dirty && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            Alterações não salvas
                        </span>
                    )}
                    <Button
                        className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 gap-2"
                        onClick={handleSave}
                        disabled={saving || loading}
                    >
                        {saving
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Save className="w-4 h-4" />}
                        Salvar Alterações
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* ── Dados da Unidade ───────────────────────────────── */}
                <Card className="md:col-span-2 glass border-none">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Store className="w-5 h-5 text-primary" />
                            <CardTitle className="text-xl">Dados da Unidade</CardTitle>
                        </div>
                        <CardDescription>Informações cadastrais e de contato.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="store-name">Nome da Loja</Label>
                                {loading ? <SkelField /> : (
                                    <>
                                        <Input
                                            id="store-name"
                                            placeholder="Ex: ConstruMais"
                                            className={cn("glass border-none", errors.storeName && "ring-2 ring-red-400")}
                                            value={form.storeName}
                                            onChange={(e) => setField("storeName", e.target.value)}
                                        />
                                        {errors.storeName && <p className="text-xs text-red-500">{errors.storeName}</p>}
                                    </>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cnpj">CNPJ</Label>
                                {loading ? <SkelField /> : (
                                    <>
                                        <Input
                                            id="cnpj"
                                            placeholder="00.000.000/0000-00"
                                            className={cn("glass border-none", errors.cnpj && "ring-2 ring-red-400")}
                                            value={form.cnpj}
                                            onChange={(e) => setField("cnpj", maskCnpj(e.target.value))}
                                        />
                                        {errors.cnpj && <p className="text-xs text-red-500">{errors.cnpj}</p>}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* ── Endereço Principal (CEP auto-fill) ──── */}
                        <div className="space-y-3">
                            <Label className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                Endereço Principal
                            </Label>

                            {loading ? <SkelField /> : (
                                <>
                                    {/* CEP field */}
                                    <div className="space-y-1">
                                        <Label htmlFor="store-cep" className="text-xs">CEP</Label>
                                        <div className="relative">
                                            <Input
                                                id="store-cep"
                                                placeholder="00000-000"
                                                className={cn(
                                                    "glass border-none pr-9",
                                                    cepStatus === "error" && "ring-2 ring-red-400",
                                                    cepStatus === "ok" && "ring-2 ring-emerald-400",
                                                )}
                                                value={form.cep}
                                                onChange={(e) => {
                                                    const masked = maskCep(e.target.value);
                                                    setField("cep", masked);
                                                    const digits = masked.replace(/\D/g, "");
                                                    if (digits.length < 8) {
                                                        if (cepStatus !== "idle") {
                                                            setCepStatus("idle");
                                                            setCepError("");
                                                            setCoordsAutoFilled(false);
                                                            setCoordsNotFound(false);
                                                            fetchedCepRef.current = "";
                                                        }
                                                    } else {
                                                        fetchStoreCep(masked);
                                                    }
                                                }}
                                                maxLength={9}
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                                {cepStatus === "loading" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                                {cepStatus === "ok" && <Check className="w-4 h-4 text-emerald-500" />}
                                                {cepStatus === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                                            </div>
                                        </div>
                                        {cepStatus === "error" && cepError && (
                                            <p className="text-xs text-red-500">{cepError}</p>
                                        )}
                                    </div>

                                    {/* Auto-filled fields — shown when CEP is ok */}
                                    {cepStatus === "ok" && (
                                        <div className="space-y-3">
                                            {/* Rua */}
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Rua / Logradouro</Label>
                                                <Input
                                                    readOnly
                                                    value={form.street}
                                                    className="glass border-none bg-[#F9FAFB] text-muted-foreground cursor-default"
                                                />
                                            </div>

                                            {/* Número + Complemento */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label htmlFor="store-number" className="text-xs">Número</Label>
                                                    <Input
                                                        id="store-number"
                                                        placeholder="Ex: 123"
                                                        className="glass border-none"
                                                        value={form.number}
                                                        onChange={(e) => setField("number", e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor="store-complement" className="text-xs">Complemento</Label>
                                                    <Input
                                                        id="store-complement"
                                                        placeholder="Sala 2, Bloco A..."
                                                        className="glass border-none"
                                                        value={form.complement}
                                                        onChange={(e) => setField("complement", e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Bairro */}
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Bairro</Label>
                                                <Input
                                                    readOnly
                                                    value={form.neighborhood}
                                                    className="glass border-none bg-[#F9FAFB] text-muted-foreground cursor-default"
                                                />
                                            </div>

                                            {/* Cidade + Estado */}
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="col-span-2 space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Cidade</Label>
                                                    <Input
                                                        readOnly
                                                        value={form.city}
                                                        className="glass border-none bg-[#F9FAFB] text-muted-foreground cursor-default"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Estado</Label>
                                                    <Input
                                                        readOnly
                                                        value={form.state}
                                                        className="glass border-none bg-[#F9FAFB] text-muted-foreground cursor-default"
                                                    />
                                                </div>
                                            </div>

                                            {/* Coords not found warning */}
                                            {coordsNotFound && (
                                                <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">
                                                    ⚠️ Coordenadas não encontradas. Preencha latitude e longitude manualmente.
                                                </p>
                                            )}
                                            {coordsAutoFilled && (
                                                <p className="text-xs text-emerald-600">
                                                    ✅ Latitude e longitude preenchidas automaticamente.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                                {loading ? <SkelField /> : (
                                    <>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="phone"
                                                placeholder="(00) 00000-0000"
                                                className={cn("glass border-none pl-9", errors.phone && "ring-2 ring-red-400")}
                                                value={form.phone}
                                                onChange={(e) => setField("phone", maskPhone(e.target.value))}
                                            />
                                        </div>
                                        {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                                    </>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="hours">Horário de Funcionamento</Label>
                                {loading ? <SkelField /> : (
                                    <div className="relative">
                                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="hours"
                                            placeholder="Seg-Sex: 08:00 - 18:00"
                                            className="glass border-none pl-9"
                                            value={form.businessHours}
                                            onChange={(e) => setField("businessHours", e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Logo ──────────────────────────────────────────── */}
                <Card className="glass border-none">
                    <CardHeader>
                        <CardTitle className="text-lg">Logo da Loja</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/svg+xml,image/jpeg"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleLogoUpload(f);
                                e.target.value = "";
                            }}
                        />
                        <div
                            className="w-32 h-32 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-muted-foreground hover:bg-slate-50 transition-colors cursor-pointer group overflow-hidden relative"
                            onClick={() => !uploading && fileInputRef.current?.click()}
                        >
                            {uploading ? (
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            ) : form.logoUrl ? (
                                <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={form.logoUrl} alt="Logo da loja" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-white" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 group-hover:text-primary transition-colors" />
                                    <span className="text-xs mt-2">Fazer Upload</span>
                                </>
                            )}
                        </div>
                        <p className="text-xs text-center text-muted-foreground">Recomendado: 512x512px (PNG ou SVG)</p>
                        {form.logoUrl && !uploading && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground hover:text-red-500 h-7"
                                onClick={() => setField("logoUrl", "")}
                            >
                                Remover logo
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* ── Logística ─────────────────────────────────────── */}
                <Card className="glass border-none">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary" />
                            <CardTitle className="text-xl">Logística</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="delivery-rate">Taxa de Entrega (por km)</Label>
                            {loading ? <SkelField /> : (
                                <>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium select-none">R$</span>
                                        <Input
                                            id="delivery-rate"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0,00"
                                            className={cn("glass border-none pl-9", errors.deliveryRate && "ring-2 ring-red-400")}
                                            value={form.deliveryRate}
                                            onChange={(e) => setField("deliveryRate", e.target.value)}
                                        />
                                    </div>
                                    {errors.deliveryRate && <p className="text-xs text-red-500">{errors.deliveryRate}</p>}
                                </>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="delivery-radius">Raio de Entrega (km)</Label>
                            {loading ? <SkelField /> : (
                                <Input
                                    id="delivery-radius"
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="20"
                                    className="glass border-none"
                                    value={form.deliveryRadius}
                                    onChange={(e) => setField("deliveryRadius", e.target.value)}
                                />
                            )}
                        </div>

                        <Separator className="bg-white/20" />

                        <div className="space-y-3">
                            <div>
                                <Label>Localização da Loja</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Preenchido automaticamente pelo CEP, ou insira manualmente via Google Maps.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="latitude" className="text-xs">Latitude</Label>
                                    {loading ? <SkelField /> : (
                                        <Input
                                            id="latitude"
                                            type="number"
                                            step="any"
                                            placeholder="-23.5505"
                                            className={cn(
                                                "glass border-none",
                                                coordsAutoFilled && "ring-2 ring-emerald-400",
                                            )}
                                            value={form.latitude}
                                            onChange={(e) => {
                                                setField("latitude", e.target.value);
                                                setCoordsAutoFilled(false);
                                            }}
                                        />
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="longitude" className="text-xs">Longitude</Label>
                                    {loading ? <SkelField /> : (
                                        <Input
                                            id="longitude"
                                            type="number"
                                            step="any"
                                            placeholder="-46.6333"
                                            className={cn(
                                                "glass border-none",
                                                coordsAutoFilled && "ring-2 ring-emerald-400",
                                            )}
                                            value={form.longitude}
                                            onChange={(e) => {
                                                setField("longitude", e.target.value);
                                                setCoordsAutoFilled(false);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        <Separator className="bg-white/20" />

                        <div className="space-y-2">
                            <Label>Produtos Principais</Label>
                            {loading ? (
                                <div className="flex flex-wrap gap-2">
                                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2 min-h-[28px]">
                                        {form.categories.map((cat) => (
                                            <span
                                                key={cat}
                                                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full"
                                            >
                                                <Package className="w-3 h-3 shrink-0" />
                                                {cat}
                                                <button
                                                    type="button"
                                                    onClick={() => removeCategory(cat)}
                                                    className="ml-0.5 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>

                                    {addingCategory ? (
                                        <div className="flex gap-2 mt-1">
                                            <Input
                                                autoFocus
                                                placeholder="Nome da categoria"
                                                value={newCategory}
                                                onChange={(e) => setNewCategory(e.target.value)}
                                                className="glass border-none h-8 text-sm"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") { e.preventDefault(); addCategory(); }
                                                    if (e.key === "Escape") { setAddingCategory(false); setNewCategory(""); }
                                                }}
                                            />
                                            <Button size="sm" className="h-8 px-3 bg-primary text-white" onClick={addCategory}>
                                                <Check className="w-3 h-3" />
                                            </Button>
                                            <Button
                                                size="sm" variant="ghost" className="h-8 px-3"
                                                onClick={() => { setAddingCategory(false); setNewCategory(""); }}
                                            >
                                                <X className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost" size="sm"
                                            className="text-primary hover:text-primary/80 text-xs mt-1 w-full border border-dashed border-primary/20 gap-1"
                                            onClick={() => setAddingCategory(true)}
                                        >
                                            <Plus className="w-3 h-3" /> Adicionar Categoria
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* ── Configurações Fiscais ──────────────────────────── */}
                <Card className="md:col-span-2 glass border-none">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            <CardTitle className="text-xl">Configurações Fiscais</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="regime">Regime Tributário</Label>
                            {loading ? <SkelField /> : (
                                <select
                                    id="regime"
                                    value={form.taxRegime}
                                    onChange={(e) => setField("taxRegime", e.target.value)}
                                    className="w-full h-10 px-3 text-sm rounded-md bg-white/40 backdrop-blur border border-white/20 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                                >
                                    <option value="">Selecione o regime...</option>
                                    {TAX_REGIMES.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="inscricao">Inscrição Estadual</Label>
                            {loading ? <SkelField /> : (
                                <Input
                                    id="inscricao"
                                    placeholder="000.000.000.000"
                                    className="glass border-none"
                                    value={form.stateRegistration}
                                    onChange={(e) => setField("stateRegistration", maskStateReg(e.target.value))}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
