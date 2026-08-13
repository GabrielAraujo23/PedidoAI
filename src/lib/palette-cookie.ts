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

/**
 * Reaplica a paleta ao trocar de tema. Só no navegador.
 *
 * O script inline do <head> grava as variáveis como estilo INLINE no
 * documentElement, que tem precedência máxima. Trocar a classe `.dark` muda o
 * que o CSS diria, mas não consegue sobrepor o inline — o resultado eram
 * tokens de um tema pintados sobre o outro: fundo que só mudava recarregando,
 * e texto secundário claro sobre fundo claro.
 *
 * Lê o mesmo cookie que o script inline, com as quatro cores já derivadas pelo
 * servidor, e regrava a metade certa.
 */
export function aplicarPaletaDoTema(escuro: boolean): void {
    if (typeof document === "undefined") return;

    const m = document.cookie.match(/(?:^|; )pedidoai_paleta=([^;]*)/);
    if (!m) return;

    const p = decodeURIComponent(m[1]).split("|");
    const familia: PaletteFamily = isPaletteFamily(p[0]) ? p[0] : "creme";
    const v = FAMILIAS[familia][escuro ? "escuro" : "claro"];

    const acento = isHex(p[escuro ? 2 : 1]) ? p[escuro ? 2 : 1] : ACENTO_PADRAO;
    const sobre  = isHex(p[escuro ? 4 : 3]) ? p[escuro ? 4 : 3] : textoSobre(acento);

    const s = document.documentElement.style;
    const set = (k: string, valor: string) => s.setProperty(k, valor);

    set("--background", v.background);
    set("--card", v.card);
    set("--popover", v.card);
    set("--muted", v.muted);
    set("--secondary", v.muted);
    set("--accent", v.muted);
    set("--foreground", v.foreground);
    set("--card-foreground", v.foreground);
    set("--popover-foreground", v.foreground);
    set("--secondary-foreground", v.foreground);
    set("--accent-foreground", v.foreground);
    set("--muted-foreground", v.mutedForeground);
    set("--border", v.border);
    set("--input", v.border);
    set("--primary", acento);
    set("--primary-foreground", sobre);
    set("--sidebar", v.background);
    set("--sidebar-foreground", v.foreground);
    set("--sidebar-border", v.border);
    set("--sidebar-primary", acento);
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
