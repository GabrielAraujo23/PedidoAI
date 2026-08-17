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
    "login.bemvindo":              "Bem-vindo",
    "login.titulo":                "Faça seu pedido agora.",
    "login.subtitulo":             "Digite seu telefone para começar. Tudo rapidinho, sem cadastro chato.",
    "login.telefone":              "Telefone",
    "login.placeholder_telefone":  "(11) 99999-9999",
    "login.continuar":             "Continuar",
    "login.termos":                "Ao continuar, você concorda com receber pedidos via WhatsApp.",
    "login.que_bom_te_ver":        "Que bom te ver",
    "login.pronto":                "Pronto pra montar mais um pedido?",
    "login.entrar_pedir":          "Entrar e pedir",
    "login.nao_sou_eu":            "Não sou eu",
    "login.primeiro_acesso":       "Primeiro acesso",
    "login.dados_rapidos":         "Só uns dados rápidos para conseguirmos entregar direitinho na sua casa.",
    "login.nome_completo":         "Nome completo",
    "login.como_posso_chamar":     "Como posso te chamar?",
    "login.cep_nao_encontrado":    "CEP não encontrado.",
    "login.placeholder_cep":       "00000-000",
    "login.endereco":              "Endereço",
    "login.numero":                "Número",
    "login.placeholder_numero":    "123",
    "login.entrega_gratis":        "Entrega grátis",
    "login.cadastrar_entrar":      "Cadastrar e entrar",
    "login.voltar":                "Voltar",
    "login.precisa_loja":          "Não sabemos de qual loja você veio. Abra o link que a loja te enviou para continuar.",
    "login.loja_aberta":           "Loja Aberta",
    "login.erro_entrar":           "Erro ao entrar. Tente novamente.",
    "login.erro_cadastrar":        "Erro ao cadastrar. Tente novamente.",

    "cabecalho.buscar":            "Buscar materiais…",
    "cabecalho.buscar_rotulo":     "Buscar",
    "cabecalho.sair":              "Sair",
    "cabecalho.catalogo":          "Catálogo",
    "cabecalho.meus_pedidos":      "Meus Pedidos",

    "catalogo.categorias":         "Categorias",
    "catalogo.finalizar":          "Finalizar",
} as const;

export type CopyKey = keyof typeof COPY_PADRAO;

/** Comprimento máximo por chave, onde o layout não perdoa. */
export const LIMITES: Partial<Record<CopyKey, number>> = {
    "login.bemvindo":              20,
    "login.titulo":                48,
    "login.continuar":             20,
    "login.que_bom_te_ver":        20,
    "login.placeholder_telefone":  16,
    "login.nao_sou_eu":            18,
    "login.primeiro_acesso":       20,
    "login.entrega_gratis":        18,
    "login.placeholder_numero":    8,
    // Os dois CTAs dividem a linha do botão com uma seta de 16px e não quebram
    // em duas linhas: texto longo aqui estoura o botão em vez de embrulhar.
    "login.entrar_pedir":          24,
    "login.cadastrar_entrar":      24,
    "login.voltar":                16,
    // Itens de menu no cabeçalho: cabem lado a lado numa barra estreita.
    "cabecalho.catalogo":          18,
    "cabecalho.meus_pedidos":      18,
    "catalogo.finalizar":          16,
};
