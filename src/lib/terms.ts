/**
 * Contrato aceito na contratação.
 *
 * A VERSÃO é gravada junto do aceite em `admins.terms_version`. Sem ela,
 * mudar este texto amanhã apagaria a prova de o que a pessoa aceitou hoje —
 * e é justamente essa prova que dá respaldo para cobrar e para suspender.
 *
 * Ao alterar TERMS_TEXT, incremente TERMS_VERSION na mesma edição.
 */
export const TERMS_VERSION = "2026-08-10";

export const TERMS_TEXT = `
1. O PedidoAI é fornecido como serviço de gestão de pedidos e catálogo online.

2. A liberação da loja depende de análise e aprovação. O cadastro não garante
   a liberação.

3. O lojista é responsável pelos dados que cadastra: produtos, preços,
   estoque, prazos e informações da loja.

4. O lojista é responsável pela relação com seus clientes finais, incluindo
   entrega, cobrança, trocas e devoluções.

5. O serviço pode ser suspenso em caso de falta de pagamento, uso indevido ou
   descumprimento destes termos. A suspensão derruba o endereço público da
   loja e o acesso ao painel; os dados são preservados.

6. O lojista pode solicitar o encerramento a qualquer momento.
`.trim();
