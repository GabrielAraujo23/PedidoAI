// src/app/estoque/receber/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Check, X, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { parseNfeXml, matchProductByName } from "@/lib/nfe-xml-parser";
import type { NfeProduct, Product } from "@/lib/types";
import { Camera } from "lucide-react";

type Tab = "nfe" | "barcode";
type ItemStatus = "match" | "partial" | "new";

interface ReviewItem {
    nfeProduct: NfeProduct;
    matchedProductId: string | null;
    matchedProductName: string | null;
    status: ItemStatus;
    confirmed: boolean;
    category: string;
}

const CATEGORIES = [
    "Outros Produtos","Telhas","Tintas e Massas","Eletroduto e Lavanderia",
    "Vigas e Cantoneiras","Ferragens","Eletricidade e Cabos","Canos",
];

const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };
const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";

export default function ReceberPage() {
    const { adminSession } = useAuth();
    const [tab, setTab] = useState<Tab>("nfe");
    const [products, setProducts] = useState<Product[]>([]);

    // NF-e state
    const [chaveAcesso, setChaveAcesso] = useState("");
    const [supplierName, setSupplierName] = useState("");
    const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [xmlError, setXmlError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Barcode state
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannedBarcode, setScannedBarcode] = useState("");
    const [barcodeInfo, setBarcodeInfo] = useState<{ name: string; unit: string } | null>(null);
    const [barcodeQty, setBarcodeQty] = useState("1");
    const [barcodeCategory, setBarcodeCategory] = useState("Outros Produtos");
    const [barcodeLoading, setBarcodeLoading] = useState(false);
    const [barcodeSaving, setBarcodeSaving] = useState(false);
    const [barcodeSaved, setBarcodeSaved] = useState(false);

    useEffect(() => {
        if (!adminSession) return;
        supabase
            .from("products")
            .select("id, name, barcode, stock_quantity, category, unit, price, active, admin_id, created_at, description, subcategory")
            .eq("admin_id", adminSession.adminId)
            .then(({ data }) => setProducts((data ?? []) as Product[]));
    }, [adminSession]);

    function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setXmlError(null);

        const reader = new FileReader();
        reader.onload = (ev) => {
            const xml = ev.target?.result as string;
            const result = parseNfeXml(xml);

            if (result.error) { setXmlError(result.error); return; }

            if (result.chaveAcesso) setChaveAcesso(result.chaveAcesso);
            if (result.supplierName) setSupplierName(result.supplierName);

            const catalogNames = products.map((p) => p.name);
            const items: ReviewItem[] = result.products.map((nfeProd) => {
                const byBarcode = nfeProd.cEAN
                    ? products.find((p) => p.barcode === nfeProd.cEAN)
                    : null;

                if (byBarcode) {
                    return { nfeProduct: nfeProd, matchedProductId: byBarcode.id, matchedProductName: byBarcode.name, status: "match" as ItemStatus, confirmed: true, category: byBarcode.category };
                }

                const idx = matchProductByName(nfeProd.xProd, catalogNames);
                if (idx >= 0) {
                    return { nfeProduct: nfeProd, matchedProductId: products[idx].id, matchedProductName: products[idx].name, status: "partial" as ItemStatus, confirmed: false, category: products[idx].category };
                }

                return { nfeProduct: nfeProd, matchedProductId: null, matchedProductName: null, status: "new" as ItemStatus, confirmed: true, category: "Outros Produtos" };
            });

            setReviewItems(items);
        };
        reader.readAsText(file, "utf-8");
    }

    async function handleConfirmReceipt() {
        setConfirming(true);
        setXmlError(null);
        const items = reviewItems
            .filter((i) => i.confirmed)
            .map((i) => ({
                product_id: i.matchedProductId,
                name: i.matchedProductId ? i.matchedProductName! : i.nfeProduct.xProd,
                quantity: i.nfeProduct.qCom,
                unit: i.nfeProduct.uCom,
                unit_price: i.nfeProduct.vUnCom,
                barcode: i.nfeProduct.cEAN || null,
                category: i.category,
            }));

        try {
            const res = await fetch("/api/estoque/receber", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items, chave_acesso: chaveAcesso || null, supplier_name: supplierName || null }),
            });

            const body = await res.json() as { ok?: boolean; processed?: number; error?: string; details?: string[] };

            if (res.ok && body.ok) {
                setConfirmed(true);
                setReviewItems([]);
            } else {
                const detail = body.details?.slice(0, 3).join(" | ") ?? "";
                setXmlError(`Erro: ${body.error ?? "falha desconhecida"}${detail ? ` — ${detail}` : ""}`);
            }
        } catch (e) {
            setXmlError(`Erro de rede: ${e instanceof Error ? e.message : String(e)}`);
        }

        setConfirming(false);
    }

    async function lookupBarcode(barcode: string) {
        setBarcodeLoading(true);
        setBarcodeInfo(null);

        const existing = products.find((p) => p.barcode === barcode);
        if (existing) {
            setBarcodeInfo({ name: existing.name, unit: existing.unit });
            setBarcodeLoading(false);
            return;
        }

        // Cosmos Bluesoft free API (no key required for basic lookups)
        try {
            const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${barcode}`, {
                headers: { "X-Cosmos-Token": "" },
            });
            if (res.ok) {
                const data = await res.json() as { description?: string };
                if (data?.description) {
                    setBarcodeInfo({ name: data.description, unit: "por unidade" });
                    setBarcodeLoading(false);
                    return;
                }
            }
        } catch { /* no info available */ }

        setBarcodeLoading(false);
    }

    async function handleBarcodeSave() {
        if (!scannedBarcode || !barcodeInfo?.name) return;
        setBarcodeSaving(true);

        const qty = parseInt(barcodeQty) || 1;
        const existing = products.find((p) => p.barcode === scannedBarcode);

        await fetch("/api/estoque/receber", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    product_id: existing?.id ?? null,
                    name: barcodeInfo.name,
                    quantity: qty,
                    unit: barcodeInfo.unit,
                    unit_price: 0,
                    barcode: scannedBarcode,
                    category: barcodeCategory,
                }],
                chave_acesso: null,
                supplier_name: null,
            }),
        });

        setBarcodeSaved(true);
        setTimeout(() => {
            setScannedBarcode("");
            setBarcodeInfo(null);
            setBarcodeQty("1");
            setBarcodeSaved(false);
        }, 2000);
        setBarcodeSaving(false);
    }

    const statusConfig: Record<ItemStatus, { label: string; dot: string }> = {
        match:   { label: "Match exato", dot: "bg-emerald-500" },
        partial: { label: "Match parcial — confirme", dot: "bg-amber-400" },
        new:     { label: "Produto novo", dot: "bg-red-500" },
    };

    return (
        <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
                <p className={cn(eyebrowClass, "mb-3")}>Estoque</p>
                <h1 className="text-[40px] leading-[0.96] tracking-tight text-stone-900" style={sectionTitleStyle}>
                    Receber Mercadoria
                </h1>
            </header>

            {/* Tabs */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit">
                {(["nfe", "barcode"] as Tab[]).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={cn(
                        "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
                        tab === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                    )}>
                        {t === "nfe" ? "Importar NF-e" : "Código de Barras"}
                    </button>
                ))}
            </div>

            {/* NF-e tab */}
            {tab === "nfe" && (
                <div className="space-y-5">
                    {confirmed ? (
                        <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-8 text-center">
                            <Check className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                            <p className="text-[18px] font-semibold text-emerald-900" style={sectionTitleStyle}>Recebimento confirmado!</p>
                            <p className="text-[13px] text-emerald-700 mt-1">Estoque atualizado com sucesso.</p>
                            <button onClick={() => setConfirmed(false)} className="mt-4 px-4 h-9 rounded-xl border border-emerald-300 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors">
                                Novo recebimento
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-2xl border border-stone-200/70 p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">Chave de Acesso (44 dígitos)</label>
                                        <input
                                            type="text" maxLength={44}
                                            value={chaveAcesso}
                                            onChange={(e) => setChaveAcesso(e.target.value.replace(/\D/g, "").slice(0, 44))}
                                            placeholder="Digite ou cole a chave"
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">Fornecedor (opcional)</label>
                                        <input
                                            type="text"
                                            value={supplierName}
                                            onChange={(e) => setSupplierName(e.target.value)}
                                            placeholder="Nome do fornecedor"
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[12px] font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">Upload do XML da NF-e</label>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full h-24 rounded-xl border-2 border-dashed border-stone-200 hover:border-stone-400 flex flex-col items-center justify-center gap-2 text-stone-400 hover:text-stone-600 transition-colors"
                                    >
                                        <Upload className="w-5 h-5" />
                                        <span className="text-[13px] font-medium">Clique para selecionar o arquivo XML</span>
                                    </button>
                                    <input ref={fileInputRef} type="file" accept=".xml" onChange={handleXmlUpload} className="hidden" />
                                    {xmlError && <p className="text-[12px] text-red-600 mt-2">{xmlError}</p>}
                                </div>
                            </div>

                            {reviewItems.length > 0 && (
                                <div className="bg-white rounded-2xl border border-stone-200/70 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                                        <p className="font-semibold text-stone-900">{reviewItems.length} produtos na nota</p>
                                        <p className="text-[12px] text-stone-500">{reviewItems.filter((i) => i.confirmed).length} selecionados</p>
                                    </div>
                                    <div className="divide-y divide-stone-100">
                                        {reviewItems.map((item, idx) => {
                                            const cfg = statusConfig[item.status];
                                            return (
                                                <div key={idx} className={cn("px-5 py-3 flex items-start gap-3", !item.confirmed && "opacity-60")}>
                                                    <input
                                                        type="checkbox"
                                                        checked={item.confirmed}
                                                        onChange={(e) => setReviewItems((prev) => prev.map((it, i) => i === idx ? { ...it, confirmed: e.target.checked } : it))}
                                                        className="mt-0.5 accent-stone-900"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-semibold text-stone-900 truncate">{item.nfeProduct.xProd}</p>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                                                                <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                                                                {cfg.label}
                                                            </span>
                                                            <span className="text-[11px] text-stone-400">{item.nfeProduct.qCom} {item.nfeProduct.uCom} · R$ {item.nfeProduct.vUnCom.toFixed(2)}</span>
                                                        </div>
                                                        {item.status === "partial" && (
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <span className="text-[12px] text-stone-500">Vincular a:</span>
                                                                <select
                                                                    value={item.matchedProductId ?? ""}
                                                                    onChange={(e) => {
                                                                        const prod = products.find((p) => p.id === e.target.value);
                                                                        setReviewItems((prev) => prev.map((it, i) => i === idx ? { ...it, matchedProductId: e.target.value || null, matchedProductName: prod?.name ?? null, confirmed: !!e.target.value } : it));
                                                                    }}
                                                                    className="h-7 px-2 text-[12px] border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900"
                                                                >
                                                                    <option value="">— Criar novo —</option>
                                                                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                                </select>
                                                            </div>
                                                        )}
                                                        {item.status === "new" && (
                                                            <select
                                                                value={item.category}
                                                                onChange={(e) => setReviewItems((prev) => prev.map((it, i) => i === idx ? { ...it, category: e.target.value } : it))}
                                                                className="mt-1.5 h-7 px-2 text-[12px] border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900"
                                                            >
                                                                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="border-t border-stone-100 px-5 py-4">
                                        <button
                                            onClick={handleConfirmReceipt}
                                            disabled={confirming || reviewItems.filter((i) => i.confirmed).length === 0}
                                            className="w-full h-11 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                            Confirmar Recebimento ({reviewItems.filter((i) => i.confirmed).length} itens)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Barcode tab */}
            {tab === "barcode" && (
                <div className="space-y-5">
                    {scannerOpen && (
                        <BarcodeScanner
                            onDetected={(barcode) => {
                                setScannerOpen(false);
                                setScannedBarcode(barcode);
                                lookupBarcode(barcode);
                            }}
                            onClose={() => setScannerOpen(false)}
                        />
                    )}

                    <div className="bg-white rounded-2xl border border-stone-200/70 p-5 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={scannedBarcode}
                                onChange={(e) => { setScannedBarcode(e.target.value); if (e.target.value.length >= 8) lookupBarcode(e.target.value); }}
                                placeholder="Código EAN / GTIN"
                                className="flex-1 h-10 px-3 rounded-xl border border-stone-200 text-[13px] font-mono focus:outline-none focus:border-stone-900"
                            />
                            <button
                                onClick={() => setScannerOpen(true)}
                                className="h-10 px-4 bg-stone-900 text-white rounded-xl text-[13px] font-semibold flex items-center gap-2 hover:bg-stone-800 transition-colors"
                            >
                                <Camera className="w-4 h-4" />
                                <span className="hidden sm:inline">Câmera</span>
                            </button>
                        </div>

                        {barcodeLoading && (
                            <div className="flex items-center gap-2 text-[13px] text-stone-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Buscando produto...
                            </div>
                        )}

                        {scannedBarcode && !barcodeLoading && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[12px] font-semibold text-stone-500 mb-1 uppercase tracking-wider">Nome do produto</label>
                                    <input
                                        type="text"
                                        value={barcodeInfo?.name ?? ""}
                                        onChange={(e) => setBarcodeInfo((prev) => ({ name: e.target.value, unit: prev?.unit ?? "por unidade" }))}
                                        placeholder="Nome do produto"
                                        className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1 uppercase tracking-wider">Quantidade recebida</label>
                                        <input
                                            type="number" min={1}
                                            value={barcodeQty}
                                            onChange={(e) => setBarcodeQty(e.target.value)}
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1 uppercase tracking-wider">Categoria</label>
                                        <select
                                            value={barcodeCategory}
                                            onChange={(e) => setBarcodeCategory(e.target.value)}
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                        >
                                            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={handleBarcodeSave}
                                    disabled={barcodeSaving || !barcodeInfo?.name || barcodeSaved}
                                    className="w-full h-11 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {barcodeSaved ? <><Check className="w-4 h-4" /> Salvo!</> :
                                     barcodeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                     <><Plus className="w-4 h-4" /> Confirmar entrada</>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
