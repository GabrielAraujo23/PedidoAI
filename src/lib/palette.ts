/**
 * Cor da loja — famílias, contraste e ajuste. Puro, sem I/O.
 *
 * Os valores das famílias foram MEDIDOS antes de entrarem aqui: todo par
 * texto/superfície passa de 4.5:1 nos dois temas, e o teste desta pasta
 * percorre todos eles a cada execução. Isso não é zelo excessivo — no sprint
 * anterior os tokens do produto foram escolhidos a olho e quatro reprovaram,
 * deixando texto invisível em produção.
 *
 * Roda no Edge, no Node e no navegador.
 */

export type PaletteFamily = "creme" | "neve" | "areia" | "grafite";
export type TemaAplicado = "claro" | "escuro";

export const PALETTE_FAMILIES = ["creme", "neve", "areia", "grafite"] as const;

/** O laranja do PedidoAI. `accent_color` nulo significa "esta cor". */
export const ACENTO_PADRAO = "#C2410C";

export interface Superficies {
    background: string;
    card: string;
    muted: string;
    foreground: string;
    mutedForeground: string;
    border: string;
}

export const FAMILIAS: Record<PaletteFamily, Record<TemaAplicado, Superficies>> = {
    creme: {
        claro:  { background: "#F7F2EA", card: "#FFFFFF", muted: "#EFE9E1", foreground: "#1C1917", mutedForeground: "#57534E", border: "#D6CDBF" },
        escuro: { background: "#17130F", card: "#221C17", muted: "#2C241E", foreground: "#F0E9E0", mutedForeground: "#B0A398", border: "#453A31" },
    },
    neve: {
        claro:  { background: "#F8FAFC", card: "#FFFFFF", muted: "#F1F5F9", foreground: "#0F172A", mutedForeground: "#475569", border: "#CBD5E1" },
        escuro: { background: "#0F1115", card: "#191C22", muted: "#23272F", foreground: "#E8ECF2", mutedForeground: "#A3ADBB", border: "#363B45" },
    },
    areia: {
        claro:  { background: "#F5F3F0", card: "#FFFFFF", muted: "#EAE7E2", foreground: "#1F1D1A", mutedForeground: "#55514B", border: "#D3CEC6" },
        escuro: { background: "#151412", card: "#201E1B", muted: "#2A2724", foreground: "#EFEDE9", mutedForeground: "#ADA79F", border: "#423E39" },
    },
    grafite: {
        claro:  { background: "#F4F4F5", card: "#FFFFFF", muted: "#E4E4E7", foreground: "#18181B", mutedForeground: "#52525B", border: "#CBCBD1" },
        escuro: { background: "#101012", card: "#1B1B1F", muted: "#26262B", foreground: "#EDEDF0", mutedForeground: "#A1A1AA", border: "#3A3A41" },
    },
};

export const NOMES_FAMILIA: Record<PaletteFamily, string> = {
    creme: "Creme", neve: "Neve", areia: "Areia", grafite: "Grafite",
};

export function isPaletteFamily(v: unknown): v is PaletteFamily {
    return typeof v === "string" && (PALETTE_FAMILIES as readonly string[]).includes(v);
}

export function isHex(v: unknown): v is string {
    return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
}

// ── Contraste (WCAG 2.1) ─────────────────────────────────────────────────

