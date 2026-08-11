/**
 * Qual marca uma tela deve exibir — regras puras, sem I/O.
 *
 * Isolado porque erra em silêncio: uma cascata errada aqui não quebra nada,
 * só mostra a marca do fornecedor na loja de quem paga para não vê-la.
 *
 * Roda no Edge, no Node e no navegador.
 */

export interface Brand {
    logoUrl:    string | null;
    storeName:  string | null;
    whiteLabel: boolean;
}

export type BrandMarkKind =
    | { kind: "image"; url: string; alt: string }
    | { kind: "text";  text: string }
    | { kind: "pedidoai" };

/**
 * Cascata de três degraus: imagem, nome, PedidoAI.
 *
 * O último degrau é deliberado. Uma tela sem identidade nenhuma é pior que uma
 * com a marca do fornecedor — pelo menos essa parece um produto.
 */
export function resolveBrandMark(brand: Brand | null): BrandMarkKind {
    const url  = brand?.logoUrl?.trim() ?? "";
    const nome = brand?.storeName?.trim() ?? "";

    if (url)  return { kind: "image", url, alt: nome || "Logo da loja" };
    if (nome) return { kind: "text", text: nome };
    return { kind: "pedidoai" };
}

/**
 * O crédito "desenvolvido por PedidoAI" aparece?
 *
 * Marca nula — ainda carregando, ou tenant não resolvida — devolve `true`:
 * na dúvida o crédito aparece, porque escondê-lo é o que alguém precisa
 * conceder, não o que acontece por acidente de carregamento.
 */
export function showsPoweredBy(brand: Brand | null): boolean {
    return brand?.whiteLabel !== true;
}
