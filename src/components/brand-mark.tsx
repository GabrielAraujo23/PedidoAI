"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/components/brand-provider";
import { resolveBrandMark } from "@/lib/brand";

interface BrandMarkProps {
    /** Classe aplicada à imagem OU ao texto — cada tela já tem seu tamanho. */
    className?: string;
    /** Classe extra só para o texto, quando ele precisa de tratamento próprio. */
    textClassName?: string;
}

/**
 * A marca da tela: logo da loja, nome dela, ou PedidoAI.
 *
 * Substitui os <Image src="/Logo_PedidoAi.png"> espalhados pelo app. Um lugar
 * para mudar em vez de oito — foi a dispersão que fez a logo do fornecedor
 * aparecer na tela do cliente final por tanto tempo sem ninguém notar.
 */
export function BrandMark({ className, textClassName }: BrandMarkProps) {
    const { brand, loading } = useBrand();
    const [imagemFalhou, setImagemFalhou] = useState(false);

    // Espaço reservado com a altura final: sem isto o cabeçalho pula quando a
    // logo chega.
    if (loading) return <div className={cn("h-9", className)} aria-hidden />;

    const marca = resolveBrandMark(brand);

    // Arquivo removido do bucket depois de salvo: sem este degrau a tela
    // mostraria o ícone de imagem quebrada.
    if (marca.kind === "image" && !imagemFalhou) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- logo do lojista vem de domínio externo (Supabase Storage), não declarado em next.config
            <img
                src={marca.url}
                alt={marca.alt}
                onError={() => setImagemFalhou(true)}
                className={cn("h-auto object-contain", className)}
            />
        );
    }

    if (marca.kind === "text" || imagemFalhou) {
        const texto = marca.kind === "text" ? marca.text : (brand?.storeName?.trim() || "PedidoAI");
        return (
            <span
                className={cn("text-stone-900 leading-tight truncate", textClassName, className)}
                style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                title={texto}
            >
                {texto}
            </span>
        );
    }

    return (
        <Image
            src="/Logo_PedidoAi.png"
            alt="PedidoAI"
            width={280}
            height={153}
            className={cn("h-auto object-contain", className)}
        />
    );
}
