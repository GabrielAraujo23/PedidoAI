"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Store, Phone, MapPin, Link2, Loader2, ArrowLeft, ArrowRight, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import { TERMS_TEXT, TERMS_VERSION } from "@/lib/terms";
import { LIMITS } from "@/lib/validators";

type Step = "conta" | "loja" | "endereco" | "contrato";

const STEPS: Step[] = ["conta", "loja", "endereco", "contrato"];

const inputClass =
    "w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-[15px] text-stone-900 placeholder:text-stone-400 outline-none transition-all duration-200 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 disabled:bg-stone-50 disabled:text-stone-500";

function Field({ icon: Icon, label, optional, children }: {
    icon?: React.ElementType; label: string; optional?: boolean; children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-stone-500">
                {Icon && <Icon className="w-3 h-3" />}
                {label}
                {optional && <span className="text-stone-400 text-[10px] normal-case tracking-normal font-normal">(opcional)</span>}
            </label>
            {children}
        </div>
    );
}

function maskPhone(v: string): string {
    let d = v.replace(/\D/g, "");
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCnpj(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 14);
    return d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function ContratarPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("conta");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");

    const [storeName, setStoreName] = useState("");
    const [cnpj, setCnpj] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");

    // O slug é derivado do nome mas editável: o lojista pode não querer o
    // nome inteiro na URL, e depois de liberada a loja o endereço já está
    // impresso em link de WhatsApp — mudar depois quebra o que ele espalhou.
    const [slug, setSlug] = useState("");
    const slugFinal = slugify(slug || storeName);

    const [accepted, setAccepted] = useState(false);

    function avancar(proximo: Step, valido: boolean, mensagem: string) {
        if (!valido) { setError(mensagem); return; }
        setError("");
        setStep(proximo);
    }

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        if (!accepted) { setError("É preciso aceitar o contrato para continuar."); return; }
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/contratar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim(), password,
                    storeName: storeName.trim(), cnpj: cnpj.trim(), phone: phone.trim(),
                    address: address.trim(), slug: slugFinal,
                    acceptedTerms: true,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error ?? "Erro ao enviar a contratação.");
                // Conflito de endereço volta ao passo em que se resolve.
                if (res.status === 409 && String(data.error ?? "").includes("endereço")) setStep("endereco");
                setLoading(false);
                return;
            }

            router.push("/contratar/status");
        } catch {
            setError("Erro ao enviar a contratação. Tente novamente.");
            setLoading(false);
        }
    }

    const indice = STEPS.indexOf(step);

    return (
        <div className="min-h-screen relative overflow-hidden bg-warm" style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}>
            <div aria-hidden className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full opacity-50"
                     style={{ background: "radial-gradient(circle at 30% 30%, #F0BC8E 0%, transparent 65%)" }} />
                <div className="absolute -bottom-32 -right-20 w-[420px] h-[420px] rounded-full opacity-40"
                     style={{ background: "radial-gradient(circle at 50% 50%, #D89B7A 0%, transparent 60%)" }} />
            </div>

            <header className="relative z-10 px-6 sm:px-10 pt-8 flex items-center justify-between">
                <Image src="/Logo_PedidoAi.png" alt="PedidoAI" width={280} height={153} className="w-[170px] sm:w-[240px] h-auto object-contain" />
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-stone-500">Contratação</span>
            </header>

            <main className="relative z-10 flex items-center justify-center px-6 py-10 sm:py-14">
                <div className="w-full max-w-[480px]">
                    <div className="flex items-center justify-center gap-1.5 mb-8">
                        {STEPS.map((s, i) => (
                            <div key={s} className={cn(
                                "h-1 rounded-full transition-all duration-500",
                                i === indice ? "w-6 bg-stone-900" : i < indice ? "w-3 bg-stone-400" : "w-1.5 bg-stone-300",
                            )} />
                        ))}
                    </div>

                    {error && (
                        <p className="flex items-start gap-1.5 text-xs text-red-600 mb-5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </p>
                    )}

                    {step === "conta" && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <div className="text-center mb-8">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Passo 1 de 4</p>
                                <h1 className="text-[38px] sm:text-[44px] leading-[1.0] tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                                    Sua <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>conta</em>.
                                </h1>
                            </div>
                            <div className="space-y-5">
                                <Field icon={Mail} label="E-mail">
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                           placeholder="voce@sualoja.com.br" autoComplete="email" autoFocus
                                           maxLength={LIMITS.email} className={inputClass} />
                                </Field>
                                <Field icon={Lock} label="Senha">
                                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                           placeholder="Mínimo 8 caracteres" autoComplete="new-password"
                                           maxLength={LIMITS.password_max} className={inputClass} />
                                </Field>
                                <Field icon={Lock} label="Confirme a senha">
                                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                           autoComplete="new-password" maxLength={LIMITS.password_max} className={inputClass} />
                                </Field>
                                <button
                                    onClick={() => avancar("loja",
                                        !!email.trim() && password.length >= LIMITS.password_min && password === confirm,
                                        password && password !== confirm ? "As senhas não conferem." : "Preencha e-mail e senha (mínimo 8 caracteres).")}
                                    className="group w-full h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all hover:bg-stone-800 active:scale-[0.99] shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
                                >
                                    Continuar <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <p className="text-center text-[12px] text-stone-500">
                                    Já tem conta? <Link href="/acesso" className="text-stone-900 underline underline-offset-2">Entrar</Link>
                                </p>
                            </div>
                        </section>
                    )}

                    {step === "loja" && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <div className="text-center mb-8">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Passo 2 de 4</p>
                                <h1 className="text-[38px] sm:text-[44px] leading-[1.0] tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                                    Sua <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>loja</em>.
                                </h1>
                            </div>
                            <div className="space-y-5">
                                <Field icon={Store} label="Nome da loja">
                                    <input value={storeName} onChange={(e) => setStoreName(e.target.value)}
                                           placeholder="Depósito Central" autoFocus maxLength={LIMITS.store_name} className={inputClass} />
                                </Field>
                                <Field icon={Store} label="CNPJ" optional>
                                    <input value={cnpj} onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                                           placeholder="00.000.000/0000-00" inputMode="numeric" maxLength={18} className={inputClass} />
                                </Field>
                                <Field icon={Phone} label="Telefone">
                                    <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))}
                                           placeholder="(11) 99999-9999" inputMode="tel" maxLength={15} className={inputClass} />
                                </Field>
                                <Field icon={MapPin} label="Endereço da loja">
                                    <input value={address} onChange={(e) => setAddress(e.target.value)}
                                           placeholder="Rua, número, bairro, cidade/UF" maxLength={LIMITS.street} className={inputClass} />
                                </Field>
                                <div className="flex gap-3">
                                    <button onClick={() => { setError(""); setStep("conta"); }}
                                            className="h-12 px-4 text-[13px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1.5">
                                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                                    </button>
                                    <button
                                        onClick={() => avancar("endereco",
                                            !!storeName.trim() && !!phone.trim() && !!address.trim(),
                                            "Preencha nome, telefone e endereço da loja.")}
                                        className="group flex-1 h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.99]"
                                    >
                                        Continuar <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {step === "endereco" && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <div className="text-center mb-8">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Passo 3 de 4</p>
                                <h1 className="text-[36px] sm:text-[42px] leading-[1.0] tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                                    Seu <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>link</em>.
                                </h1>
                                <p className="text-[14px] text-stone-600 mt-4 leading-relaxed">
                                    É o endereço que você manda pros clientes no WhatsApp.
                                </p>
                            </div>
                            <div className="space-y-5">
                                <Field icon={Link2} label="Endereço público">
                                    <input value={slug} onChange={(e) => setSlug(e.target.value)}
                                           placeholder={slugify(storeName) || "deposito-central"} autoFocus maxLength={40} className={inputClass} />
                                </Field>
                                <div className="px-3.5 py-3 rounded-xl bg-stone-100/70 border border-stone-200">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500 mb-1">Ficará assim</p>
                                    <p className="text-[14px] text-stone-900 break-all">/loja/{slugFinal || "—"}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => { setError(""); setStep("loja"); }}
                                            className="h-12 px-4 text-[13px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1.5">
                                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                                    </button>
                                    <button
                                        onClick={() => avancar("contrato", slugFinal.length >= 3,
                                            "Escolha um endereço com pelo menos 3 caracteres.")}
                                        className="group flex-1 h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.99]"
                                    >
                                        Continuar <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {step === "contrato" && (
                        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <div className="text-center mb-8">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 mb-3">Passo 4 de 4</p>
                                <h1 className="text-[36px] sm:text-[42px] leading-[1.0] tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                                    O <em className="font-medium text-orange-700" style={{ fontStyle: "italic" }}>contrato</em>.
                                </h1>
                            </div>
                            <form onSubmit={enviar} className="space-y-5">
                                <div className="max-h-[280px] overflow-y-auto px-4 py-3.5 rounded-xl border border-stone-200 bg-white/70">
                                    <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-stone-700 font-sans">{TERMS_TEXT}</pre>
                                    <p className="mt-3 text-[11px] text-stone-400">Versão {TERMS_VERSION}</p>
                                </div>

                                <label className="flex items-start gap-2.5 cursor-pointer">
                                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                                           className="mt-0.5 w-4 h-4 rounded border-stone-300 accent-stone-900" />
                                    <span className="text-[13px] text-stone-700 leading-relaxed">
                                        Li e aceito o contrato. Entendo que a liberação da loja depende de análise.
                                    </span>
                                </label>

                                <div className="flex gap-3">
                                    <button type="button" onClick={() => { setError(""); setStep("endereco"); }}
                                            className="h-12 px-4 text-[13px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1.5">
                                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                                    </button>
                                    <button type="submit" disabled={loading || !accepted}
                                            className="group flex-1 h-12 rounded-xl bg-stone-900 text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed">
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (<>Enviar contratação <Check className="w-4 h-4" /></>)}
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}
                </div>
            </main>

            <footer className="relative z-10 px-6 pb-6 text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-stone-400">PedidoAI · feito com ♡ no Brasil</p>
            </footer>
        </div>
    );
}
