"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Bot, ShoppingCart, CheckCircle, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { escapeLike, truncate, validateQuantity, LIMITS } from "@/lib/validators";
import { logEvent, logError } from "@/lib/logger";

type Stage =
    | "collecting_name"
    | "collecting_phone"
    | "collecting_address"
    | "collecting_products"
    | "confirming"
    | "saving"
    | "done";

interface ParsedProduct {
    quantity: number;
    name: string;
}

interface CollectedData {
    name: string;
    phone: string;
    address: string;
    products: ParsedProduct[];
}

interface Message {
    id: string;
    text: string;
    sender: "user" | "bot";
    timestamp: string;
    summaryData?: CollectedData;
    isSuccess?: boolean;
}

const FLOW_STAGES: Stage[] = [
    "collecting_name",
    "collecting_phone",
    "collecting_address",
    "collecting_products",
    "confirming",
];

const STAGE_LABELS: Record<Stage, string> = {
    collecting_name: "Nome",
    collecting_phone: "Telefone",
    collecting_address: "Endereço",
    collecting_products: "Produtos",
    confirming: "Confirmar",
    saving: "Confirmar",
    done: "Confirmar",
};

const PLACEHOLDERS: Record<Stage, string> = {
    collecting_name: "Nome do cliente...",
    collecting_phone: "Telefone ou 'pular'...",
    collecting_address: "Endereço ou 'pular'...",
    collecting_products: "Ex: 5 cimento + 10 tijolo...",
    confirming: "Aguardando confirmação...",
    saving: "Salvando pedido...",
    done: "Atendimento encerrado",
};

function parseProducts(text: string): ParsedProduct[] {
    return text
        .slice(0, 500) // limit raw input
        .split(/[,+&]| e /)
        .map((p) => p.trim())
        .filter(Boolean)
        .reduce<ParsedProduct[]>((acc, part) => {
            const m1 = part.match(/^(\d+)\s+(.+)$/);
            if (m1) {
                const qty = Math.min(Math.max(1, parseInt(m1[1], 10)), 9_999);
                const name = m1[2].trim().slice(0, 120);
                if (validateQuantity(qty).ok) return [...acc, { quantity: qty, name }];
            }
            const m2 = part.match(/^(.+)\s+x\s*(\d+)$/i);
            if (m2) {
                const qty = Math.min(Math.max(1, parseInt(m2[2], 10)), 9_999);
                const name = m2[1].trim().slice(0, 120);
                if (validateQuantity(qty).ok) return [...acc, { quantity: qty, name }];
            }
            return acc;
        }, []);
}

function isSkip(text: string): boolean {
    return ["pular", "skip", "-", "nao", "não", "n", ""].includes(text.toLowerCase().trim());
}

