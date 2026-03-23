"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Mail, Lock, AlertCircle, Loader2, ShieldCheck,
    ArrowLeft, KeyRound, Eye, EyeOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { generateSecureToken, validateEmail, validatePassword } from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ADMIN_SESSION_KEY, useAuth } from "@/lib/auth-context";

type Mode = "signin" | "signup" | "forgot_email" | "forgot_code" | "forgot_newpass";

function ErrorMsg({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {text}
        </div>
    );
}

function InfoMsg({ text }: { text: string }) {
    return (
        <div className="text-sm text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20 text-center">
            {text}
        </div>
    );
}

export default function AcessoPage() {
    const { setAdminSession } = useAuth();
    const [mode, setMode] = useState<Mode>("signin");

    // Sign in / sign up fields
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPwd, setShowPwd] = useState(false);

    // Forgot password fields
    const [resetEmail, setResetEmail] = useState("");
    const [resetCode, setResetCode] = useState("");
    const [generatedCode, setGeneratedCode] = useState("");
    const [newPass, setNewPass] = useState("");
    const [newPassConfirm, setNewPassConfirm] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");

    const router = useRouter();

    function saveSession(adminId: string, email: string) {
        const session = { adminId, email };
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
        document.cookie = "pedidoai_admin=1; path=/; SameSite=Strict; Max-Age=86400";
        setAdminSession(session);
    }

    // ── Sign In ───────────────────────────────────────────────────────────────
    async function handleSignIn(e: React.FormEvent) {
        e.preventDefault();
        const emailVal = validateEmail(email);
        if (!emailVal.ok) { setError(emailVal.error); return; }
        setLoading(true);
        setError("");

        const { data: admin } = await supabase
            .from("admins")
            .select("id, email, password_hash")
            .eq("email", email.trim().toLowerCase())
            .single();

        if (!admin || !admin.password_hash) {
            logEvent({ event_type: "admin_login_failure", actor_type: "admin", metadata: { reason: "email_not_found" } });
            setError("Email não encontrado.");
            setLoading(false);
            return;
        }

        const valid = await verifyPassword(password, admin.password_hash);
        if (!valid) {
            logEvent({ event_type: "admin_login_failure", actor_type: "admin", actor_id: admin.id, metadata: { reason: "wrong_password" } });
            setError("Senha incorreta.");
            setLoading(false);
            return;
        }

        logEvent({ event_type: "admin_login_success", actor_type: "admin", actor_id: admin.id });
        saveSession(admin.id, admin.email);
        router.push("/");
    }

    // ── Sign Up ───────────────────────────────────────────────────────────────
    async function handleSignUp(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (password !== confirm) { setError("As senhas não coincidem."); return; }
        const pwdVal = validatePassword(password);
        if (!pwdVal.ok) { setError(pwdVal.error); return; }

        setLoading(true);

        // Email must already exist in `admins` (pre-approved by a superadmin)
        // but must not yet have a password set.
        const { data: existing } = await supabase
            .from("admins")
            .select("id, email, password_hash")
            .eq("email", email.trim().toLowerCase())
            .single();

        if (!existing) {
            logEvent({ event_type: "admin_unauthorized_signup", actor_type: "admin" });
            setError("Email não autorizado. Contate o administrador do sistema.");
            setLoading(false);
            return;
        }

        if (existing.password_hash) {
            logEvent({ event_type: "admin_unauthorized_signup", actor_type: "admin", actor_id: existing.id, metadata: { reason: "already_has_password" } });
            setError("Este email já possui uma senha cadastrada. Use a opção de login.");
            setLoading(false);
            return;
        }

        const password_hash = await hashPassword(password);

        const { error: updateError } = await supabase
            .from("admins")
            .update({ password_hash })
            .eq("id", existing.id);

        if (updateError) {
            logError("admin_signup", updateError);
            setError("Erro ao definir senha. Tente novamente.");
            setLoading(false);
            return;
        }

        logEvent({ event_type: "admin_signup_completed", actor_type: "admin", actor_id: existing.id });
        saveSession(existing.id, existing.email);
        router.push("/");
    }

    // ── Forgot: request code ─────────────────────────────────────────────────
    async function handleForgotEmail(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");

        const { data: admin } = await supabase
            .from("admins")
            .select("id")
            .eq("email", resetEmail.trim().toLowerCase())
            .single();

        if (!admin) {
            // Don't reveal whether email exists — log silently
            setGeneratedCode("");
            setMode("forgot_code");
            setLoading(false);
            return;
        }

        const code = generateSecureToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

        await supabase
            .from("admins")
            .update({ reset_token: code, reset_expires: expires })
            .eq("email", resetEmail.trim().toLowerCase());

        logEvent({ event_type: "admin_password_reset_requested", actor_type: "admin", actor_id: admin.id });
        setGeneratedCode(code);
        setMode("forgot_code");
        setLoading(false);
    }

    // ── Forgot: verify code ──────────────────────────────────────────────────
    async function handleVerifyCode(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");

        const { data: admin } = await supabase
            .from("admins")
            .select("reset_token, reset_expires")
            .eq("email", resetEmail.trim().toLowerCase())
            .single();

        if (
            !admin ||
            admin.reset_token !== resetCode.trim() ||
            new Date(admin.reset_expires) < new Date()
        ) {
            logEvent({ event_type: "admin_password_reset_code_failed", actor_type: "admin" });
            setError("Código inválido ou expirado.");
            setLoading(false);
            return;
        }

        setMode("forgot_newpass");
        setLoading(false);
    }

    // ── Forgot: set new password ─────────────────────────────────────────────
    async function handleNewPassword(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (newPass !== newPassConfirm) { setError("As senhas não coincidem."); return; }
        const pwdVal = validatePassword(newPass);
        if (!pwdVal.ok) { setError(pwdVal.error); return; }

        setLoading(true);

        const password_hash = await hashPassword(newPass);

        const { error: updateError } = await supabase
            .from("admins")
            .update({ password_hash, reset_token: null, reset_expires: null })
            .eq("email", resetEmail.trim().toLowerCase());

        if (updateError) {
            logError("admin_password_reset", updateError);
            setError("Erro ao atualizar senha. Tente novamente.");
            setLoading(false);
            return;
        }

        logEvent({ event_type: "admin_password_reset_completed", actor_type: "admin" });
        // Return to sign in with pre-filled email and success message
        setEmail(resetEmail);
        setPassword("");
        setResetEmail("");
        setResetCode("");
        setGeneratedCode("");
        setNewPass("");
        setNewPassConfirm("");
        setMode("signin");
        setInfo("Senha redefinida com sucesso! Faça login.");
        setLoading(false);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
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

    const isForgot = mode.startsWith("forgot");

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="w-full max-w-md space-y-8">

                {/* Logo */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-primary rounded-3xl flex items-center justify-center shadow-xl shadow-primary/30">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-white">PedidoAI</h1>
                        <p className="text-slate-400 text-sm">Acesso Administrativo</p>
                    </div>
                </div>

                <Card className="bg-white/5 border border-white/10 backdrop-blur shadow-2xl">

                    {/* Tab selector (only on signin/signup) */}
                    {!isForgot && (
                        <div className="px-6 pt-6">
                            <div className="flex rounded-xl bg-white/5 p-1 gap-1">
                                {(["signin", "signup"] as const).map((m) => (
                                    <button
                                        key={m}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? "bg-primary text-white shadow" : "text-slate-400 hover:text-white"}`}
                                        onClick={() => switchMode(m)}
                                    >
                                        {m === "signin" ? "Entrar" : "Criar conta"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── SIGN IN ── */}
                    {mode === "signin" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg text-white">Login de Administrador</CardTitle>
                                <CardDescription className="text-slate-400">
                                    Acesse o painel de gestão da sua loja.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
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
                                    <Button
                                        type="submit"
                                        disabled={loading || !email.trim() || !password.trim()}
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
                                    </Button>
                                    <button
                                        type="button"
                                        className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors pt-1"
                                        onClick={() => { setResetEmail(""); setGeneratedCode(""); switchMode("forgot_email"); }}
                                    >
                                        Esqueci minha senha
                                    </button>
                                </form>
                            </CardContent>
                        </>
                    )}

                    {/* ── SIGN UP ── */}
                    {mode === "signup" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg text-white">Novo Administrador</CardTitle>
                                <CardDescription className="text-slate-400">
                                    Defina a senha para um email pré-autorizado pelo administrador do sistema.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSignUp} className="space-y-4">
                                    <FieldEmail value={email} onChange={setEmail} disabled={loading} />
                                    <FieldPassword
                                        value={password} onChange={setPassword}
                                        show={showPwd} toggleShow={() => setShowPwd((v) => !v)}
                                        placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                                        disabled={loading}
                                    />
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Confirmar Senha</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                type="password" placeholder="Repita a senha"
                                                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-11 focus-visible:ring-primary"
                                                autoComplete="new-password" disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    {error && <ErrorMsg text={error} />}
                                    <Button
                                        type="submit"
                                        disabled={loading || !email.trim() || !password.trim() || !confirm.trim()}
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Conta Admin"}
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}

                    {/* ── FORGOT: enter email ── */}
                    {mode === "forgot_email" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg text-white">Recuperar Senha</CardTitle>
                                <CardDescription className="text-slate-400">
                                    Digite o email da sua conta de administrador.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleForgotEmail} className="space-y-4">
                                    <FieldEmail value={resetEmail} onChange={setResetEmail} disabled={loading} autoFocus />
                                    {error && <ErrorMsg text={error} />}
                                    <Button
                                        type="submit"
                                        disabled={loading || !resetEmail.trim()}
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar Código"}
                                    </Button>
                                    <BackButton onClick={goBack} label="Voltar ao login" />
                                </form>
                            </CardContent>
                        </>
                    )}

                    {/* ── FORGOT: enter code ── */}
                    {mode === "forgot_code" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg text-white">Digite o Código</CardTitle>
                                <CardDescription className="text-slate-400">
                                    Insira o código de recuperação gerado para o email.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleVerifyCode} className="space-y-4">
                                    {/* Prototype: show code on screen */}
                                    {generatedCode && (
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                                            <p className="text-xs text-amber-400 font-medium mb-1">
                                                Código gerado (protótipo)
                                            </p>
                                            <p className="text-sm font-mono font-bold text-amber-300 break-all">
                                                {generatedCode}
                                            </p>
                                            <p className="text-[11px] text-amber-500 mt-1">
                                                Em produção seria enviado para {resetEmail}
                                            </p>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Código de recuperação</Label>
                                        <div className="relative">
                                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                type="text" placeholder="Cole o código aqui"
                                                value={resetCode}
                                                onChange={(e) => setResetCode(e.target.value.trim().slice(0, 64))}
                                                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-11 font-mono text-sm focus-visible:ring-primary"
                                                maxLength={64} autoFocus disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    {error && <ErrorMsg text={error} />}
                                    <Button
                                        type="submit"
                                        disabled={loading || resetCode.length < 16}
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verificar Código"}
                                    </Button>
                                    <BackButton onClick={goBack} label="Voltar" />
                                </form>
                            </CardContent>
                        </>
                    )}

                    {/* ── FORGOT: new password ── */}
                    {mode === "forgot_newpass" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg text-white">Nova Senha</CardTitle>
                                <CardDescription className="text-slate-400">
                                    Crie uma nova senha para sua conta administrativa.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleNewPassword} className="space-y-4">
                                    <FieldPassword
                                        value={newPass} onChange={setNewPass}
                                        show={showPwd} toggleShow={() => setShowPwd((v) => !v)}
                                        placeholder="Nova senha (mín. 6 caracteres)"
                                        autoComplete="new-password" autoFocus disabled={loading}
                                        label="Nova Senha"
                                    />
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Confirmar Nova Senha</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                type="password" placeholder="Repita a nova senha"
                                                value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)}
                                                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-11 focus-visible:ring-primary"
                                                autoComplete="new-password" disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    {error && <ErrorMsg text={error} />}
                                    <Button
                                        type="submit"
                                        disabled={loading || !newPass.trim() || !newPassConfirm.trim()}
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redefinir Senha"}
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}
                </Card>

                <p className="text-center text-xs text-slate-600">
                    Acesso restrito — URL não divulgada publicamente
                </p>
            </div>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldEmail({
    value, onChange, disabled = false, autoFocus = false,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    autoFocus?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label className="text-slate-300">Email</Label>
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                    type="email" placeholder="admin@loja.com"
                    value={value} onChange={(e) => onChange(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-11 focus-visible:ring-primary"
                    autoComplete="email" disabled={disabled} autoFocus={autoFocus}
                />
            </div>
        </div>
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
        <div className="space-y-2">
            <Label className="text-slate-300">{label}</Label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                    type={show ? "text" : "password"}
                    placeholder={placeholder}
                    value={value} onChange={(e) => onChange(e.target.value)}
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-11 focus-visible:ring-primary"
                    autoComplete={autoComplete} disabled={disabled} autoFocus={autoFocus}
                />
                <button
                    type="button" onClick={toggleShow}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <Button
            type="button" variant="ghost" onClick={onClick}
            className="w-full gap-2 text-slate-400 hover:text-white hover:bg-white/5"
        >
            <ArrowLeft className="w-4 h-4" /> {label}
        </Button>
    );
}
