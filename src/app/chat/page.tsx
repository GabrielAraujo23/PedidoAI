"use client";

import { ChatInterface } from "@/components/chat-interface";
import { MessageSquare, Zap, ShieldCheck } from "lucide-react";

export default function ChatPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Chat Inteligente</h2>
                    <p className="text-muted-foreground">Conversas integradas com reconhecimento automático de pedidos.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3">
                    <ChatInterface />
                </div>

                <div className="space-y-6">
                    <div className="glass p-5 rounded-2xl border-none space-y-4">
                        <h3 className="font-bold text-secondary flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary" /> Como Funciona?
                        </h3>
                        <ul className="text-sm text-muted-foreground space-y-3">
                            <li className="flex gap-2">
                                <span className="text-primary font-bold">1.</span>
                                O cliente envia o pedido via WhatsApp ou Chat.
                            </li>
                            <li className="flex gap-2">
                                <span className="text-primary font-bold">2.</span>
                                Nossa IA identifica produtos e quantidades automaticamente.
                            </li>
                            <li className="flex gap-2">
                                <span className="text-primary font-bold">3.</span>
                                O pedido entra direto na fila como "Novo".
                            </li>
                        </ul>
                    </div>

                    <div className="glass p-5 rounded-2xl border-none bg-primary/5">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck className="w-5 h-5 text-teal-600" />
                            <h3 className="font-bold text-secondary">Fila Inteligente</h3>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Pedidos identificados são priorizados de acordo com o perfil do cliente e urgência.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
