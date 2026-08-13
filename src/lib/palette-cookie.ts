import {
    isPaletteFamily, isHex, ajustarParaContraste, textoSobre,
    FAMILIAS, ACENTO_PADRAO, MINIMO_UI, type PaletteFamily,
} from "@/lib/palette";

/**
 * Cookie da paleta — legível pelo navegador, de propósito.
 *
 * O script inline do <head> precisa dele ANTES de qualquer JavaScript de
 * módulo carregar, para aplicar a cor antes da primeira pintura. Não é segredo:
 * a cor da loja está visível na tela de qualquer maneira.
 *
 * Formato `familia|#RRGGBB` em vez de JSON, para o script inline poder ler com
 * um split em vez de um JSON.parse dentro de uma string escapada.
 */
export const PALETTE_COOKIE = "pedidoai_paleta";
const MAX_AGE = 60 * 60 * 24 * 30;

/**
 * `familia|#acentoClaro|#acentoEscuro|#textoClaro|#textoEscuro`
 *
 * As quatro cores derivadas sao calculadas AQUI, no servidor. O script inline
 * do <head> precisaria, senao, carregar a conversao para HSL e o laco de
 * ajuste dentro de uma string escapada - codigo indepuravel, rodando a cada
 * carregamento de pagina. Aqui a conta acontece uma vez, ao gravar o cookie.
 */
export function serializarPaleta(familia: unknown, acento: unknown): string {
    const f: PaletteFamily = isPaletteFamily(familia) ? familia : "creme";
    const base = isHex(acento) ? acento : ACENTO_PADRAO;

    // MINIMO_UI (3:1), nao MINIMO (4.5:1): o acento e preenchimento, e quem
    // precisa de 4.5:1 e o texto em cima dele. Usar 4.5 aqui transformaria um
    // amarelo de marca num oliva escuro.
    const claro  = ajustarParaContraste(base, FAMILIAS[f].claro.background, MINIMO_UI);
    const escuro = ajustarParaContraste(base, FAMILIAS[f].escuro.background, MINIMO_UI);

    return [f, claro, escuro, textoSobre(claro), textoSobre(escuro)].join("|");
}

export function paletteCookieOptions() {
    return {
        httpOnly: false, // o script inline precisa ler
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge: MAX_AGE,
    };
}
