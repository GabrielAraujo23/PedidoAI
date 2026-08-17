/**
 * Catálogo de textos do PedidoAI.
 *
 * Cada chave é `<tela>.<elemento>`, e o valor é o texto que aparece hoje —
 * byte a byte. Esta etapa é refactor puro: nada muda na tela.
 *
 * Marcadores `{nome}` são substituídos por `interpolar()`. Um texto com valor
 * no meio ("3 itens") vira "{n} itens" — sem isso, a extração começaria
 * quebrando o que funciona.
 *
 * LIMITES declara o comprimento máximo de uma chave cujo layout é apertado.
 * Serve ao Sprint 3c: um texto gerado por IA que estoure o limite destrói a
 * tela que os Sprints 1 e 2 calibraram. Chave sem limite é livre.
 */

export const COPY_PADRAO = {
    "login.bemvindo":     "Bem-vindo",
    "login.titulo":       "Faça seu pedido agora.",
    "login.subtitulo":    "Digite seu telefone para começar. Tudo rapidinho, sem cadastro chato.",
    "login.telefone":     "Telefone",
    "login.continuar":    "Continuar",
    "login.termos":       "Ao continuar, você concorda com receber pedidos via WhatsApp.",
} as const;

export type CopyKey = keyof typeof COPY_PADRAO;

/** Comprimento máximo por chave, onde o layout não perdoa. */
export const LIMITES: Partial<Record<CopyKey, number>> = {
    "login.bemvindo":  20,
    "login.titulo":    48,
    "login.continuar": 20,
};
