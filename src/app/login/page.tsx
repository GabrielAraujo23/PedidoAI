"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, User, MapPin, Loader2, ArrowLeft, MessageSquare, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Client } from "@/lib/types";
import type { ClientSession } from "@/lib/auth-context";

type Step = "phone" | "returning" | "new_client";

export default function LoginPage() {
    const [step, setStep] = useState<Step>("phone");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [foundClient, setFoundClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    async function handlePhoneContinue(e: React.FormEvent) {
        e.preventDefault();
        if (!phone.trim()) return;
        setLoading(true);
        setError("");

        const { data: clients } = await supabase
            .from("clients")
            .select("*")
            .eq("phone", phone.trim())
            .limit(1);

        setLoading(false);

        if (clients && clients.length > 0) {
            setFoundClient(clients[0] as Client);
            setStep("returning");
        } else {
            setStep("new_client");
        }
    }

    function saveSessionAndRedirect(client: Client) {
        const session: ClientSession = {
            clientId: client.id,
            name: client.name,
            phone: client.phone ?? "",
        };
        localStorage.setItem("pedidoai_client_session", JSON.stringify(session));
        router.push("/cliente/chat");
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        setError("");

        const { data: allClients } = await supabase.from("clients").select("id");
        const nums = (allClients || []).map((c: { id: string }) => parseInt(c.id.replace("CL", "")) || 0);
        const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
        const clientId = `CL${String(maxNum + 1).padStart(3, "0")}`;

        const newClient: Client = {
            id: clientId,
            name: name.trim(),
            phone: phone.trim(),
            address: address.trim() || null,
        };

        const { error } = await supabase.from("clients").insert(newClient);

        if (error) {
            setError("Erro ao cadastrar. Tente novamente.");
            setLoading(false);
            return;
        }

        saveSessionAndRedirect(newClient);
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-100">
            <div className="w-full max-w-md space-y-8">
                {/* Logo */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-primary rounded-3xl flex items-center justify-center shadow-xl shadow-primary/30">
                        <MessageSquare className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-secondary">PedidoAI</h1>
                        <p className="text-muted-foreground text-sm">Faça seu pedido agora</p>
                    </div>
                </div>

                <Card className="glass border-none shadow-2xl">
                    {/* Step 1: Phone entry */}
                    {step === "phone" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl text-secondary">Bem-vindo!</CardTitle>
                                <CardDescription>
                                    Digite seu número de telefone para continuar.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handlePhoneContinue} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Telefone</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="phone"
                                                type="tel"
                                                placeholder="(11) 99999-9999"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="pl-10 glass border-none h-11"
                                                autoComplete="tel"
                                                autoFocus
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                        disabled={loading || !phone.trim()}
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continuar"}
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}

                    {/* Step 2a: Returning client */}
                    {step === "returning" && foundClient && (
                        <>
                            <CardHeader className="pb-4 items-center text-center">
                                <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-2">
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                </div>
                                <CardTitle className="text-xl text-secondary">
                                    Olá, {foundClient.name}!
                                </CardTitle>
                                <CardDescription>
                                    Seja bem-vindo de volta. Pronto para fazer um pedido?
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button
                                    className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                    onClick={() => saveSessionAndRedirect(foundClient)}
                                >
                                    Entrar e Pedir
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full gap-2 text-muted-foreground"
                                    onClick={() => {
                                        setStep("phone");
                                        setFoundClient(null);
                                        setPhone("");
                                    }}
                                >
                                    <ArrowLeft className="w-4 h-4" /> Não sou eu
                                </Button>
                            </CardContent>
                        </>
                    )}

                    {/* Step 2b: New client registration */}
                    {step === "new_client" && (
                        <>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl text-secondary">Primeiro acesso</CardTitle>
                                <CardDescription>
                                    Número não encontrado. Complete seu cadastro para continuar.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleRegister} className="space-y-4">
                                    {/* Phone — read-only, pre-filled */}
                                    <div className="space-y-2">
                                        <Label>Telefone</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                value={phone}
                                                className="pl-10 glass border-none h-11 text-muted-foreground"
                                                disabled
                                                readOnly
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="name">Nome completo *</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="name"
                                                type="text"
                                                placeholder="Seu nome completo"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="pl-10 glass border-none h-11"
                                                autoComplete="name"
                                                autoFocus
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="address">Endereço (opcional)</Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="address"
                                                type="text"
                                                placeholder="Rua, número, bairro"
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                className="pl-10 glass border-none h-11"
                                                autoComplete="street-address"
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                                            {error}
                                        </p>
                                    )}

                                    <Button
                                        type="submit"
                                        className="w-full h-11 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                        disabled={loading || !name.trim()}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            "Cadastrar e Entrar"
                                        )}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full gap-2 text-muted-foreground"
                                        onClick={() => {
                                            setStep("phone");
                                            setName("");
                                            setAddress("");
                                            setError("");
                                        }}
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Voltar
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
