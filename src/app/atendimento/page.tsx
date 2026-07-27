"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };
const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";

type Step = 1 | 2 | 3;

interface SelectedClient {
    id: string;
    name: string;
    phone: string;
    address: string;
}

interface CartItem {
    product_id: string;
    product_name: string;
    unit: string;
    unit_price: number;
    quantity: number;
}

interface Product {
    id: string;
    name: string;
    category: string;
    unit: string;
    price: number;
    active: boolean;
}

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
    const steps: { n: Step; label: string }[] = [
        { n: 1, label: "Cliente" },
        { n: 2, label: "Produtos" },
        { n: 3, label: "Confirmar" },
    ];

    return (
        <div className="flex items-center gap-0 mb-8">
            {steps.map(({ n, label }, i) => {
                const done   = current > n;
                const active = current === n;
                return (
                    <div key={n} className="flex items-center">
                        <div className="flex flex-col items-center gap-1">
                            <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-colors",
                                done   && "bg-stone-900 border-stone-900 text-white",
                                active && "bg-orange-500 border-orange-500 text-white",
                                !done && !active && "bg-white border-stone-300 text-stone-400"
                            )}>
                                {done ? "✓" : n}
                            </div>
                            <span className={cn(
                                "text-[11px] font-semibold whitespace-nowrap",
                                active ? "text-stone-900" : "text-stone-400"
                            )}>{label}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={cn(
                                "h-0.5 w-16 sm:w-24 mx-2 mb-4 transition-colors",
                                current > n ? "bg-stone-900" : "bg-stone-200"
                            )} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AtendimentoPage() {
    const { adminSession } = useAuth();
    const router = useRouter();

    const [step, setStep]                     = useState<Step>(1);
    const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
    const [cart, setCart]                     = useState<CartItem[]>([]);
    const [notes, setNotes]                   = useState("");

    function cartTotal() {
        return cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    }

    function updateCart(product: Product, delta: number) {
        setCart((prev) => {
            const existing = prev.find((i) => i.product_id === product.id);
            if (!existing) {
                if (delta <= 0) return prev;
                return [...prev, {
                    product_id: product.id,
                    product_name: product.name,
                    unit: product.unit,
                    unit_price: product.price,
                    quantity: delta,
                }];
            }
            const newQty = existing.quantity + delta;
            if (newQty <= 0) return prev.filter((i) => i.product_id !== product.id);
            return prev.map((i) =>
                i.product_id === product.id ? { ...i, quantity: newQty } : i
            );
        });
    }

    if (!adminSession) return null;

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
                <p className={cn(eyebrowClass, "mb-3")}>Atendimento</p>
                <h1
                    className="text-[40px] leading-[0.96] tracking-tight text-stone-900"
                    style={sectionTitleStyle}
                >
                    Pedido por Ligação
                </h1>
            </header>

            <StepIndicator current={step} />

            {step === 1 && (
                <Step1Client
                    adminId={adminSession.adminId}
                    selected={selectedClient}
                    onSelect={setSelectedClient}
                    onNext={() => setStep(2)}
                />
            )}
            {step === 2 && (
                <Step2Products
                    adminId={adminSession.adminId}
                    cart={cart}
                    onUpdateCart={updateCart}
                    cartTotal={cartTotal()}
                    onBack={() => setStep(1)}
                    onNext={() => setStep(3)}
                />
            )}
            {step === 3 && (
                <Step3Confirm
                    client={selectedClient!}
                    cart={cart}
                    cartTotal={cartTotal()}
                    notes={notes}
                    onNotesChange={setNotes}
                    onBack={() => setStep(2)}
                    onDone={() => router.push("/pedidos")}
                />
            )}
        </div>
    );
}

// ── Step placeholders (replaced in Tasks 4–6) ─────────────────────────────────

function Step1Client(_props: {
    adminId: string;
    selected: SelectedClient | null;
    onSelect: (c: SelectedClient | null) => void;
    onNext: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-stone-200/70 p-6">
            <p className="text-stone-400 text-[13px]">Step 1 — em construção</p>
        </div>
    );
}

function Step2Products(_props: {
    adminId: string;
    cart: CartItem[];
    onUpdateCart: (product: Product, delta: number) => void;
    cartTotal: number;
    onBack: () => void;
    onNext: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-stone-200/70 p-6">
            <p className="text-stone-400 text-[13px]">Step 2 — em construção</p>
        </div>
    );
}

function Step3Confirm(_props: {
    client: SelectedClient;
    cart: CartItem[];
    cartTotal: number;
    notes: string;
    onNotesChange: (v: string) => void;
    onBack: () => void;
    onDone: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-stone-200/70 p-6">
            <p className="text-stone-400 text-[13px]">Step 3 — em construção</p>
        </div>
    );
}
