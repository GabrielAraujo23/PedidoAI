"use client";

import { useEffect, useState } from "react";
import {
    ShoppingBag, Plus, Search, Pencil, Trash2,
    AlertCircle, Check, Package, Tag, ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { validateProductName, validatePrice, validateDescription, truncate, LIMITS } from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const CATEGORIES = [
    "Outros Produtos",
    "Telhas",
    "Tintas e Massas",
    "Eletroduto e Lavanderia",
    "Vigas e Cantoneiras",
    "Ferragens",
    "Eletricidade e Cabos",
    "Canos",
];

const UNITS = [
    "por unidade",
    "por metro",
    "por saco",
    "por kg",
    "por litro",
    "por rolo",
    "por peça",
    "por caixa",
];

interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
    created_at: string;
}

interface ProductForm {
    name: string;
    description: string;
    category: string;
    subcategory: string;
    unit: string;
    price: string;
    active: boolean;
}

const EMPTY_FORM: ProductForm = {
    name: "", description: "", category: CATEGORIES[0],
    subcategory: "", unit: UNITS[0], price: "", active: true,
};

function formatCurrency(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskPrice(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const cents = parseInt(digits, 10);
    return (cents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
}

export default function ProdutosPage() {
    const { adminSession } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState("Todos");
    const [showInactive, setShowInactive] = useState(false);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    // Delete confirm
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Toast
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    useEffect(() => {
        if (adminSession) fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminSession]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    async function fetchProducts() {
        setLoading(true);
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("admin_id", adminSession!.adminId)
            .order("category", { ascending: true })
            .order("name", { ascending: true });
        if (error) setToast({ type: "error", message: `Erro ao carregar: ${error.message}` });
        else setProducts((data as Product[]) ?? []);
        setLoading(false);
    }

    const filtered = products.filter((p) => {
        const matchSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.subcategory ?? "").toLowerCase().includes(search.toLowerCase());
        const matchCategory = filterCategory === "Todos" || p.category === filterCategory;
        const matchActive = showInactive ? true : p.active;
        return matchSearch && matchCategory && matchActive;
    });

    const totalActive = products.filter((p) => p.active).length;
    const uniqueCategories = [...new Set(products.map((p) => p.category))].length;

    // ── Form Handlers ──────────────────────────────────────────────────────────

    function openAdd() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError("");
        setShowModal(true);
    }

    function openEdit(p: Product) {
        setEditingId(p.id);
        setForm({
            name: p.name,
            description: p.description ?? "",
            category: p.category,
            subcategory: p.subcategory ?? "",
            unit: p.unit,
            price: p.price.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }),
            active: p.active,
        });
        setFormError("");
        setShowModal(true);
    }

    function setField<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSave() {
        setFormError("");
        const nameVal = validateProductName(form.name);
        if (!nameVal.ok) { setFormError(nameVal.error); return; }
        if (!form.price) { setFormError("Preço é obrigatório."); return; }
        const priceVal = validatePrice(form.price);
        if (!priceVal.ok) { setFormError(priceVal.error); return; }
        const descVal = validateDescription(form.description);
        if (!descVal.ok) { setFormError(descVal.error); return; }

        const priceNum = parseFloat(form.price.replace(/\./g, "").replace(",", "."));

        setSaving(true);
        const payload = {
            name: truncate(form.name.trim(), LIMITS.product_name),
            description: form.description.trim() ? truncate(form.description.trim(), LIMITS.description) : null,
            category: form.category,
            subcategory: form.subcategory.trim() || null,
            unit: form.unit,
            price: priceNum,
            active: form.active,
            updated_at: new Date().toISOString(),
        };

        let savedId: string | undefined = editingId ?? undefined;
        let error;

        if (editingId) {
            ({ error } = await supabase.from("products").update(payload).eq("id", editingId));
        } else {
            const result = await supabase.from("products").insert({ ...payload, admin_id: adminSession!.adminId }).select("id").single();
            error = result.error;
            if (result.data) savedId = (result.data as { id: string }).id;
        }

        if (error) {
            logError("product_save", error);
            setFormError(`Erro: ${(error as { message?: string }).message ?? "Erro desconhecido."}`);
        } else {
            logEvent({
                event_type: editingId ? "product_updated" : "product_created",
                actor_type: "admin",
                resource_type: "product",
                resource_id: savedId,
                metadata: { category: form.category },
            });
            setShowModal(false);
            setToast({ type: "success", message: editingId ? "Produto atualizado!" : "Produto criado com sucesso!" });
            await fetchProducts();
        }
        setSaving(false);
    }

    async function handleToggleActive(p: Product) {
        const { error } = await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
        if (error) {
            logError("product_toggle", error);
            return;
        }
        logEvent({ event_type: "product_toggled", actor_type: "admin", resource_type: "product", resource_id: p.id, metadata: { active: !p.active } });
        setProducts((prev) =>
            prev.map((x) => x.id === p.id ? { ...x, active: !p.active } : x)
        );
    }

    async function handleDelete() {
        if (!deleteId) return;
        setDeleting(true);
        const { error } = await supabase.from("products").delete().eq("id", deleteId);
        if (error) {
            logError("product_delete", error);
            setToast({ type: "error", message: "Erro ao excluir produto." });
        } else {
            logEvent({ event_type: "product_deleted", actor_type: "admin", resource_type: "product", resource_id: deleteId });
            setProducts((prev) => prev.filter((p) => p.id !== deleteId));
            setToast({ type: "success", message: "Produto excluído." });
        }
        setDeleteId(null);
        setDeleting(false);
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">

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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-secondary">Produtos</h1>
                        <p className="text-sm text-muted-foreground">Gerencie o catálogo de produtos da loja</p>
                    </div>
                </div>
                <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white gap-2 self-start sm:self-auto">
                    <Plus className="w-4 h-4" /> Adicionar Produto
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-2xl" />
                    ))
                ) : (
                    <>
                        <div className="bg-white/60 backdrop-blur rounded-2xl p-4 border border-white/30">
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="text-2xl font-bold text-secondary mt-1">{products.length}</p>
                            <p className="text-xs text-muted-foreground">produtos</p>
                        </div>
                        <div className="bg-white/60 backdrop-blur rounded-2xl p-4 border border-white/30">
                            <p className="text-xs text-muted-foreground">Ativos</p>
                            <p className="text-2xl font-bold text-emerald-600 mt-1">{totalActive}</p>
                            <p className="text-xs text-muted-foreground">disponíveis</p>
                        </div>
                        <div className="bg-white/60 backdrop-blur rounded-2xl p-4 border border-white/30">
                            <p className="text-xs text-muted-foreground">Categorias</p>
                            <p className="text-2xl font-bold text-primary mt-1">{uniqueCategories}</p>
                            <p className="text-xs text-muted-foreground">em uso</p>
                        </div>
                    </>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar produtos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-white/60"
                    />
                </div>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="h-10 rounded-xl border border-input bg-white/60 px-3 text-sm text-secondary min-w-[180px]"
                >
                    <option value="Todos">Todas as categorias</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                    onClick={() => setShowInactive(!showInactive)}
                    className={cn(
                        "flex items-center gap-2 px-4 h-10 rounded-xl border text-sm font-medium transition-colors",
                        showInactive
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-white/60 border-input text-muted-foreground"
                    )}
                >
                    {showInactive
                        ? <ToggleRight className="w-4 h-4" />
                        : <ToggleLeft className="w-4 h-4" />}
                    {showInactive ? "Mostrando inativos" : "Só ativos"}
                </button>
            </div>

            {/* Table */}
            <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/30 overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 rounded-xl" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <Package className="w-10 h-10 text-muted-foreground/40 mb-3" />
                        <p className="font-semibold text-secondary">Nenhum produto encontrado</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {search || filterCategory !== "Todos"
                                ? "Tente ajustar os filtros de busca."
                                : 'Clique em "Adicionar Produto" para começar.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/30 bg-white/30">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Categoria</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Unidade</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preço</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p, idx) => (
                                <tr
                                    key={p.id}
                                    className={cn(
                                        "border-b border-white/20 transition-colors hover:bg-white/40",
                                        idx % 2 === 0 ? "bg-white/10" : "bg-transparent"
                                    )}
                                >
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-secondary">{p.name}</p>
                                        {p.subcategory && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                <Tag className="w-3 h-3" />{p.subcategory}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell">
                                        <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">
                                            {p.category}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{p.unit}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-secondary">{formatCurrency(p.price)}</td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => handleToggleActive(p)}
                                            title={p.active ? "Desativar produto" : "Ativar produto"}
                                            className="mx-auto"
                                        >
                                            {p.active
                                                ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                                                : <ToggleLeft className="w-6 h-6 text-muted-foreground/40" />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => openEdit(p)}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                title="Editar"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteId(p.id)}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add/Edit Modal */}
            <Dialog open={showModal} onOpenChange={(open) => { if (!saving) setShowModal(open); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Editar Produto" : "Adicionar Produto"}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="p-name">Nome *</Label>
                            <Input
                                id="p-name"
                                value={form.name}
                                onChange={(e) => setField("name", e.target.value)}
                                placeholder="Ex: Telha Ondulada 2,13m"
                                className="mt-1"
                                maxLength={LIMITS.product_name}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="p-category">Categoria *</Label>
                                <select
                                    id="p-category"
                                    value={form.category}
                                    onChange={(e) => setField("category", e.target.value)}
                                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="p-sub">Subcategoria</Label>
                                <Input
                                    id="p-sub"
                                    value={form.subcategory}
                                    onChange={(e) => setField("subcategory", e.target.value)}
                                    placeholder="Ex: Fibrocimento"
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="p-unit">Unidade *</Label>
                                <select
                                    id="p-unit"
                                    value={form.unit}
                                    onChange={(e) => setField("unit", e.target.value)}
                                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="p-price">Preço (R$) *</Label>
                                <Input
                                    id="p-price"
                                    value={form.price}
                                    onChange={(e) => setField("price", maskPrice(e.target.value))}
                                    placeholder="0,00"
                                    className="mt-1"
                                    inputMode="numeric"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="p-desc">Descrição</Label>
                            <Input
                                id="p-desc"
                                value={form.description}
                                onChange={(e) => setField("description", e.target.value)}
                                placeholder="Descrição opcional"
                                className="mt-1"
                                maxLength={LIMITS.description}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setField("active", !form.active)}
                            >
                                {form.active
                                    ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                                    : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                            </button>
                            <span className="text-sm text-secondary">
                                {form.active ? "Produto ativo (visível no catálogo)" : "Produto inativo (oculto no catálogo)"}
                            </span>
                        </div>

                        {formError && (
                            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded-lg">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {formError}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="mt-2">
                        <Button variant="ghost" onClick={() => setShowModal(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="bg-primary text-white">
                            {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Adicionar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Modal */}
            <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open && !deleting) setDeleteId(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Excluir produto?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Esta ação não pode ser desfeita. O produto será removido permanentemente do catálogo.
                    </p>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteId(null)} disabled={deleting}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            {deleting ? "Excluindo..." : "Excluir"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
