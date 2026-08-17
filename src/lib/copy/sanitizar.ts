import { COPY_PADRAO, LIMITES, type CopyKey } from "@/lib/copy/padrao";

/**
 * Teto de chaves processadas para evitar custo O(n) num objeto gigante.
 * Objetos com mais de 500 chaves param de ser processados.
 */
export const TETO_CHAVES = 500;

/**
 * Remove qualquer tag HTML do texto.
 *
 * O texto vai entrar em JSX de outro componente; tags aqui são um risco
 * de segurança (XSS) e um erro de dados (quem gravou esperava renderizar
 * HTML, mas aqui não rendemos).
 *
 * Ordem importante:
 * 1. Remove tags perigosas COM seu conteúdo: <script>...</script>, <style>...</style>
 * 2. Remove todas as outras tags: <b>, <i>, <img>, etc.
 */
function removerHtml(texto: string): string {
    // Remove <script>...</script> e <style>...</style> com o conteúdo
    let limpo = texto.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    limpo = limpo.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    // Remove todas as outras tags
    limpo = limpo.replace(/<[^>]*>/g, "");
    return limpo;
}

/**
 * Higieniza overrides vindo de um `JSONB` do banco para uso seguro.
 *
 * Regras:
 * - entrada nula/undefined/array/número/booleano → `{}`
 * - chave desconhecida → descartada
 * - valor não-string → descartado
 * - string vazia ou só espaços (após remover HTML) → descartada
 * - valor idêntico ao padrão → descartado (ruído, congela a loja)
 * - HTML removido primeiro, ANTES de comparar e cortar
 * - texto acima do limite → cortado, não rejeitado
 * - teto de chaves processadas: 500
 *
 * Nunca lança. Um override sujo não pode derrubar o app.
 */
export function sanitizarOverrides(entrada: unknown): Record<string, string> {
    // Entrada deve ser objeto. Tudo mais vira {}.
    if (entrada === null || entrada === undefined || typeof entrada !== "object" || Array.isArray(entrada)) {
        return {};
    }

    const resultado: Record<string, string> = {};
    let processadas = 0;

    for (const [chave, valor] of Object.entries(entrada)) {
        // Teto de chaves
        if (processadas >= TETO_CHAVES) break;
        processadas++;

        // Chave deve existir em COPY_PADRAO
        if (!(chave in COPY_PADRAO)) continue;

        // Valor deve ser string
        if (typeof valor !== "string") continue;

        // Remove HTML primeiro (antes de trim, comparação e corte)
        let limpo = removerHtml(valor);

        // Trim dos espaços
        limpo = limpo.trim();

        // Se ficou vazio, descarta
        if (limpo === "") continue;

        // Se é igual ao padrão, descarta (é ruído)
        if (limpo === COPY_PADRAO[chave as CopyKey]) continue;

        // Corta pelo limite da chave, se houver
        const limite = LIMITES[chave as CopyKey];
        if (limite && limpo.length > limite) {
            limpo = limpo.substring(0, limite);
        }

        resultado[chave] = limpo;
    }

    return resultado;
}
