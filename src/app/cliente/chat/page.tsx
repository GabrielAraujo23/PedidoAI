"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Bot,
    User,
    Send,
    CheckCircle,
    XCircle,
    LogOut,
    Clock,
    Truck,
    Star,
    Package,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ClientSession } from "@/lib/auth-context";
import type { Order, Status } from "@/lib/types";

const STATUS_CONFIG: Record<Status, { label: string; color: string; Icon: typeof Package }> = {
    novo: { label: "Aguardando", color: "bg-blue-100 text-blue-700", Icon: Clock },
    confirmado: { label: "Confirmado", color: "bg-orange-100 text-orange-700", Icon: CheckCircle },
    rota: { label: "Em Rota", color: "bg-teal-100 text-teal-700", Icon: Truck },
    entregue: { label: "Entregue", color: "bg-green-100 text-green-700", Icon: Star },
};

interface ParsedProduct {
    quantity: number;
    name: string;
}

function parseProducts(text: string): ParsedProduct[] {
    return text
        .split(/[,+&]| e /)
        .map((p) => p.trim())
        .filter(Boolean)
        .reduce<ParsedProduct[]>((acc, part) => {
            const m1 = part.match(/^(\d+)\s+(.+)$/);
            if (m1) return [...acc, { quantity: parseInt(m1[1]), name: m1[2].trim() }];
            const m2 = part.match(/^(.+)\s+x\s*(\d+)$/i);
            if (m2) return [...acc, { quantity: parseInt(m2[2]), name: m2[1].trim() }];
            return acc;
        }, []);
}

function nowTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessage {
    id: string;
    text: string;
    sender: "user" | "bot";
    timestamp: string;
    confirmData?: ParsedProduct[];
    isSuccess?: boolean;
}

type Stage = "idle" | "confirming" | "saving";

