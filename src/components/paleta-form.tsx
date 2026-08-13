"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    FAMILIAS, PALETTE_FAMILIES, NOMES_FAMILIA, ACENTO_PADRAO,
    avaliarAcento, isHex, isPaletteFamily, textoSobre,
    type PaletteFamily, type TemaAplicado,
} from "@/lib/palette";

/**
 * Escolha de cor da loja.
 *
 * A prévia mostra os DOIS temas lado a lado de propósito: a mesma cor de
 * marca vira uma variação diferente em cada tema — nenhum fundo único é
 * legível contra branco-quase-puro e preto-quase-puro ao mesmo tempo — e o
 * lojista, olhando só o tema em que está, não pensaria nisso sozinho.
 *
 * Nenhuma cor "reprova". `avaliarAcento` sempre devolve uma variação usável
 * para cada tema; o aviso abaixo só informa quando essa variação difere da
 * cor que o lojista escolheu.
 */
export function PaletaForm() {
    const [familia, setFamilia] = useState<PaletteFamily>("creme");
    const [acento, setAcento]   = useState<string>(ACENTO_PADRAO);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

    useEffect(() => {
        fetch("/api/loja")
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { settings?: { palette_family?: string; accent_color?: string | null } | null } | null) => {
                const f = d?.settings?.palette_family;
                if (isPaletteFamily(f)) setFamilia(f);
                const a = d?.settings?.accent_color;
                if (isHex(a)) setAcento(a);
            })
            .catch(() => setAviso({ tipo: "erro", texto: "Não foi possível carregar suas cores." }))
            .finally(() => setCarregando(false));
    }, []);

    const avaliacao = avaliarAcento(acento, familia);
    const adaptados = (["claro", "escuro"] as const).filter((t) => avaliacao[t].adaptado);

    async function salvar() {
        setSalvando(true);
        setAviso(null);
        try {
            const res = await fetch("/api/loja", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    palette_family: familia,
                    accent_color: acento === ACENTO_PADRAO ? null : acento,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setAviso({ tipo: "erro", texto: d.error ?? "Erro ao salvar as cores." });
                return;
            }
            setAviso({ tipo: "ok", texto: "Cores salvas. Recarregue para ver em todo o painel." });
        } catch {
            setAviso({ tipo: "erro", texto: "Erro ao salvar. Tente novamente." });
        } finally {
            setSalvando(false);
        }
    }

    if (carregando) {
        return (
            <section className="rounded-2xl border border-border bg-card p-6 mt-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </section>
        );
    }

    return (
        <section className="rounded-2xl border border-border bg-card p-6 mt-6">
            <h2 className="text-[17px] font-semibold text-foreground">Cores</h2>
            <p className="text-[13px] text-muted-foreground mt-1 mb-6">
                Valem no seu painel e nas telas dos seus clientes, nos temas claro e escuro.
            </p>

            {/* Família */}
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-2">Fundo</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {PALETTE_FAMILIES.map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFamilia(f)}
                        className={cn(
                            "rounded-xl border p-3 text-left transition-colors cursor-pointer",
                            familia === f ? "border-foreground" : "border-border hover:border-muted-foreground"
                        )}
                    >
                        <div className="flex gap-1 mb-2">
                            <span className="w-5 h-5 rounded-md border border-border" style={{ background: FAMILIAS[f].claro.background }} />
                            <span className="w-5 h-5 rounded-md border border-border" style={{ background: FAMILIAS[f].escuro.background }} />
                        </div>
                        <span className="text-[13px] font-medium text-foreground">{NOMES_FAMILIA[f]}</span>
                    </button>
                ))}
            </div>

            {/* Acento */}
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-2">Cor da marca</p>
            <div className="flex items-center gap-3 mb-4">
                <input
                    type="color"
                    value={acento}
                    onChange={(e) => setAcento(e.target.value.toUpperCase())}
                    className="w-12 h-10 rounded-lg border border-border bg-card cursor-pointer"
                    aria-label="Escolher a cor da marca"
                />
                <input
                    type="text"
                    value={acento}
                    onChange={(e) => {
                        const v = e.target.value.toUpperCase();
                        if (/^#[0-9A-F]{0,6}$/.test(v)) setAcento(v);
                    }}
                    maxLength={7}
                    className="h-10 w-32 px-3 rounded-xl border border-input bg-background text-[14px] font-mono text-foreground"
                />
                <button
                    type="button"
                    onClick={() => setAcento(ACENTO_PADRAO)}
                    className="h-10 px-3 rounded-xl border border-border text-[13px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                    Usar o padrão
                </button>
            </div>

            {/* Aviso de adaptação — informativo, não bloqueio: cada tema sempre
                recebe uma variação usável da cor escolhida. */}
            {isHex(acento) && adaptados.length > 0 && (
                <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border border-warning/30 bg-warning-surface text-[13px]">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                    <div className="flex-1 text-foreground">
                        {adaptados.map((tema) => (
                            <p key={tema} className="flex items-center gap-2">
                                <span>
                                    No tema {tema} usamos uma variação {tema === "escuro" ? "mais clara" : "mais escura"} da
                                    sua cor, para continuar legível:
                                </span>
                                <span
                                    className="inline-flex items-center gap-1.5 font-mono text-[12px] font-semibold"
                                >
                                    <span
                                        className="w-3.5 h-3.5 rounded-full border border-border shrink-0"
                                        style={{ background: avaliacao[tema].cor }}
                                    />
                                    {avaliacao[tema].cor}
                                </span>
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* Prévia nos dois temas */}
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-2">Como vai ficar</p>
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
                {(["claro", "escuro"] as const).map((tema) => (
                    <Previa key={tema} tema={tema} familia={familia} cor={avaliacao[tema].cor} />
                ))}
            </div>

            {aviso && (
                <p className={cn("text-[13px] mb-3", aviso.tipo === "ok" ? "text-success" : "text-destructive")}>
                    {aviso.texto}
                </p>
            )}

            <button
                type="button"
                onClick={salvar}
                disabled={salvando || !isHex(acento)}
                className="h-10 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Salvar cores
            </button>
        </section>
    );
}

/**
 * Amostra de um tema, pintada com valores diretos — não herda o tema da
 * página. `cor` já vem avaliada por tema (`avaliarAcento(...)[tema].cor`),
 * não a cor crua escolhida pelo lojista.
 */
function Previa({ tema, familia, cor }: { tema: TemaAplicado; familia: PaletteFamily; cor: string }) {
    const v = FAMILIAS[familia][tema];
    return (
        <div className="rounded-xl border border-border overflow-hidden">
            <div style={{ background: v.background }} className="p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: v.mutedForeground }}>
                    Tema {tema}
                </p>
                <div style={{ background: v.card, borderColor: v.border }} className="rounded-lg border p-3">
                    <p className="text-[14px] font-semibold mb-1" style={{ color: v.foreground }}>Pedido #1042</p>
                    <p className="text-[12px] mb-3" style={{ color: v.mutedForeground }}>3 itens · entrega hoje</p>
                    <span
                        className="inline-flex items-center h-7 px-3 rounded-lg text-[12px] font-semibold"
                        style={{ background: cor, color: textoSobre(cor) }}
                    >
                        Confirmar
                    </span>
                </div>
            </div>
        </div>
    );
}
