"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Clock, XCircle, PauseCircle, LogOut } from "lucide-react";
import type { TenantStatus } from "@/lib/tenant-status";

interface StatusPayload {
    email: string;
    status: TenantStatus;
    reason: string | null;
    storeName: string | null;
    slug: string | null;
}

/** Texto por estado. A mesma tela serve aos três — só a explicação muda. */
const COPY: Record<Exclude<TenantStatus, "ativa">, {
    icon: React.ElementType; kicker: string; titulo: string; corpo: string; tom: string;
}> = {
    pendente: {
        icon: Clock, kicker: "Em análise", titulo: "Recebemos sua contratação.",
        corpo: "Estamos conferindo os dados da sua loja. Assim que for liberada, é só entrar por aqui — sua loja já estará no ar.",
        tom: "text-warning bg-warning-surface ring-warning/10",
    },
    recusada: {
        icon: XCircle, kicker: "Não aprovada", titulo: "Não pudemos liberar sua loja.",
        corpo: "A contratação não foi aprovada. Se quiser tentar de novo, será preciso fazer uma nova contratação.",
        tom: "text-destructive bg-destructive-surface ring-destructive/10",
    },
    suspensa: {
        icon: PauseCircle, kicker: "Suspensa", titulo: "Sua loja está suspensa.",
        corpo: "O acesso ao painel e o endereço público estão fora do ar. Seus dados estão preservados.",
        tom: "text-foreground bg-muted ring-border",
    },
};

export default function ContratarStatusPage() {
    const [data, setData] = useState<StatusPayload | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/contratar/status")
            .then((r) => r.json())
            .then((payload: StatusPayload) => {
                // Liberado enquanto esta aba estava aberta. A rota acabou de
                // reemitir o cookie com o status novo, então o painel agora
                // aceita a sessão — e esta tela não tem mais o que dizer.
                // Sem isto o lojista aprovado continuaria lendo "em análise".
                if (payload.status === "ativa") {
                    window.location.href = "/";
                    return;
                }
                setData(payload);
            })
            .catch(() => { /* a tela ainda diz algo sem os dados */ })
            .finally(() => setLoading(false));
    }, []);

    async function sair() {
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
        window.location.href = "/acesso";
    }

    const estado = data?.status && data.status !== "ativa" ? data.status : "pendente";
    const copy = COPY[estado];
    const Icon = copy.icon;

    return (
        <div className="min-h-screen relative overflow-hidden bg-warm" style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}>
            <div aria-hidden className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full opacity-50"
                     style={{ background: "radial-gradient(circle at 30% 30%, #F0BC8E 0%, transparent 65%)" }} />
            </div>

            <header className="relative z-10 px-6 sm:px-10 pt-8">
                <Image src="/Logo_PedidoAi.png" alt="PedidoAI" width={280} height={153} className="w-[170px] sm:w-[240px] h-auto object-contain" />
            </header>

            <main className="relative z-10 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-[480px] text-center">
                    {loading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70 mx-auto" />
                    ) : (
                        <>
                            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ring-8 mb-6 ${copy.tom}`}>
                                <Icon className="w-7 h-7" />
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-3">{copy.kicker}</p>
                            <h1 className="text-[36px] sm:text-[42px] leading-[1.05] tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                                {copy.titulo}
                            </h1>
                            <p className="text-[14px] text-muted-foreground mt-4 leading-relaxed">{copy.corpo}</p>

                            {data?.reason && (
                                <div className="mt-6 text-left px-4 py-3.5 rounded-xl border border-border bg-card/70">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Motivo</p>
                                    <p className="text-[14px] text-foreground leading-relaxed">{data.reason}</p>
                                </div>
                            )}

                            {(data?.storeName || data?.slug) && (
                                <div className="mt-4 text-left px-4 py-3.5 rounded-xl border border-border bg-card/70 space-y-2">
                                    {data.storeName && (
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Loja</p>
                                            <p className="text-[14px] text-foreground">{data.storeName}</p>
                                        </div>
                                    )}
                                    {data.slug && (
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Endereço reservado</p>
                                            <p className="text-[14px] text-foreground break-all">/loja/{data.slug}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button onClick={sair}
                                    className="mt-8 h-11 px-5 rounded-xl border border-border text-[13px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 inline-flex items-center justify-center gap-1.5 transition-colors">
                                <LogOut className="w-3.5 h-3.5" /> Sair
                            </button>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