export default function ClienteChatPage() {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [mounted, setMounted] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [stage, setStage] = useState<Stage>("idle");
    const [pendingProducts, setPendingProducts] = useState<ParsedProduct[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem("pedidoai_client_session");
        if (!stored) {
            router.push("/cliente/entrar");
            return;
        }

        const sess = JSON.parse(stored) as ClientSession;
        setSession(sess);

        supabase
            .from("orders")
            .select("*")
            .eq("client_id", sess.clientId)
            .then(({ data }) => {
                if (data) {
                    const sorted = [...data].sort(
                        (a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0)
                    );
                    setOrders(sorted as Order[]);
                }
            });

        setTimeout(() => {
            addBotMessage(
                `Olá, ${sess.name}! 😊 Como posso ajudar?\n\nDigite seu pedido para começar. Exemplo: "5 cimento + 10 tijolo"`
            );
        }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function addMsg(msg: Omit<ChatMessage, "id">) {
        setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random()}` }]);
    }

    function addBotMessage(
        text: string,
        extra?: Partial<Omit<ChatMessage, "id" | "text" | "sender" | "timestamp">>
    ) {
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
    }

    function handleSend() {
        const val = input.trim();
        if (!val || stage !== "idle") return;
        setInput("");

        addMsg({ text: val, sender: "user", timestamp: nowTime() });

        const products = parseProducts(val);
        if (products.length === 0) {
            addBotMessage(
                'Não consegui identificar os produtos. Tente: "5 cimento + 10 tijolo"'
            );
            return;
        }

        setPendingProducts(products);
        setStage("confirming");
        addBotMessage("Confira seu pedido:", { confirmData: products });
    }

    async function handleConfirm() {
        if (!session) return;
        setStage("saving");

        const { data: allOrders } = await supabase.from("orders").select("id, status");
        const ids = (allOrders || []).map((o: { id: string }) => parseInt(o.id) || 0);
        const maxId = ids.length > 0 ? Math.max(...ids) : 0;
        const nextId = String(maxId + 1);
        const novoCount = (allOrders || []).filter((o: { status: string }) => o.status === "novo").length;
        const productsStr = pendingProducts.map((p) => `${p.quantity}x ${p.name}`).join(", ");

        const { error } = await supabase.from("orders").insert({
            id: nextId,
            client: session.name,
            client_id: session.clientId,
            products: productsStr,
            status: "novo",
            position: novoCount,
        });

        if (!error) {
            const newOrder: Order = {
                id: nextId,
                client: session.name,
                client_id: session.clientId,
                products: productsStr,
                status: "novo",
                position: novoCount,
            };
            setOrders((prev) => [newOrder, ...prev]);
            addBotMessage(
                `✅ Pedido #${nextId} registrado com sucesso!\n\nAssim que confirmarmos, você verá o status atualizado acima.`,
                { isSuccess: true }
            );
        } else {
            addBotMessage("Erro ao registrar o pedido. Tente novamente.");
        }

        setStage("idle");
        setPendingProducts([]);
    }

    function handleCancel() {
        setStage("idle");
        setPendingProducts([]);
        addBotMessage("Pedido cancelado. O que você deseja pedir?");
    }

    function handleLogout() {
        localStorage.removeItem("pedidoai_client_session");
        router.push("/login");
    }

    if (!mounted || !session) return null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-100 flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex flex-col min-h-screen">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-white/20 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow shadow-primary/20">
                            <span className="text-white font-bold">P</span>
                        </div>
                        <div>
                            <p className="font-bold text-secondary text-sm leading-none">PedidoAI</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Olá, {session.name}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-none">
                            Cliente
                        </Badge>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={handleLogout}
                        >
                            <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Orders Status Panel */}
                {orders.length > 0 && (
                    <div className="px-4 pt-4 space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Seus Pedidos
                        </p>
                        {orders.slice(0, 3).map((order) => {
                            const cfg = STATUS_CONFIG[order.status];
                            const Icon = cfg.Icon;
                            return (
                                <div
                                    key={order.id}
                                    className="bg-white/60 backdrop-blur rounded-xl px-4 py-3 flex items-center justify-between border border-white/30"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <div>
                                            <p className="text-xs font-semibold text-secondary">
                                                Pedido #{order.id}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                                                {order.products}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[11px] border-none rounded-lg px-2 py-0.5 shrink-0",
                                            cfg.color
                                        )}
                                    >
                                        {cfg.label}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Chat Messages */}
                <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={cn(
                                "flex gap-2",
                                m.sender === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            {m.sender === "bot" && (
                                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                            )}

                            <div
                                className={cn(
                                    "max-w-[80%] space-y-1",
                                    m.sender === "user" && "items-end flex flex-col"
                                )}
                            >
                                <div
                                    className={cn(
                                        "p-3 rounded-2xl text-sm shadow-sm whitespace-pre-line",
                                        m.sender === "user"
                                            ? "bg-primary text-white rounded-tr-none"
                                            : m.isSuccess
                                                ? "bg-green-50 text-green-700 border border-green-200 rounded-tl-none"
                                                : "bg-white/80 text-secondary rounded-tl-none border border-white/30"
                                    )}
                                >
                                    {m.text}

                                    {m.confirmData && (
                                        <div className="mt-2 pt-2 border-t border-current/20 space-y-1">
                                            {m.confirmData.map((p, i) => (
                                                <p key={i} className="font-semibold text-xs">
                                                    • {p.quantity}x {p.name}
                                                </p>
                                            ))}
                                            {(stage === "confirming" || stage === "saving") && (
                                                <div className="flex gap-2 mt-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={handleConfirm}
                                                        disabled={stage === "saving"}
                                                        className="bg-primary hover:bg-primary/90 text-white gap-1 h-7 text-xs flex-1"
                                                    >
                                                        {stage === "saving" ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <CheckCircle className="w-3 h-3" />
                                                        )}
                                                        {stage === "saving" ? "Enviando..." : "Confirmar"}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={handleCancel}
                                                        disabled={stage === "saving"}
                                                        className="gap-1 h-7 text-xs bg-white"
                                                    >
                                                        <XCircle className="w-3 h-3" /> Cancelar
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] text-muted-foreground px-1">
                                    {m.timestamp}
                                </span>
                            </div>

                            {m.sender === "user" && (
                                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5">
                                    <User className="w-4 h-4 text-secondary" />
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="sticky bottom-0 bg-white/70 backdrop-blur-lg border-t border-white/20 p-4 flex gap-2">
                    <Input
                        placeholder={
                            stage === "idle"
                                ? "Ex: 5 cimento + 10 tijolo..."
                                : "Aguardando confirmação..."
                        }
                        className="glass border-none h-11"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && stage === "idle" && handleSend()}
                        disabled={stage !== "idle"}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={stage !== "idle" || !input.trim()}
                        className="bg-primary hover:bg-primary/90 text-white h-11 w-11 p-0 aspect-square"
                    >
                        <Send className="w-5 h-5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
