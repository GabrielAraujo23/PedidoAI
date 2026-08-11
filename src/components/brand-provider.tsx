"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Brand } from "@/lib/brand";

/**
 * Marca da loja em contexto, espelhando o AuthProvider.
 *
 * Duas fontes, escolhidas pelo caminho — e não por configuração, para não
 * existir um jeito de a tela do cliente final pedir dados de admin:
 *   - painel do lojista  -> GET /api/loja          (exige sessão)
 *   - cliente final      -> GET /api/loja/publica  (sem sessão, resolve pelo
 *                           cookie de tenant gravado por /loja/<slug>)
 *
 * `null` significa "não sei ainda" ou "não há tenant aqui". Os consumidores
 * tratam isso caindo na marca PedidoAI, que é o comportamento seguro.
 */
const BrandContext = createContext<{ brand: Brand | null; loading: boolean }>({
    brand: null, loading: true,
});

export function useBrand() {
    return useContext(BrandContext);
}

/** Telas do cliente final: a marca vem da rota pública. */
const CLIENTE_PREFIXES = ["/login", "/cliente/"];

/**
 * Telas sem tenant nenhuma. São a porta do sistema e a página de vendas do
 * próprio PedidoAI — nelas não há loja para representar.
 */
const SEM_MARCA_PREFIXES = ["/acesso", "/contratar"];

interface RespostaLoja {
    settings?: { logo_url?: string | null; store_name?: string | null; white_label?: boolean | null } | null;
    store?:    { logo_url?: string | null; store_name?: string | null; white_label?: boolean | null } | null;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [brand, setBrand] = useState<Brand | null>(null);
    const [loading, setLoading] = useState(true);

    const semMarca  = SEM_MARCA_PREFIXES.some((p) => pathname.startsWith(p));
    const doCliente = CLIENTE_PREFIXES.some((p) => pathname.startsWith(p));

    useEffect(() => {
        // Telas sem tenant não buscam nada — o estado inicial já as descreve.
        if (semMarca) return;

        const url = doCliente ? "/api/loja/publica" : "/api/loja";
        let cancelado = false;

        // Nada de setLoading(true) aqui. Ele seria uma escrita de estado
        // síncrona dentro do efeito — o que a regra react-hooks/set-state-in-effect
        // proíbe — e só serve para o caso de trocar do lado admin para o do
        // cliente sem recarregar a página, que não acontece: são dois públicos
        // e dois apps. Enquanto a nova marca não chega, a anterior continua na
        // tela, que é melhor do que piscar vazio.
        fetch(url)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: RespostaLoja | null) => {
                if (cancelado) return;
                // /api/loja devolve { settings }, /api/loja/publica devolve { store }.
                const loja = data?.settings ?? data?.store ?? null;
                setBrand(loja ? {
                    logoUrl:    loja.logo_url ?? null,
                    storeName:  loja.store_name ?? null,
                    whiteLabel: loja.white_label === true,
                } : null);
            })
            .catch(() => { if (!cancelado) setBrand(null); })
            .finally(() => { if (!cancelado) setLoading(false); });

        return () => { cancelado = true; };
        // `doCliente`/`semMarca` derivam de `pathname`: recalcula ao trocar de lado.
    }, [doCliente, semMarca]);

    // `semMarca` é resolvido aqui, e não por estado: é função pura do caminho,
    // e guardá-lo em estado só criaria um instante em que os dois discordam.
    const value = semMarca ? { brand: null, loading: false } : { brand, loading };

    return (
        <BrandContext.Provider value={value}>
            {children}
        </BrandContext.Provider>
    );
}