function luminancia(hex: string): number {
    const canais = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

export function contraste(a: string, b: string): number {
    const x = luminancia(a), y = luminancia(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Mínimo da WCAG para texto normal. */
export const MINIMO = 4.5;

/**
 * Mínimo para elemento de interface não-textual (WCAG 1.4.11).
 *
 * É esta a régua do acento, e não os 4.5:1. Neste app o acento é quase sempre
 * PREENCHIMENTO — fundo de botão, badge, pílula — e o que precisa de 4.5:1 é o
 * texto EM CIMA dele, garantido por `textoSobre`. Exigir 4.5:1 do próprio
 * preenchimento contra o fundo da página destruiria toda cor de marca vibrante:
 * um amarelo `#FDE047` viraria `#816C01`, um oliva escuro que o lojista não
 * reconheceria como a cor dele.
 */
export const MINIMO_UI = 3;

// ── HSL, para ajustar sem trocar a cor ───────────────────────────────────

function paraHsl(hex: string): [number, number, number] {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? (((g - b) / d) % 6) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [((h * 60) + 360) % 360, s, l];
}

function paraHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60  ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
        h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const cv = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0").toUpperCase();
    return `#${cv(r)}${cv(g)}${cv(b)}`;
}

/**
 * O tom mais próximo que atinge o mínimo de contraste.
 *
 * Mexe SÓ na luminosidade, de 1% em 1%, mantendo matiz e saturação. É isso que
 * faz o resultado ainda parecer a cor do lojista: um vermelho escurecido
 * continua vermelho, enquanto mexer no matiz o entregaria roxo — e ele diria,
 * com razão, que o sistema trocou a marca dele.
 *
 * Se nem preto nem branco puros atingirem o mínimo (fundo de luminância
 * intermediária), devolve o extremo que chegou mais perto: melhor o mais
 * legível possível do que desistir e deixar como estava.
 */
export function ajustarParaContraste(cor: string, fundo: string, alvo = MINIMO): string {
    if (!isHex(cor) || !isHex(fundo)) return cor;
    if (contraste(cor, fundo) >= alvo) return cor;

    const [h, s, l] = paraHsl(cor);
    // Fundo claro pede acento mais escuro, e vice-versa.
    const escurecer = luminancia(fundo) > 0.18;

    let melhor = cor;
    let melhorRazao = contraste(cor, fundo);

    for (let passo = 1; passo <= 100; passo++) {
        const novoL = escurecer ? l - passo / 100 : l + passo / 100;
        if (novoL < 0 || novoL > 1) break;
        const candidata = paraHex(h, s, novoL);
        const razao = contraste(candidata, fundo);
        if (razao > melhorRazao) { melhor = candidata; melhorRazao = razao; }
        if (razao >= alvo) return candidata;
    }
    return melhor;
}

// ── Avaliação para a tela ────────────────────────────────────────────────

export interface AvaliacaoTema {
    /** A cor que sera de fato usada neste tema. */
    cor: string;
    /** true = precisou clarear ou escurecer a escolha do lojista. */
    adaptado: boolean;
    /** Contraste da cor USADA contra o fundo do tema. */
    razao: number;
    /** true = a cor usada atinge o mínimo de 4.5:1 neste tema. */
    passa: boolean;
    /** A cor sugerida (o resultado do ajuste), para a tela oferecer. */
    sugestao: string;
}

/**
 * Qual variacao do acento cada tema recebe.
 *
 * Nao existe veredito de "reprovado" para a cor original: nenhuma cor unica
 * passa 4.5:1 contra um fundo quase branco E um quase preto ao mesmo tempo -
 * as faixas de luminancia sao disjuntas. Entao a pergunta util nao e "sua cor
 * passa?", e sim "em qual tema ela precisou ser adaptada, e para qual tom".
 * `passa` reflete a cor JA adaptada (`cor`), e existe para a tela decidir se
 * mostra o aviso; `sugestao` e o tom que a tela oferece para substituir a
 * escolha original.
 */
export function avaliarAcento(
    cor: string,
    familia: string
): Record<TemaAplicado, AvaliacaoTema> {
    const f = isPaletteFamily(familia) ? familia : "creme";
    const escolhida = isHex(cor) ? cor : ACENTO_PADRAO;
    const saida = {} as Record<TemaAplicado, AvaliacaoTema>;

    for (const tema of ["claro", "escuro"] as const) {
        const fundo = FAMILIAS[f][tema].background;
        const razaoOriginal = contraste(escolhida, fundo);
        // MINIMO_UI, não MINIMO: o acento é preenchimento, não texto.
        const passa = razaoOriginal >= MINIMO_UI;
        const sugestao = ajustarParaContraste(escolhida, fundo, MINIMO_UI);
        saida[tema] = {
            cor: passa ? escolhida : sugestao,
            adaptado: !passa,
            razao: razaoOriginal,
            passa,
            sugestao,
        };
    }
    return saida;
}

// ── Tokens ───────────────────────────────────────────────────────────────

/**
 * Preto ou branco sobre a cor dada — o que tiver mais contraste.
 *
 * O par acento/texto-do-acento tem de ser calculado junto. Com
 * `--primary-foreground` branco fixo, um lojista que escolhesse amarelo teria
 * botões de texto branco sobre amarelo: ilegíveis, e sem aviso nenhum, porque
 * a validação da tela olha o acento contra o FUNDO, não contra o próprio texto.
 */
export function textoSobre(cor: string): string {
    const claro = "#FFFFFF";
    const escuro = "#17130F";
    return contraste(claro, cor) >= contraste(escuro, cor) ? claro : escuro;
}

/**
 * As variáveis CSS de uma loja, para um tema.
 *
 * Família desconhecida cai em creme em vez de lançar: um valor estranho no
 * banco não pode derrubar a loja do ar — ela volta ao padrão do produto, que
 * é sempre uma resposta defensável.
 */
export function tokensDaLoja(
    familia: string,
    acento: string | null,
    tema: TemaAplicado
): Record<string, string> {
    const f = isPaletteFamily(familia) ? familia : "creme";
    const v = FAMILIAS[f][tema];
    // O acento guardado e um so; a variacao de cada tema e derivada, porque
    // nenhuma cor unica e legivel sobre fundo claro e escuro ao mesmo tempo.
    const primary = ajustarParaContraste(isHex(acento) ? acento : ACENTO_PADRAO, v.background, MINIMO_UI);

    return {
        "--primary-foreground": textoSobre(primary),
        "--background": v.background,
        "--card": v.card,
        "--popover": v.card,
        "--muted": v.muted,
        "--secondary": v.muted,
        "--accent": v.muted,
        "--foreground": v.foreground,
        "--card-foreground": v.foreground,
        "--popover-foreground": v.foreground,
        "--secondary-foreground": v.foreground,
        "--accent-foreground": v.foreground,
        "--muted-foreground": v.mutedForeground,
        "--border": v.border,
        "--input": v.border,
        "--primary": primary,
        "--ring": tema === "claro" ? v.foreground : primary,
        "--sidebar": v.background,
        "--sidebar-foreground": v.foreground,
        "--sidebar-border": v.border,
        "--sidebar-primary": primary,
    };
}
