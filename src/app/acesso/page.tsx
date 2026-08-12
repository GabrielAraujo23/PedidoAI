"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Mail, Lock, AlertCircle, Loader2, ShieldCheck,
    ArrowLeft, KeyRound, Eye, EyeOff, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { validateEmail, validatePassword } from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";
import { useAuth } from "@/lib/auth-context";
import { isAdminRole } from "@/lib/tenant-status";

type Mode = "signin" | "forgot_email" | "forgot_code" | "forgot_newpass";

const inputClass =
    "w-full h-11 pl-10 pr-3.5 rounded-xl border border-input bg-background text-[14.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-all duration-200 focus:border-ring focus:ring-4 focus:ring-ring/20 disabled:bg-muted";

const eyebrowClass =
    "text-[11px] uppercase tracking-[0.22em] font-semibold text-muted-foreground";

function ErrorMsg({ text }: { text: string }) {
    return (
        <div className="flex items-start gap-2 text-[12.5px] text-destructive bg-destructive-surface/80 border border-destructive/30 px-3.5 py-2.5 rounded-xl">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{text}</span>
        </div>
    );
}

function InfoMsg({ text }: { text: string }) {
    return (
        <div className="flex items-start gap-2 text-[12.5px] text-success bg-success-surface/80 border border-success/30 px-3.5 py-2.5 rounded-xl">
            <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 shrink-0" />
            <span>{text}</span>
        </div>
    );
}