function nowTime(): string {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatInterface({ onOrderCreated }: { onOrderCreated?: () => void }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [stage, setStage] = useState<Stage>("collecting_name");
    const [data, setData] = useState<CollectedData>({ name: "", phone: "", address: "", products: [] });
    const [input, setInput] = useState("");
    const [saving, setSaving] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const addMsg = useCallback((msg: Omit<Message, "id">) => {
        setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random()}` }]);
    }, []);

    const botSay = useCallback((text: string, extra?: Partial<Omit<Message, "id" | "text" | "sender" | "timestamp">>) => {
        setTimeout(() => {
            setMessages((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-${Math.random()}`,
                    text,
                    sender: "bot",
                    timestamp: nowTime(),
                    ...extra,
                },
            ]);
        }, 500);
    }, []);

    // Initial greeting
    useEffect(() => {
        botSay("Olá! Vou registrar o atendimento. Qual é o nome do cliente?");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function handleSend() {
        const val = input.trim();
        setInput("");

        if (val) addMsg({ text: val, sender: "user", timestamp: nowTime() });

        switch (stage) {
            case "collecting_name": {
                if (!val) return;
                const next = { ...data, name: val };
                setData(next);
                setStage("collecting_phone");
                botSay(`Certo, ${val}! Qual o telefone de contato? (ou "pular")`);
                break;
            }
            case "collecting_phone": {
                const next = { ...data, phone: isSkip(val) ? "" : val };
                setData(next);
                setStage("collecting_address");
                botSay(`Qual o endereço de entrega? (ou "pular")`);
                break;
            }
            case "collecting_address": {
                const next = { ...data, address: isSkip(val) ? "" : val };
                setData(next);
                setStage("collecting_products");
                botSay(`Perfeito! O que ${next.name || data.name} quer pedir?\n(Ex: 5 cimento + 10 tijolo)`);
                break;
            }
            case "collecting_products": {
                if (!val) return;
                const products = parseProducts(val);
                if (products.length === 0) {
                    botSay(`Não consegui identificar os produtos. Tente: "5 cimento + 10 tijolo"`);
                    return;
                }
                const next = { ...data, products };
                setData(next);
                setStage("confirming");
                botSay("Confira o resumo do pedido abaixo:", { summaryData: next });
                break;
            }
        }
    }

    async function handleConfirm() {
        setSaving(true);
        setStage("saving");

        try {
            // 1. Find or create client
            let clientId: string;
            const { data: found } = await supabase
                .from("clients")
                .select("id")
                .ilike("name", escapeLike(data.name))
                .limit(1);

            if (found && found.length > 0) {
                clientId = found[0].id;
            } else {
                const { data: allClients } = await supabase.from("clients").select("id");
                const nums = (allClients || []).map((c: { id: string }) => parseInt(c.id.replace("CL", "")) || 0);
                const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
                clientId = `CL${String(maxNum + 1).padStart(3, "0")}`;

                await supabase.from("clients").insert({
                    id: clientId,
                    name: truncate(data.name, LIMITS.name),
                    phone: data.phone ? truncate(data.phone, LIMITS.phone) : null,
                    address: data.address ? truncate(data.address, 255) : null,
                });
            }

            // 2. Create order
            const { data: allOrders } = await supabase.from("orders").select("id, status");
            const ids = (allOrders || []).map((o: { id: string }) => parseInt(o.id) || 0);
            const maxId = ids.length > 0 ? Math.max(...ids) : 0;
            const nextId = String(maxId + 1);
            const novoCount = (allOrders || []).filter((o: { status: string }) => o.status === "novo").length;
            const productsStr = data.products.map((p) => `${p.quantity}x ${p.name}`).join(", ");

            const { error } = await supabase.from("orders").insert({
                id: nextId,
                client: data.name,
                client_id: clientId,
                products: productsStr,
                status: "novo",
                position: novoCount,
            });

            if (error) throw error;

            logEvent({
                event_type: "order_created",
                actor_type: "client",
                actor_id: clientId,
                resource_type: "order",
                resource_id: nextId,
                metadata: { product_count: data.products.length, channel: "chat" },
            });
            setStage("done");
            botSay(`Pedido #${nextId} criado com sucesso! Já aparece na fila como "Novo".`, { isSuccess: true });
            onOrderCreated?.();
        } catch (err) {
            logError("order_creation_chat", err);
            logEvent({ event_type: "order_failed", actor_type: "client", metadata: { channel: "chat" } });
            setStage("confirming");
            botSay("Erro ao salvar o pedido. Tente confirmar novamente.");
        } finally {
            setSaving(false);
        }
    }

    function handleCancel() {
        setStage("collecting_products");
        setData((prev) => ({ ...prev, products: [] }));
        botSay("Pedido cancelado. O que o cliente deseja pedir?");
    }

    function handleRestart() {
        setMessages([]);
        setData({ name: "", phone: "", address: "", products: [] });
        setStage("collecting_name");
        setInput("");
        setTimeout(() => {
            botSay("Novo atendimento! Qual é o nome do cliente?");
        }, 100);
    }

    const stageIndex = FLOW_STAGES.indexOf(
        stage === "saving" || stage === "done" ? "confirming" : (stage as Stage)
    );
    const canType = ["collecting_name", "collecting_phone", "collecting_address", "collecting_products"].includes(stage);

    return (
        <Card className="glass border-none h-[620px] flex flex-col">
            <CardHeader className="border-b border-white/20 pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Bot className="w-5 h-5 text-primary" /> Chat de Atendimento
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRestart}
                        className="text-xs text-muted-foreground gap-1.5 hover:text-secondary"
                    >
                        <RotateCcw className="w-3 h-3" /> Novo atendimento
                    </Button>
                </div>
                {/* Progress bar */}
                <div className="flex gap-1 mt-2">
                    {FLOW_STAGES.map((s, i) => (
                        <div
                            key={s}
                            title={STAGE_LABELS[s]}
                            className={cn(
                                "h-1 flex-1 rounded-full transition-all duration-300",
                                i < stageIndex
                                    ? "bg-primary"
                                    : i === stageIndex
                                        ? "bg-primary/50"
                                        : "bg-white/30"
                            )}
                        />
                    ))}
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4 pb-2">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={cn("flex gap-3", m.sender === "user" ? "justify-end" : "justify-start")}
                            >
                                {m.sender === "bot" && (
                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                )}

                                <div className={cn("max-w-[80%] space-y-1", m.sender === "user" && "items-end flex flex-col")}>
                                    <div
                                        className={cn(
                                            "p-3 rounded-2xl text-sm shadow-sm",
                                            m.sender === "user"
                                                ? "bg-white text-secondary rounded-tr-none"
                                                : m.isSuccess
                                                    ? "bg-green-50 text-green-700 border border-green-200 rounded-tl-none"
                                                    : "bg-primary/10 text-secondary rounded-tl-none border border-primary/20"
                                        )}
                                    >
                                        {m.text}

                                        {/* Summary card */}
                                        {m.summaryData && (
                                            <div className="mt-3 p-3 bg-white rounded-xl border border-primary/20 space-y-2 text-secondary">
                                                <p className="text-[11px] font-bold text-primary flex items-center gap-1">
                                                    <ShoppingCart className="w-3 h-3" /> RESUMO DO PEDIDO
                                                </p>
                                                <div className="space-y-0.5 text-xs">
                                                    <p>
                                                        <span className="text-muted-foreground">Cliente:</span>{" "}
                                                        <strong>{m.summaryData.name}</strong>
                                                    </p>
                                                    {m.summaryData.phone && (
                                                        <p>
                                                            <span className="text-muted-foreground">Telefone:</span>{" "}
                                                            {m.summaryData.phone}
                                                        </p>
                                                    )}
                                                    {m.summaryData.address && (
                                                        <p>
                                                            <span className="text-muted-foreground">Endereço:</span>{" "}
                                                            {m.summaryData.address}
                                                        </p>
                                                    )}
                                                    <div className="pt-1.5 mt-1 border-t border-dashed border-primary/20">
                                                        <p className="text-muted-foreground mb-0.5">Produtos:</p>
                                                        {m.summaryData.products.map((p, i) => (
                                                            <p key={i} className="font-semibold">
                                                                • {p.quantity}x {p.name}
                                                            </p>
                                                        ))}
                                                    </div>
                                                </div>
                                                {(stage === "confirming" || stage === "saving") && (
                                                    <div className="flex gap-2 pt-1">
                                                        <Button
                                                            size="sm"
                                                            onClick={handleConfirm}
                                                            disabled={saving}
                                                            className="bg-primary hover:bg-primary/90 text-white gap-1.5 h-7 text-xs flex-1"
                                                        >
                                                            {saving ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <CheckCircle className="w-3 h-3" />
                                                            )}
                                                            {saving ? "Salvando..." : "Confirmar Pedido"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={handleCancel}
                                                            disabled={saving}
                                                            className="gap-1.5 h-7 text-xs"
                                                        >
                                                            <XCircle className="w-3 h-3" /> Cancelar
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground px-1">{m.timestamp}</span>
                                </div>

                                {m.sender === "user" && (
                                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                                        <User className="w-4 h-4 text-white" />
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-white/20 flex gap-2">
                    <Input
                        placeholder={PLACEHOLDERS[stage]}
                        className="glass border-none h-11"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && canType && handleSend()}
                        disabled={!canType}
                        maxLength={LIMITS.chat_message}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={!canType || !input.trim()}
                        className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 h-11 w-11 p-0 aspect-square"
                    >
                        <Send className="w-5 h-5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
