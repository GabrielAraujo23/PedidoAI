import { COPY_PADRAO, type CopyKey } from "@/lib/copy/padrao";

export { COPY_PADRAO, LIMITES } from "@/lib/copy/padrao";
export type { CopyKey } from "@/lib/copy/padrao";

/**
 * O texto de uma chave, para uma loja.
 *
 * Cascata: texto da loja, se houver e não for vazio; senão o padrão. Nunca
 * string vazia, nunca a chave crua na tela — um override sujo no JSONB não
 * pode deixar o cliente final olhando para "login.titulo".
 */
export function resolverCopy(
    chave: CopyKey,
    overrides: Record<string, string> | null
): string {
    const daLoja = overrides?.[chave];
    if (typeof daLoja === "string" && daLoja.trim() !== "") return daLoja;
    return COPY_PADRAO[chave];
}

/**
 * Substitui `{nome}` pelos valores dados.
 *
 * Marcador sem valor fica como está, de propósito: mostrar "{n} itens" é feio,
 * mas mostrar "undefined itens" para o cliente do lojista é pior.
 */
export function interpolar(texto: string, valores: Record<string, string | number>): string {
    return texto.replace(/\{(\w+)\}/g, (original, nome: string) =>
        nome in valores ? String(valores[nome]) : original
    );
}