export default function AcessoPage() {
    const { setAdminSession } = useAuth();
    const [mode, setMode] = useState<Mode>("signin");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPwd, setShowPwd] = useState(false);

    const [resetEmail, setResetEmail] = useState("");
    const [resetCode, setResetCode] = useState("");
    const [newPass, setNewPass] = useState("");
    const [newPassConfirm, setNewPassConfirm] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");

    const router = useRouter();

    function saveSession(adminId: string, email: string, role: unknown) {
        // Papel desconhecido cai em "lojista": errar para menos apenas esconde
        // um link, enquanto errar para mais mostraria um item que leva a 403.
        setAdminSession({ adminId, email, role: isAdminRole(role) ? role : "lojista" });
    }

    async function handleSignIn(e: React.FormEvent) {
        e.preventDefault();
        const emailVal = validateEmail(email);
        if (!emailVal.ok) { setError(emailVal.error); return; }
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "signin", email, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                logEvent({ event_type: "admin_login_failure", actor_type: "admin" });
                setError(data.error ?? "Credenciais inválidas.");
                setLoading(false);
                return;
            }

            logEvent({ event_type: "admin_login_success", actor_type: "admin", actor_id: data.adminId });
            saveSession(data.adminId, data.email, data.role);
            router.push("/");
        } catch {
            setError("Erro de conexão. Tente novamente.");
            setLoading(false);
        }
    }

    async function handleForgotEmail(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await fetch("/api/auth/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "forgot_request", email: resetEmail }),
            });
            logEvent({ event_type: "admin_password_reset_requested", actor_type: "admin" });
            setMode("forgot_code");
        } catch {
            setMode("forgot_code");
        } finally {
            setLoading(false);
        }
    }

    async function handleVerifyCode(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "forgot_verify", email: resetEmail, code: resetCode }),
            });
            const data = await res.json();

            if (!res.ok) {
                logEvent({ event_type: "admin_password_reset_code_failed", actor_type: "admin" });
                setError(data.error ?? "Código inválido ou expirado.");
                setLoading(false);
                return;
            }

            setMode("forgot_newpass");
        } catch {
            setError("Erro de conexão. Tente novamente.");
        } finally {
            setLoading(false);
        }
    }

    async function handleNewPassword(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (newPass !== newPassConfirm) { setError("As senhas não coincidem."); return; }
        const pwdVal = validatePassword(newPass);
        if (!pwdVal.ok) { setError(pwdVal.error); return; }

        setLoading(true);

        try {
            const res = await fetch("/api/auth/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "forgot_reset", email: resetEmail, code: resetCode, password: newPass }),
            });
            const data = await res.json();

            if (!res.ok) {
                logError("admin_password_reset", data.error);
                setError(data.error ?? "Erro ao atualizar senha.");
                setLoading(false);
                return;
            }

            logEvent({ event_type: "admin_password_reset_completed", actor_type: "admin" });
            setEmail(resetEmail);
            setPassword("");
            setResetEmail("");
            setResetCode("");
            setNewPass("");
            setNewPassConfirm("");
            setMode("signin");
            setInfo("Senha redefinida com sucesso. Faça login.");
        } catch {
            setError("Erro de conexão. Tente novamente.");
        } finally {
            setLoading(false);
        }
    }

    function switchMode(m: Mode) {
        setMode(m);
        setError("");
        setInfo("");
    }

    function goBack() {
        setError("");
        if (mode === "forgot_code") switchMode("forgot_email");
        else if (mode === "forgot_newpass") switchMode("forgot_code");
        else switchMode("signin");
    }

    const meta = (() => {
        switch (mode) {
            case "signin":
                return {
                    eyebrow: "Acesso restrito",
                    title: <>Bem-vindo de <em className="font-medium text-primary" style={{ fontStyle: "italic" }}>volta.</em></>,
                    sub: "Entre na sua conta administrativa.",
                };
            case "forgot_email":
                return {
                    eyebrow: "Recuperação",
                    title: <>Esqueceu a <em className="font-medium text-primary" style={{ fontStyle: "italic" }}>senha?</em></>,
                    sub: "Vamos gerar um código de recuperação.",
                };
            case "forgot_code":
                return {
                    eyebrow: "Verificação",
                    title: <>Insira o <em className="font-medium text-primary" style={{ fontStyle: "italic" }}>código.</em></>,
                    sub: "Cheque seu email pelo código enviado.",
                };
            case "forgot_newpass":
                return {
                    eyebrow: "Última etapa",
                    title: <>Defina sua <em className="font-medium text-primary" style={{ fontStyle: "italic" }}>nova senha.</em></>,
                    sub: "Escolha uma combinação forte e única.",
                };
        }
    })();

    return (
        <div
            className="min-h-screen relative overflow-hidden bg-warm"
            style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui" }}
        >
            {/* Soft warm blooms */}
            <div aria-hidden className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full opacity-50"
                     style={{ background: "radial-gradient(circle at 50% 50%, #F0BC8E 0%, transparent 65%)" }} />
                <div className="absolute -bottom-32 -left-20 w-[420px] h-[420px] rounded-full opacity-40"
                     style={{ background: "radial-gradient(circle at 50% 50%, #D89B7A 0%, transparent 60%)" }} />
            </div>

            {/* Top brand bar */}
            <header className="relative z-10 px-6 sm:px-10 pt-8 flex items-center justify-between">
                <div className="flex items-center">
                    <Image src="/Logo_PedidoAi.png" alt="PedidoAI" width={280} height={153} className="w-[280px] h-auto object-contain" />
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                    <ShieldCheck className="w-3 h-3 text-primary" />
                    Acesso Restrito
                </span>
            </header>

            <main className="relative z-10 flex items-center justify-center px-6 py-10 sm:py-16">
                <div className="w-full max-w-[440px]">

                    {/* Heading */}
                    <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                        <div className="text-center mb-8">
                            <p className={cn(eyebrowClass, "mb-3")}>{meta.eyebrow}</p>
                            <h1
                                className="text-[40px] sm:text-[48px] leading-[0.96] tracking-tight text-foreground"
                                style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                            >
                                {meta.title}
                            </h1>
                            <p className="text-[14px] text-muted-foreground mt-4 max-w-[340px] mx-auto leading-relaxed">
                                {meta.sub}
                            </p>
                        </div>

                        {/* SIGN IN */}
                        {mode === "signin" && (
                            <>
                                <form onSubmit={handleSignIn} className="space-y-4">
                                    <FieldEmail value={email} onChange={setEmail} disabled={loading} />
                                    <FieldPassword
                                        value={password} onChange={setPassword}
                                        show={showPwd} toggleShow={() => setShowPwd((v) => !v)}
                                        placeholder="••••••••" autoComplete="current-password"
                                        disabled={loading}
                                    />
                                    {error && <ErrorMsg text={error} />}
                                    {info && <InfoMsg text={info} />}
                                    <PrimaryButton
                                        loading={loading}
                                        disabled={!email.trim() || !password.trim()}
                                        label="Entrar"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { setResetEmail(""); switchMode("forgot_email"); }}
                                        className="w-full text-center text-[12.5px] text-muted-foreground hover:text-foreground transition-colors pt-1"
                                    >
                                        Esqueci minha senha
                                    </button>
                                </form>
                                <p className="text-center text-[12px] text-muted-foreground mt-6">
                                    Ainda não tem loja no PedidoAI?{" "}
                                    <Link href="/contratar" className="text-foreground underline underline-offset-2">
                                        Contratar
                                    </Link>
                                </p>
                            </>
                        )}

                        {/* FORGOT — email */}
                        {mode === "forgot_email" && (
                            <form onSubmit={handleForgotEmail} className="space-y-4">
                                <FieldEmail value={resetEmail} onChange={setResetEmail} disabled={loading} autoFocus />
                                {error && <ErrorMsg text={error} />}
                                <PrimaryButton
                                    loading={loading}
                                    disabled={!resetEmail.trim()}
                                    label="Gerar código"
                                />
                                <BackButton onClick={goBack} label="Voltar ao login" />
                            </form>
                        )}

                        {/* FORGOT — code */}
                        {mode === "forgot_code" && (
                            <form onSubmit={handleVerifyCode} className="space-y-4">
                                <div className="bg-muted/80 border border-border/60 rounded-xl px-4 py-3">
                                    <p className="text-[12.5px] text-foreground/80 leading-relaxed">
                                        Se o email estiver cadastrado, você receberá um código.
                                    </p>
                                    <p className="text-[11.5px] text-muted-foreground mt-1">
                                        Verifique caixa de entrada e spam.
                                    </p>
                                </div>
                                <Field icon={KeyRound} label="Código de recuperação">
                                    <input
                                        type="text" placeholder="Cole o código aqui"
                                        value={resetCode}
                                        onChange={(e) => setResetCode(e.target.value.trim().slice(0, 64))}
                                        className={cn(inputClass, "font-mono text-[13px] tracking-wide")}
                                        maxLength={64} autoFocus disabled={loading}
                                    />
                                </Field>
                                {error && <ErrorMsg text={error} />}
                                <PrimaryButton
                                    loading={loading}
                                    disabled={resetCode.length < 16}
                                    label="Verificar código"
                                />
                                <BackButton onClick={goBack} label="Voltar" />
                            </form>
                        )}

                        {/* FORGOT — new password */}
                        {mode === "forgot_newpass" && (
                            <form onSubmit={handleNewPassword} className="space-y-4">
                                <FieldPassword
                                    value={newPass} onChange={setNewPass}
                                    show={showPwd} toggleShow={() => setShowPwd((v) => !v)}
                                    placeholder="Mínimo 6 caracteres"
                                    autoComplete="new-password" autoFocus disabled={loading}
                                    label="Nova senha"
                                />
                                <Field icon={Lock} label="Confirmar nova senha">
                                    <input
                                        type="password" placeholder="Repita a nova senha"
                                        value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)}
                                        className={inputClass}
                                        autoComplete="new-password" disabled={loading}
                                    />
                                </Field>
                                {error && <ErrorMsg text={error} />}
                                <PrimaryButton
                                    loading={loading}
                                    disabled={!newPass.trim() || !newPassConfirm.trim()}
                                    label="Redefinir senha"
                                />
                            </form>
                        )}
                    </section>
                </div>
            </main>

            <footer className="relative z-10 pb-6 text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
                    URL não divulgada · acesso interno
                </p>
            </footer>
        </div>
    );
}

