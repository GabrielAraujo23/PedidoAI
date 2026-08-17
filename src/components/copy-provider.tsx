"use client";

import { createContext, useContext, useMemo } from "react";
import { resolverCopy, interpolar, type CopyKey } from "@/lib/copy";

interface CopyContextValue {
    /** O texto de uma chave, com o da loja na frente do padrão. */
    t: (chave: CopyKey) => string;
    /** O mesmo, com os marcadores `{nome}` substituídos. */
    ti: (chave: CopyKey, valores: Record<string, string | number>) => string;
}

/**
 * Texto da loja em contexto.
 *
 * Ao contrário do BrandProvider, este NÃO busca nada. Os overrides chegam
 * prontos do layout raiz, que é Server Component e os leu antes de o HTML sair
 * — ver `src/lib/copy/servidor.ts` para o porquê. Sem `fetch`, sem efeito, sem
 * estado de carregamento: nada aqui pode fazer o texto trocar depois que o
 * leitor já começou a ler.
 *
 * O padrão do contexto é `{}`, e não `null`: "não sei ainda" não existe neste
 * provider, e a cascata de `resolverCopy` já trata ausência devolvendo o texto
 * do produto.
 */
const CopyContext = createContext<Record<string, string>>({});

export function useCopy(): CopyContextValue {
    const overrides = useContext(CopyContext);
    return useMemo(() => ({
        t:  (chave) => resolverCopy(chave, overrides),
        ti: (chave, valores) => interpolar(resolverCopy(chave, overrides), valores),
    }), [overrides]);
}

export function CopyProvider({
    overrides,
    children,
}: {
    overrides: Record<string, string>;
    children: React.ReactNode;
}) {
    return (
        <CopyContext.Provider value={overrides}>
            {children}
        </CopyContext.Provider>
    );
}
