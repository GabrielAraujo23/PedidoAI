/**
 * Slug público da loja — o endereço legível que substitui o UUID em
 * /login?admin=<uuid>. Usado no backfill da migration 025, na validação da
 * tela do lojista e na resolução de /loja/<slug>.
 *
 * Sem dependências de runtime: roda no Edge, no Node e no navegador.
 */

/**
 * Palavras que não podem virar slug: colidiriam com rotas atuais ou futuras
 * sob /loja/. "publica" já existe em /api/loja/publica; os demais são defesa
 * contra segmentos que costumam aparecer (e contra slugs que viram a string
 * "null"/"undefined" por acidente de serialização).
 */
export const RESERVED_SLUGS = new Set([
    "publica", "api", "admin", "null", "undefined", "new", "edit",
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** "Depósito Izomar " -> "deposito-izomar" */
export function slugify(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")  // remove os acentos separados pelo NFD
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, SLUG_MAX)
        // O slice pode ter cortado no meio de um hífen separador.
        .replace(/-+$/g, "");
}

export type SlugCheck = { ok: true } | { ok: false; error: string };

export function isValidSlug(slug: string): SlugCheck {
    if (slug.length < SLUG_MIN) {
        return { ok: false, error: `O endereço precisa de pelo menos ${SLUG_MIN} caracteres.` };
    }
    if (slug.length > SLUG_MAX) {
        return { ok: false, error: `O endereço deve ter no máximo ${SLUG_MAX} caracteres.` };
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        return { ok: false, error: "Use apenas letras minúsculas, números e hífen entre palavras." };
    }
    if (RESERVED_SLUGS.has(slug)) {
        return { ok: false, error: "Este endereço é reservado. Escolha outro." };
    }
    return { ok: true };
}
