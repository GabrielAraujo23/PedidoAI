"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useBrand } from "@/components/brand-provider";
import { showsPoweredBy } from "@/lib/brand";

/**
 * "Desenvolvido por PedidoAI" — some quando a conta tem white-label.
 *
 * Não é clicável de propósito: levar o cliente final para fora da loja no meio
 * de um pedido troca uma venda do lojista por um lead incerto.
 */
export function PoweredBy({ className }: { className?: string }) {
    const { brand, loading } = useBrand();

    // Enquanto carrega, nada — piscar o crédito e escondê-lo em seguida é pior
    // que aparecer meio segundo depois.
    if (loading || !showsPoweredBy(brand)) return null;

    return (
        <div className={cn("flex items-center gap-1.5 opacity-60", className)}>
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
                desenvolvido por
            </span>
            <Image
                src="/Logo_PedidoAi.png"
                alt="PedidoAI"
                width={140}
                height={76}
                className="h-3.5 w-auto object-contain"
            />
        </div>
    );
}
