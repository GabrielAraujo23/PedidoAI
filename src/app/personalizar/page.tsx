"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Upload, Trash2, AlertCircle, Check, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { PaletaForm } from "@/components/paleta-form";

/**
 * /personalizar — como a loja aparece.
 *
 * Separada de /loja de propósito: lá ficam os dados de cadastro (CNPJ,
 * endereço, frete), aqui fica a identidade visual. "Quem sou eu" e "como eu
 * apareço" são perguntas diferentes, e juntá-las foi o que fez a logo ficar
 * enterrada num formulário de 1168 linhas.
 *
 * Nasce com uma seção só. É o contêiner onde a paleta de cores e o tema
 * claro/escuro vão entrar sem exigir outra reorganização.
 */
export default function PersonalizarPage() {
    const [logoUrl, setLogoUrl]   = useState("");
    const [carregando, setCarregando] = useState(true);
    const [ocupado, setOcupado]   = useState(false);
    const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch("/api/loja")
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { settings?: { logo_url?: string | null } | null } | null) => {
                setLogoUrl(d?.settings?.logo_url ?? "");
            })
            .catch(() => setAviso({ tipo: "erro", texto: "Não foi possível carregar suas configurações." }))
            .finally(() => setCarregando(false));
    }, []);

    /**
     * O arquivo vai para /api/loja/logo, não direto para o Storage.
     *
     * O caminho antigo enviava do navegador com a anon key, que está no bundle
     * público — e exigia um bucket que aceitasse escrita anônima, ou seja,
     * qualquer visitante despejando arquivo no storage. No servidor, a service
     * role escreve e o tenant sai da sessão assinada.
     */
    async function enviarLogo(file: File) {
        setOcupado(true);
        setAviso(null);
        try {
            const corpo = new FormData();
            corpo.append("file", file);
            const res = await fetch("/api/loja/logo", { method: "POST", body: corpo });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAviso({ tipo: "erro", texto: d.error ?? "Erro ao enviar a logo." });
                return;
            }
            setLogoUrl(d.logoUrl ?? "");
            setAviso({ tipo: "ok", texto: "Logo atualizada." });
        } catch {
            setAviso({ tipo: "erro", texto: "Erro ao enviar a logo. Tente novamente." });
        } finally {
            setOcupado(false);
        }
    }

    async function removerLogo() {
        setOcupado(true);
        setAviso(null);
        try {
            const res = await fetch("/api/loja/logo", { method: "DELETE" });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setAviso({ tipo: "erro", texto: d.error ?? "Erro ao remover a logo." });
                return;
            }
            setLogoUrl("");
            setAviso({ tipo: "ok", texto: "Logo removida." });
        } catch {
            setAviso({ tipo: "erro", texto: "Erro ao remover a logo. Tente novamente." });
        } finally {
            setOcupado(false);
        }
    }

    return (
        <div className="p-6 sm:p-10 max-w-[900px] mx-auto" style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}>
            <header className="mb-8">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">Sua loja</p>
                <h1 className="text-[32px] leading-tight tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                    Personalizar
                </h1>
                <p className="text-[14px] text-muted-foreground mt-2">
                    Como sua loja aparece para você e para seus clientes.
                </p>
            </header>

            {aviso && (
                <div className={cn(
                    "mb-6 flex items-start gap-2.5 px-4 py-3 rounded-xl border text-[13px]",
                    aviso.tipo === "ok"
                        ? "border-success/30 bg-success-surface text-success"
                        : "border-destructive/30 bg-destructive-surface text-destructive"
                )}>
                    {aviso.tipo === "ok" ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{aviso.texto}</span>
                </div>
            )}

            <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-[17px] font-semibold text-foreground">Identidade</h2>
                <p className="text-[13px] text-muted-foreground mt-1 mb-6">
                    Sua logo substitui a marca do PedidoAI no painel e nas telas dos seus clientes.
                    Sem logo, usamos o nome da sua loja.
                </p>

                {carregando ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/70" />
                ) : (
                    <div className="grid sm:grid-cols-2 gap-6">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-2">Arquivo</p>

                            <div className="h-28 rounded-xl border border-dashed border-border bg-muted flex items-center justify-center overflow-hidden mb-3">
                                {ocupado ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/70" />
                                ) : logoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- logo vem do Supabase Storage, domínio não declarado em next.config
                                    <img src={logoUrl} alt="Logo da loja" className="max-h-full max-w-full object-contain" />
                                ) : (
                                    <span className="text-[13px] text-muted-foreground/70">Nenhuma logo enviada</span>
                                )}
                            </div>

                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) enviarLogo(f);
                                    e.target.value = "";
                                }}
                            />

                            <div className="flex gap-2">
                                <button
                                    onClick={() => inputRef.current?.click()}
                                    disabled={ocupado}
                                    className="h-10 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40"
                                >
                                    <Upload className="w-3.5 h-3.5" /> {logoUrl ? "Trocar" : "Enviar logo"}
                                </button>
                                {logoUrl && (
                                    <button
                                        onClick={removerLogo}
                                        disabled={ocupado}
                                        className="h-10 px-4 rounded-xl border border-border text-foreground text-[13px] font-semibold inline-flex items-center gap-1.5 hover:border-muted-foreground disabled:opacity-40"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Remover
                                    </button>
                                )}
                            </div>

                            <p className="text-[12px] text-muted-foreground/70 mt-3 leading-relaxed">
                                PNG, JPG, WEBP ou SVG. Fundo transparente fica melhor sobre o tom claro do painel.
                            </p>
                        </div>

                        <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-2">Como vai aparecer</p>
                            {/* A prévia usa o BrandMark de verdade: o que ele vê aqui é o
                                componente que renderiza nas telas, não uma imitação que
                                pode divergir com o tempo. */}
                            <div className="rounded-xl border border-sidebar-border p-4 bg-sidebar/96 mb-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">No painel</p>
                                <BrandMark className="w-[180px] max-h-[52px]" textClassName="text-[20px]" />
                            </div>
                            <div className="rounded-xl border border-border p-4 bg-card">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">Para seus clientes</p>
                                <BrandMark className="h-8 max-w-[160px]" textClassName="text-[17px]" />
                            </div>
                            <p className="text-[12px] text-muted-foreground/70 mt-3 leading-relaxed">
                                A prévia atualiza ao recarregar a página.
                            </p>
                        </div>
                    </div>
                )}
            </section>

            <PaletaForm />

            <Link href="/loja" className="inline-flex items-center gap-1.5 mt-6 text-[13px] text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3.5 h-3.5" /> Dados da loja
            </Link>
        </div>
    );
}
