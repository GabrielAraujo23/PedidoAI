"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
    Store, MapPin, Phone, FileText, Truck, Clock,
    Save, Package, Plus, X, Loader2, Check, AlertCircle, Link2, Copy, Palette,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
    validateStoreName, validatePhone, validateDeliveryRate, validateDeliveryRadius,
    validateLatitude, validateLongitude, validateCategory, validateBusinessHours,
    sanitizeExternalCoords, sanitizeExternalText, truncate, LIMITS,
} from "@/lib/validators";
import { slugify, isValidSlug, SLUG_MAX } from "@/lib/slug";
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

/**
 * Máscara do endereço público. Não usa `slugify` direto porque ele corta o
 * hífen final — a cada tecla o lojista perderia o separador que acabou de
 * digitar em "deposito-". A forma definitiva é decidida no salvamento.
 */
function maskSlug(v: string): string {
    return v
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")   // remove os acentos separados pelo NFD
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+/, "")
        .slice(0, SLUG_MAX);
}

// ── Constants ──────────────────────────────────────────────────────────────

const TAX_REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];

// ── Types ──────────────────────────────────────────────────────────────────

interface FormState {
    storeName: string;
    /** Endereço público da loja: /loja/<slug>. */
    slug: string;
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
}

const EMPTY: FormState = {
    storeName: "", slug: "", cnpj: "", address: "",
    cep: "", street: "", number: "", complement: "",
    neighborhood: "", city: "", state: "",
    phone: "", businessHours: "", deliveryRate: "", deliveryRadius: "",
    latitude: "", longitude: "", categories: [],
    taxRegime: "", stateRegistration: "",
};

type ToastState = { type: "success" | "error"; message: string } | null;

type SlugFeedback = { status: "idle" | "checking" | "ok" | "error"; message: string };

/**
 * Veredito sobre o endereço que não depende do servidor. Devolve `null` quando
 * o formato está bom e a única dúvida que resta — se outra loja já o usa — só
 * o banco responde.
 */
function localSlugFeedback(candidate: string, saved: string): SlugFeedback | null {
    if (!candidate) return { status: "idle", message: "" };
    if (candidate === saved) return { status: "ok", message: "Este é o endereço atual da sua loja." };
    const check = isValidSlug(candidate);
    if (!check.ok) return { status: "error", message: check.error };
    return null;
}

