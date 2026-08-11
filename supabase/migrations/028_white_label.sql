-- ============================================================
-- 028_white_label.sql
--
-- Permite esconder o credito "desenvolvido por PedidoAI" nas
-- telas de uma loja especifica.
--
-- O DEFAULT E false de proposito: toda loja nasce exibindo o
-- credito. Tirar a marca e a excecao que alguem precisa conceder,
-- nunca o padrao silencioso.
--
-- Quem escreve esta coluna e SO o dono, pela rota da fila de
-- contratacoes. Ela nao entra no formulario de /loja - senao o
-- lojista removeria o credito sozinho e o "plano superior" nao
-- significaria nada. O PUT /api/loja continua ignorando campos que
-- nao sao dele, como ja faz com admin_id, id e created_at.
--
-- IDEMPOTENTE.
-- ============================================================

ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS white_label BOOLEAN NOT NULL DEFAULT false;
