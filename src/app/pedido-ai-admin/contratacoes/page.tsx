"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, X, PauseCircle, PlayCircle, RefreshCw, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TenantStatus } from "@/lib/tenant-status";

interface Contratacao {
    adminId: string;
    email: string;
    status: TenantStatus;
    reason: string | null;
    createdAt: string | null;
    terms: { acceptedAt: string | null; version: string | null; ip: string | null };
    loja: { storeName: string | null; slug: string | null; cnpj: string | null; phone: string | null; address: string | null; whiteLabel: boolean };
}

const FILTROS: { valor: TenantStatus | "todos"; label: string }[] = [
    { valor: "pendente", label: "Pendentes" },
    { valor: "ativa",    label: "Ativas" },
    { valor: "suspensa", label: "Suspensas" },
    { valor: "recusada", label: "Recusadas" },
    { valor: "todos",    label: "Todas" },
];

const BADGE: Record<TenantStatus, string> = {
    pendente: "bg-warning-surface text-warning border-warning/30",
    ativa:    "bg-success-surface text-success border-success/30",
    suspensa: "bg-muted text-muted-foreground border-border",
    recusada: "bg-destructive-surface text-destructive border-destructive/30",
};

function formatData(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function ContratacoesPage() {
    const [filtro, setFiltro] = useState<TenantStatus | "todos">("pendente");
    const [lista, setLista] = useState<Contratacao[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [agindo, setAgindo] = useState("");

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");
        try {
            const url = filtro === "todos"
                ? "/api/pedido-ai-admin/contratacoes"
                : `/api/pedido-ai-admin/contratacoes?status=${filtro}`;
            const res = await res_json(url);
            if (!res.ok) { setErro(res.data.error ?? "Erro ao carregar."); setLista([]); }
            else setLista(res.data.contratacoes ?? []);
        } finally {
            setLoading(false);
        }
    }, [filtro]);

    useEffect(() => { carregar(); }, [carregar]);

    async function mudar(adminId: string, status: TenantStatus, precisaMotivo: boolean) {
        let reason = "";
        if (precisaMotivo) {
            const digitado = window.prompt("Motivo (o lojista vê este texto):");
            if (digitado === null) return;           // cancelou
            reason = digitado.trim();
            if (!reason) { setErro("O motivo é obrigatório."); return; }
        }

        setAgindo(adminId);
        setErro("");
        const res = await res_json("/api/pedido-ai-admin/contratacoes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminId, status, reason }),
        });
        setAgindo("");
        if (!res.ok) { setErro(res.data.error ?? "Erro ao atualizar."); return; }
        await carregar();
    }

    async function alternarWhiteLabel(adminId: string, atual: boolean) {
        setAgindo(adminId);
        setErro("");
        const res = await res_json("/api/pedido-ai-admin/contratacoes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminId, whiteLabel: !atual }),
        });
        setAgindo("");
        if (!res.ok) { setErro(res.data.error ?? "Erro ao atualizar."); return; }
        await carregar();
    }

    return (
        <div className="p-6 sm:p-10 max-w-[1100px] mx-auto">
            <header className="mb-8">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">PedidoAI · administração</p>
                <h1 className="text-[32px] leading-tight tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                    Contratações
                </h1>
            </header>

            <div className="flex flex-wrap items-center gap-2 mb-6">
                {FILTROS.map((f) => (
                    <button key={f.valor} onClick={() => setFiltro(f.valor)}
                            className={cn("h-9 px-4 rounded-full text-[13px] font-medium border transition-colors",
                                filtro === f.valor ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:border-muted-foreground")}>
                        {f.label}
                    </button>
                ))}
                <button onClick={carregar} className="h-9 px-3 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground inline-flex items-center gap-1.5 text-[13px]">
                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Atualizar
                </button>
            </div>

            {erro && <p className="mb-5 text-[13px] text-destructive">{erro}</p>}

            {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/70" />
            ) : lista.length === 0 ? (
                <p className="text-[14px] text-muted-foreground">Nenhuma contratação neste filtro.</p>
            ) : (
                <div className="space-y-4">
                    {lista.map((c) => (
                        <article key={c.adminId} className="rounded-2xl border border-border bg-card p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-[17px] font-semibold text-foreground">{c.loja.storeName ?? "(sem nome)"}</h2>
                                    <p className="text-[13px] text-muted-foreground">{c.email}</p>
                                </div>
                                <span className={cn("h-7 px-3 rounded-full border text-[11px] uppercase tracking-[0.14em] inline-flex items-center", BADGE[c.status])}>
                                    {c.status}
                                </span>
                            </div>

                            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] mb-4">
                                <div><dt className="text-muted-foreground">Endereço público</dt><dd className="text-foreground break-all">/loja/{c.loja.slug ?? "—"}</dd></div>
                                <div><dt className="text-muted-foreground">Telefone</dt><dd className="text-foreground">{c.loja.phone ?? "—"}</dd></div>
                                <div><dt className="text-muted-foreground">CNPJ</dt><dd className="text-foreground">{c.loja.cnpj ?? "—"}</dd></div>
                                <div><dt className="text-muted-foreground">Endereço</dt><dd className="text-foreground">{c.loja.address ?? "—"}</dd></div>
                                <div><dt className="text-muted-foreground">Pedido em</dt><dd className="text-foreground">{formatData(c.createdAt)}</dd></div>
                                <div><dt className="text-muted-foreground">Aceite</dt><dd className="text-foreground">{formatData(c.terms.acceptedAt)} · v{c.terms.version ?? "—"} · {c.terms.ip ?? "—"}</dd></div>
                            </dl>

                            {c.reason && (
                                <p className="text-[13px] text-muted-foreground mb-4"><span className="text-muted-foreground">Motivo:</span> {c.reason}</p>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {c.status === "pendente" && (
                                    <>
                                        <button onClick={() => mudar(c.adminId, "ativa", false)} disabled={agindo === c.adminId}
                                                className="h-10 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40">
                                            {agindo === c.adminId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Liberar
                                        </button>
                                        <button onClick={() => mudar(c.adminId, "recusada", true)} disabled={agindo === c.adminId}
                                                className="h-10 px-4 rounded-xl border border-border text-foreground text-[13px] font-semibold inline-flex items-center gap-1.5 hover:border-muted-foreground disabled:opacity-40">
                                            <X className="w-3.5 h-3.5" /> Recusar
                                        </button>
                                    </>
                                )}
                                {c.status === "ativa" && (
                                    <button onClick={() => mudar(c.adminId, "suspensa", true)} disabled={agindo === c.adminId}
                                            className="h-10 px-4 rounded-xl border border-border text-foreground text-[13px] font-semibold inline-flex items-center gap-1.5 hover:border-muted-foreground disabled:opacity-40">
                                        <PauseCircle className="w-3.5 h-3.5" /> Suspender
                                    </button>
                                )}
                                {c.status === "suspensa" && (
                                    <button onClick={() => mudar(c.adminId, "ativa", false)} disabled={agindo === c.adminId}
                                            className="h-10 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40">
                                        <PlayCircle className="w-3.5 h-3.5" /> Reativar
                                    </button>
                                )}
                                <button
                                    onClick={() => alternarWhiteLabel(c.adminId, c.loja.whiteLabel)}
                                    disabled={agindo === c.adminId}
                                    title="Esconde ou mostra o crédito 'desenvolvido por PedidoAI' nas telas desta loja"
                                    className="h-10 px-4 rounded-xl border border-border text-foreground text-[13px] font-semibold inline-flex items-center gap-1.5 hover:border-muted-foreground disabled:opacity-40"
                                >
                                    {c.loja.whiteLabel ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    {c.loja.whiteLabel ? "Marca oculta" : "Marca visível"}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

interface RespostaApi { error?: string; contratacoes?: Contratacao[] }

/** fetch + json numa forma só, para o componente não repetir try/catch. */
async function res_json(url: string, init?: RequestInit): Promise<{ ok: boolean; data: RespostaApi }> {
    try {
        const r = await fetch(url, init);
        const d = (await r.json().catch(() => ({}))) as RespostaApi;
        return { ok: r.ok, data: d };
    } catch {
        return { ok: false, data: { error: "Falha de rede." } };
    }
}