function SkelField() { return <Skeleton className="h-10 w-full rounded-md" />; }

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
    const [dirty, setDirty] = useState(false);
    const [settingId, setSettingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<ToastState>(null);
    const [newCategory, setNewCategory] = useState("");
    const [addingCategory, setAddingCategory] = useState(false);

    // CEP state
    const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [cepError, setCepError] = useState("");
    const [coordsAutoFilled, setCoordsAutoFilled] = useState(false);
    const [coordsNotFound, setCoordsNotFound] = useState(false);
    const fetchedCepRef = useRef("");

    // Slug state
    const [savedSlug, setSavedSlug] = useState("");
    // Resposta da checagem remota, guardada junto do slug que foi consultado:
    // sem isso, uma resposta atrasada descreveria um texto que já mudou.
    const [remoteSlug, setRemoteSlug] = useState<{ slug: string; feedback: SlugFeedback } | null>(null);
    // Origem lida no primeiro render do cliente. No servidor fica vazia, mas
    // este bloco só aparece depois do load, então não há hydration mismatch.
    const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

    const adminId = useRef<string | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────

    useEffect(() => {
        adminId.current = adminSession?.adminId ?? null;

        if (!adminId.current) { setLoading(false); return; }

        fetch("/api/loja")
            .then((r) => r.json())
            .then(({ settings: data }) => {
                if (data) {
                    setSettingId(data.id);
                    setSavedSlug(data.slug ?? "");
                    setForm({
                        storeName: data.store_name ?? "",
                        slug: data.slug ?? "",
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

    // ── Slug: validação ao vivo ───────────────────────────────────────────
    // O que dá para responder sem rede (vazio, igual ao atual, formato errado)
    // é derivado no render. O efeito só existe para a pergunta que exige o
    // servidor — "já está em uso?" — e espera 400ms para não disparar uma
    // requisição por tecla digitada.

    const candidateSlug = slugify(form.slug);
    const localSlug = localSlugFeedback(candidateSlug, savedSlug);
    const needsRemoteCheck = localSlug === null;

    const slugFeedback: SlugFeedback = localSlug
        ?? (remoteSlug?.slug === candidateSlug
            ? remoteSlug.feedback
            : { status: "checking", message: "" });

    useEffect(() => {
        if (!needsRemoteCheck) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            let feedback: SlugFeedback;
            try {
                const res = await fetch(`/api/loja/slug?valor=${encodeURIComponent(candidateSlug)}`);
                const json = await res.json();
                if (!res.ok) {
                    feedback = { status: "error", message: json.error ?? "Não foi possível verificar o endereço." };
                } else if (json.available) {
                    feedback = { status: "ok", message: "Endereço disponível." };
                } else {
                    feedback = { status: "error", message: json.error ?? "Este endereço já está em uso." };
                }
            } catch {
                feedback = { status: "error", message: "Não foi possível verificar o endereço. Tente novamente." };
            }
            if (!cancelled) setRemoteSlug({ slug: candidateSlug, feedback });
        }, 400);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [candidateSlug, needsRemoteCheck]);

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

        // Endereço com problema conhecido: o PUT devolveria 400/409 de qualquer
        // forma, e junto perderia o resto do formulário por um campo só.
        if (slugFeedback.status === "error") {
            setToast({ type: "error", message: slugFeedback.message || "Corrija o endereço da loja antes de salvar." });
            return;
        }

        // Derive formatted address string for backward compat
        const formattedAddress = form.street
            ? `${form.street}${form.number ? `, ${form.number}` : ""}${form.neighborhood ? `, ${form.neighborhood}` : ""}${form.city ? ` - ${form.city}` : ""}${form.state ? `/${form.state}` : ""}`
            : form.address;

        setSaving(true);
        const payload = {
            store_name:           form.storeName     ? truncate(form.storeName, LIMITS.store_name)       : null,
            slug:                 candidateSlug      || null,
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
            updated_at: new Date().toISOString(),
        };

        // Upsert pelo tenant do cookie — a API ignora qualquer id enviado.
        let data: { id: string; slug?: string | null } | null = null;
        let error: { code?: string; message?: string } | null = null;
        try {
            const res = await fetch("/api/loja", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) error = { message: json.error ?? "Erro ao salvar" };
            else data = json.settings as { id: string; slug?: string | null };
        } catch (e) {
            error = { message: (e as Error).message };
        }

        if (error) {
            logError("store_settings_save", error);
            logEvent({ event_type: "store_settings_failed", actor_type: "admin", metadata: { error_code: error.code } });
            const detail = error.code === "42P01"
                ? "Tabela não encontrada. Execute a migration 005 no Supabase."
                : error.message ?? "Erro desconhecido.";
            setToast({ type: "error", message: `Erro ao salvar: ${detail}` });
        } else {
            if (!settingId && data) setSettingId(data.id);
            // O banco é quem diz qual endereço vigora agora — o campo passa a
            // exibir a forma normalizada, e o aviso de "link antigo" some.
            if (data) {
                const persisted = data.slug ?? "";
                setSavedSlug(persisted);
                setForm((f) => ({ ...f, slug: persisted }));
            }
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

    // ── Slug: textos derivados ────────────────────────────────────────────
    // O prefixo mostra o host sem o esquema ("pedidoai.vercel.app/loja/") para
    // caber no campo; o link copiado é sempre absoluto, com https.
    const slugPrefix = `${origin.replace(/^https?:\/\//, "")}/loja/`;
    const publicLink = candidateSlug ? `${origin}/loja/${candidateSlug}` : "";
    // O link só está no ar quando o que está na tela é o que está no banco.
    const linkIsLive = Boolean(candidateSlug) && candidateSlug === savedSlug;

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm",
                    toast.type === "success" ? "bg-success text-white" : "bg-destructive text-white"
                )}>
                    {toast.type === "success"
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            {/* Endereço público da loja */}
            {/* Condiciona pela sessão, não pelo ref: ler ref durante o render
                não redispara a árvore quando ele muda. */}
            {adminSession?.adminId && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Link2 className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-secondary mb-0.5">Endereço da sua loja</p>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Escolha o endereço que seus clientes vão usar para fazer pedidos.
                                </p>

                                {loading ? <SkelField /> : (
                                    <>
                                        {/* Campo com o prefixo fixo do link */}
                                        <Label htmlFor="store-slug" className="sr-only">Endereço da loja</Label>
                                        <div className={cn(
                                            "flex items-stretch rounded-lg border bg-card/80 overflow-hidden",
                                            "focus-within:ring-2 focus-within:ring-primary/50",
                                            slugFeedback.status === "error" ? "border-destructive/60"
                                                : slugFeedback.status === "ok" ? "border-success/60"
                                                    : "border-primary/20",
                                        )}>
                                            <span className="px-3 py-1.5 text-xs font-mono text-muted-foreground bg-black/[0.03] border-r border-primary/10 whitespace-nowrap self-center shrink-0 hidden sm:block">
                                                {slugPrefix}
                                            </span>
                                            <input
                                                id="store-slug"
                                                value={form.slug}
                                                onChange={(e) => setField("slug", maskSlug(e.target.value))}
                                                placeholder="minha-loja"
                                                maxLength={SLUG_MAX}
                                                autoComplete="off"
                                                spellCheck={false}
                                                aria-invalid={slugFeedback.status === "error"}
                                                aria-describedby="store-slug-hint"
                                                className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-xs font-mono text-primary placeholder:text-muted-foreground/60 focus:outline-none"
                                            />
                                            <span className="pr-3 flex items-center shrink-0">
                                                {slugFeedback.status === "checking" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                                {slugFeedback.status === "ok" && <Check className="w-3.5 h-3.5 text-success" />}
                                                {slugFeedback.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                                            </span>
                                        </div>

                                        <p
                                            id="store-slug-hint"
                                            aria-live="polite"
                                            className={cn(
                                                "text-xs mt-1.5",
                                                slugFeedback.status === "error" ? "text-destructive"
                                                    : slugFeedback.status === "ok" ? "text-success"
                                                        : "text-muted-foreground",
                                            )}
                                        >
                                            {slugFeedback.message || "Use letras minúsculas, números e hífen. Ex: deposito-izomar"}
                                        </p>

                                        {/* Link completo + copiar */}
                                        <div className="flex items-center gap-2 mt-3">
                                            <code className="text-xs bg-card/80 border border-primary/20 rounded-lg px-3 py-1.5 text-primary font-mono truncate flex-1">
                                                {publicLink || `${slugPrefix}minha-loja`}
                                            </code>
                                            {/* Copiar só o que já funciona: um link
                                                ainda não salvo levaria a lugar nenhum. */}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                aria-label="Copiar link da loja"
                                                title={linkIsLive ? "Copiar link da loja" : "Salve o novo endereço para copiar o link"}
                                                disabled={!linkIsLive}
                                                className="shrink-0 border-primary/30 hover:bg-primary/10 cursor-pointer disabled:cursor-not-allowed"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(publicLink);
                                                    setToast({ type: "success", message: "Link copiado!" });
                                                }}
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>

                                        {/* O aviso só aparece quando há mesmo um link antigo em risco. */}
                                        {savedSlug && candidateSlug !== savedSlug ? (
                                            <p className="text-xs text-warning bg-warning-surface rounded-md px-3 py-2 mt-2">
                                                ⚠️ Ao salvar, o link anterior (<span className="font-mono">/loja/{savedSlug}</span>) deixa de funcionar.
                                                Quem já tiver o link antigo vai precisar do novo.
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground mt-2">
                                                Ao trocar o endereço, o link anterior deixa de funcionar.
                                            </p>
                                        )}
                                    </>
                                )}
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
                        <span className="flex items-center gap-1.5 text-xs text-warning font-medium">
                            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                            Alterações não salvas
                        </span>
                    )}
                    <Button
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 gap-2"
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
                                            className={cn("glass border-none", errors.storeName && "ring-2 ring-destructive/60")}
                                            value={form.storeName}
                                            onChange={(e) => setField("storeName", e.target.value)}
                                        />
                                        {errors.storeName && <p className="text-xs text-destructive">{errors.storeName}</p>}
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
                                            className={cn("glass border-none", errors.cnpj && "ring-2 ring-destructive/60")}
                                            value={form.cnpj}
                                            onChange={(e) => setField("cnpj", maskCnpj(e.target.value))}
                                        />
                                        {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
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
                                                    cepStatus === "error" && "ring-2 ring-destructive/60",
                                                    cepStatus === "ok" && "ring-2 ring-success/60",
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
                                                {cepStatus === "ok" && <Check className="w-4 h-4 text-success" />}
                                                {cepStatus === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                                            </div>
                                        </div>
                                        {cepStatus === "error" && cepError && (
                                            <p className="text-xs text-destructive">{cepError}</p>
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
                                                    className="glass border-none bg-muted text-muted-foreground cursor-default"
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
                                                    className="glass border-none bg-muted text-muted-foreground cursor-default"
                                                />
                                            </div>

                                            {/* Cidade + Estado */}
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="col-span-2 space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Cidade</Label>
                                                    <Input
                                                        readOnly
                                                        value={form.city}
                                                        className="glass border-none bg-muted text-muted-foreground cursor-default"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Estado</Label>
                                                    <Input
                                                        readOnly
                                                        value={form.state}
                                                        className="glass border-none bg-muted text-muted-foreground cursor-default"
                                                    />
                                                </div>
                                            </div>

                                            {/* Coords not found warning */}
                                            {coordsNotFound && (
                                                <p className="text-xs text-warning bg-warning-surface rounded-md px-3 py-2">
                                                    ⚠️ Coordenadas não encontradas. Preencha latitude e longitude manualmente.
                                                </p>
                                            )}
                                            {coordsAutoFilled && (
                                                <p className="text-xs text-success">
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
                                                className={cn("glass border-none pl-9", errors.phone && "ring-2 ring-destructive/60")}
                                                value={form.phone}
                                                onChange={(e) => setField("phone", maskPhone(e.target.value))}
                                            />
                                        </div>
                                        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
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

                {/* A identidade visual mudou de lugar. Este ponteiro fica aqui
                    porque quem já usava o sistema vai procurar a logo onde ela
                    sempre esteve — e não achar, sem explicação, é pior que uma
                    linha a mais nesta tela. */}
                <Card className="glass border-none">
                    <CardHeader>
                        <CardTitle className="text-lg">Identidade visual</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            A logo da loja agora fica em <strong>Personalizar</strong>, junto do resto da
                            aparência.
                        </p>
                        <Link
                            href="/personalizar"
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border text-foreground text-[13px] font-semibold hover:border-muted-foreground"
                        >
                            <Palette className="w-3.5 h-3.5" /> Ir para Personalizar
                        </Link>
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
                                            className={cn("glass border-none pl-9", errors.deliveryRate && "ring-2 ring-destructive/60")}
                                            value={form.deliveryRate}
                                            onChange={(e) => setField("deliveryRate", e.target.value)}
                                        />
                                    </div>
                                    {errors.deliveryRate && <p className="text-xs text-destructive">{errors.deliveryRate}</p>}
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
                                                coordsAutoFilled && "ring-2 ring-success/60",
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
                                                coordsAutoFilled && "ring-2 ring-success/60",
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
                                                    className="ml-0.5 hover:text-destructive transition-colors"
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