/* ─── Reusable bits ─────────────────────────────────────────────────────── */

function Field({
    icon: Icon, label, children,
}: {
    icon: React.ElementType;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
                <Icon className="w-3 h-3" />
                {label}
            </label>
            {children}
        </div>
    );
}

function FieldEmail({
    value, onChange, disabled = false, autoFocus = false,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    autoFocus?: boolean;
}) {
    return (
        <Field icon={Mail} label="Email">
            <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
                <input
                    type="email" placeholder="admin@loja.com"
                    value={value} onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                    autoComplete="email" disabled={disabled} autoFocus={autoFocus}
                />
            </div>
        </Field>
    );
}

function FieldPassword({
    value, onChange, show, toggleShow, placeholder, autoComplete, disabled = false,
    autoFocus = false, label = "Senha",
}: {
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    toggleShow: () => void;
    placeholder: string;
    autoComplete: string;
    disabled?: boolean;
    autoFocus?: boolean;
    label?: string;
}) {
    return (
        <Field icon={Lock} label={label}>
            <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
                <input
                    type={show ? "text" : "password"}
                    placeholder={placeholder}
                    value={value} onChange={(e) => onChange(e.target.value)}
                    className={cn(inputClass, "pr-10")}
                    autoComplete={autoComplete} disabled={disabled} autoFocus={autoFocus}
                />
                <button
                    type="button" onClick={toggleShow}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
        </Field>
    );
}

function PrimaryButton({
    loading, disabled, label,
}: {
    loading: boolean;
    disabled: boolean;
    label: string;
}) {
    return (
        <button
            type="submit"
            disabled={loading || disabled}
            className="group w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(28,25,23,0.18)]"
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <>
                    {label}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
            )}
        </button>
    );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full h-10 text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition-colors"
        >
            <ArrowLeft className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}
