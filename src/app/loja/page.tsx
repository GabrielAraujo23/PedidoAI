"use client";

import { useState, useEffect, useRef } from "react";
import {
    Store, MapPin, Phone, FileText, Truck, Clock,
    Save, Upload, Package, Plus, X, Loader2, Check, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ADMIN_SESSION_KEY } from "@/lib/auth-context";

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

// ── Constants ──────────────────────────────────────────────────────────────

const TAX_REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];

// ── Types ──────────────────────────────────────────────────────────────────

interface FormState {
    storeName: string;
    cnpj: string;
    address: string;
    phone: string;
    businessHours: string;
    deliveryRate: string;
    categories: string[];
    taxRegime: string;
    stateRegistration: string;
    logoUrl: string;
}

const EMPTY: FormState = {
    storeName: "", cnpj: "", address: "", phone: "",
    businessHours: "", deliveryRate: "", categories: [],
    taxRegime: "", stateRegistration: "", logoUrl: "",
};

type ToastState = { type: "success" | "error"; message: string } | null;

// ── Validation ─────────────────────────────────────────────────────────────

function validate(f: FormState): Record<string, string> {
    const e: Record<string, string> = {};
    if (!f.storeName.trim()) e.storeName = "Nome da loja é obrigatório.";
    if (f.cnpj && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(f.cnpj))
        e.cnpj = "Formato inválido: 00.000.000/0000-00";
    if (f.phone && !/^\(\d{2}\) \d{4,5}-\d{4}$/.test(f.phone))
        e.phone = "Formato inválido: (00) 00000-0000";
    if (f.deliveryRate !== "" && (isNaN(parseFloat(f.deliveryRate)) || parseFloat(f.deliveryRate) < 0))
        e.deliveryRate = "Deve ser um número positivo.";
    return e;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function LojaPage() {
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

    const adminId = useRef<string | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────

    useEffect(() => {
        try {
            const s = localStorage.getItem(ADMIN_SESSION_KEY);
            adminId.current = s ? JSON.parse(s).adminId : null;
        } catch { adminId.current = null; }

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
                        phone: data.phone ?? "",
                        businessHours: data.business_hours ?? "",
                        deliveryRate: data.delivery_rate_per_km != null ? String(data.delivery_rate_per_km) : "",
                        categories: data.product_categories ?? [],
                        taxRegime: data.tax_regime ?? "",
                        stateRegistration: data.state_registration ?? "",
                        logoUrl: data.logo_url ?? "",
                    });
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
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setSaving(true);
        const payload = {
            admin_id: adminId.current,
            store_name: form.storeName,
            cnpj: form.cnpj,
            address: form.address,
            phone: form.phone,
            business_hours: form.businessHours,
            delivery_rate_per_km: form.deliveryRate ? parseFloat(form.deliveryRate) : null,
            tax_regime: form.taxRegime,
            state_registration: form.stateRegistration,
            product_categories: form.categories,
            logo_url: form.logoUrl,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = settingId
            ? await supabase.from("store_settings").update(payload).eq("id", settingId).select("id").single()
            : await supabase.from("store_settings").insert(payload).select("id").single();

        if (error) {
            setToast({ type: "error", message: "Erro ao salvar. Tente novamente." });
        } else {
            if (!settingId && data) setSettingId(data.id);
            setDirty(false);
            setToast({ type: "success", message: "Configurações salvas com sucesso!" });
        }
        setSaving(false);
    }

    // ── Category helpers ──────────────────────────────────────────────────

    function addCategory() {
        const t = newCategory.trim();
        if (t && !form.categories.includes(t)) setField("categories", [...form.categories, t]);
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
                    "fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
                    toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                )}>
                    {toast.type === "success"
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
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

                        <div className="space-y-2">
                            <Label htmlFor="address">Endereço Principal</Label>
                            {loading ? <SkelField /> : (
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        id="address"
                                        placeholder="Rua, Número, Bairro, Cidade"
                                        className="glass border-none pl-9"
                                        value={form.address}
                                        onChange={(e) => setField("address", e.target.value)}
                                    />
                                </div>
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
