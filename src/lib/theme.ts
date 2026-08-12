/**
 * Preferência de tema — regras puras, sem I/O e sem DOM.
 *
 * A escolha é de quem olha, não da loja: mora no localStorage do aparelho e
 * nunca vai para o banco. "sistema" não é ausência de escolha — é a escolha
 * de acompanhar o aparelho, e é o padrão de quem nunca mexeu.
 */

export type Theme = "claro" | "escuro" | "sistema";
export type ThemeAplicado = "claro" | "escuro";

export const THEMES = ["claro", "escuro", "sistema"] as const;

/**
 * Chave do localStorage.
 *
 * ATENÇÃO: o script inline do <head> em src/app/layout.tsx repete esta string
 * cravada, e não tem como importá-la — ele é texto dentro de
 * dangerouslySetInnerHTML, avaliado antes de qualquer módulo carregar. Mudar
 * uma sem a outra faz a preferência ser gravada num lugar e lida de outro: o
 * botão funciona, e ao recarregar volta tudo ao padrão.
 */
export const THEME_KEY = "pedidoai_tema";

export function isTheme(value: unknown): value is Theme {
    return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * O que de fato pintar na tela.
 *
 * Valor ausente ou corrompido cai em "sistema" em vez de num tema fixo: se o
 * localStorage vier sujo, acompanhar o aparelho é sempre uma resposta
 * defensável, enquanto forçar claro contraria quem usa o celular no escuro.
 */
export function resolveTheme(preferencia: unknown, sistemaEscuro: boolean): ThemeAplicado {
    if (preferencia === "claro" || preferencia === "escuro") return preferencia;
    return sistemaEscuro ? "escuro" : "claro";
}

/**
 * O que o botão faz.
 *
 * A partir de "sistema", vai para o OPOSTO do que está valendo — senão o
 * primeiro clique não mudaria nada visível e pareceria um botão quebrado.
 */
export function nextTheme(atual: Theme, sistemaEscuro = false): ThemeAplicado {
    const valendo = resolveTheme(atual, sistemaEscuro);
    return valendo === "escuro" ? "claro" : "escuro";
}
