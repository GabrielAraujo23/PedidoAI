# Design: Gestão de Estoque + Importação NF-e + Observabilidade Real

**Data:** 2026-07-22
**Status:** Aprovado pelo usuário
**Branch:** preview

---

## Contexto

PedidoAI é um sistema de gestão de pedidos para loja de materiais de construção. O admin recebe mercadorias via DANFE (impressa), cadastra produtos manualmente hoje, e não tem controle de estoque. O dashboard exibe dados fictícios (hardcoded). Os produtos existentes no banco devem ser preservados em todas as migrações.

---

## Problemas a resolver

1. Cadastro de grandes volumes de produtos é lento (digitação manual)
2. Não há controle de quantidade em estoque
3. Não há visibilidade em tempo real do que tem ou não tem
4. Dashboard exibe dados estáticos fictícios

---

## Fora do escopo

- Logística / roteirização de entregas
- Pagamento online
- Notificações push / WhatsApp

---

## 1. Banco de Dados

### 1.1 Migração `products`

Adicionar dois campos com `ALTER TABLE` (sem recriar a tabela — preserva produtos existentes):

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS barcode TEXT;
```

Produtos já cadastrados ficam com `stock_quantity = 0` e `barcode = NULL`. O admin atualiza via recebimento de mercadoria.

### 1.2 Nova tabela `stock_movements`

Histórico imutável de toda movimentação de estoque:

```sql
CREATE TABLE stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admins(id),
  product_id  UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
  quantity    INTEGER NOT NULL,
  reference   TEXT,   -- chave NF-e, número do pedido, ou "ajuste manual"
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON stock_movements (admin_id, created_at DESC);
CREATE INDEX ON stock_movements (product_id);
```

RLS: admin só vê seus próprios movimentos (`admin_id = auth.uid()`).

### 1.3 Nova tabela `nfe_imports`

Registro de cada nota fiscal importada:

```sql
CREATE TABLE nfe_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES admins(id),
  chave_acesso  TEXT NOT NULL,
  supplier_name TEXT,
  total_items   INTEGER NOT NULL DEFAULT 0,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'completed'
);
```

---

## 2. Módulo "Receber Mercadoria" — `/estoque/receber`

Nova página acessível pelo menu lateral (ícone: PackagePlus). Duas abas:

### Aba A — Importar NF-e

**Fluxo:**

1. Admin escaneia o QR code do DANFE com a câmera do celular
   - O QR code da NF-e contém a chave de acesso de 44 dígitos na URL
   - O app extrai a chave da URL sem consultar nenhuma API externa
   - Alternativamente: upload do arquivo XML da NF-e (admin solicita ao fornecedor por e-mail uma vez)

2. Se XML disponível (upload):
   - Parser local extrai: `cProd` (código), `xProd` (descrição), `qCom` (quantidade), `uCom` (unidade), `vUnCom` (preço unitário)
   - Exibe tabela de revisão com status por item

3. Se apenas chave (sem XML):
   - Admin informa a chave manualmente ou via QR scan
   - Recebimento é registrado com a chave, mas itens precisam ser adicionados via Aba B (barcode)

4. Tabela de revisão — três estados por produto:
   - 🟢 **Match exato** — produto encontrado por código ou nome similar → atualiza estoque
   - 🟡 **Match parcial** — nome parecido, admin confirma ou corrige o vínculo
   - 🔴 **Novo produto** — cria automaticamente com `stock_quantity = quantidade recebida`

5. Admin clica "Confirmar Recebimento":
   - `stock_quantity` incrementado em cada produto
   - Um `stock_movement` de `type: 'entrada'` gravado por item
   - Um `nfe_import` registrado com a chave de acesso

### Aba B — Scanner de Código de Barras

**Fluxo:**

1. Admin abre câmera → aponta para o EAN/GTIN do produto físico
2. Sistema consulta **Open EAN API** (gratuita, sem chave):
   - `GET https://openfoodfacts.org/api/v0/product/{barcode}.json`
   - Fallback: `GET https://api.cosmos.bluesoft.com.br/gtins/{barcode}` (free tier)
3. Se encontrado: preenche nome, unidade automaticamente
4. Se não encontrado: admin preenche manualmente — barcode salvo no produto para uso futuro
5. Admin informa quantidade → confirma
6. `stock_quantity` atualizado + `stock_movement` gravado

**Ajuste manual de estoque:**
- Botão "Ajuste" em qualquer produto da lista — define quantidade absoluta ou incrementa/decrementa
- Grava `stock_movement` de `type: 'ajuste'` com campo `notes` obrigatório

---

## 3. Página `/estoque` — Visibilidade de Estoque

Menu lateral: novo item "Estoque" entre Produtos e Chat.

### 3.1 Visão geral (tab padrão)

Cards de resumo no topo:
- Total de SKUs ativos
- Produtos com estoque baixo (< threshold)
- Produtos zerados
- Valor total em estoque (soma `stock_quantity × price`)

Tabela de produtos com colunas:
- Nome / Categoria
- Unidade
- Estoque atual (com badge colorido)
- Threshold configurável por produto
- Ações: Ajustar, Ver histórico

**Badges de estoque:**
- 🟢 OK — `stock_quantity > threshold`
- 🟡 Baixo — `stock_quantity > 0 && stock_quantity <= threshold`
- 🔴 Zerado — `stock_quantity = 0`

Threshold padrão global: 5 unidades. Admin pode sobrescrever por produto.

### 3.2 Histórico de movimentações (tab)

Tabela paginada de `stock_movements`:
- Filtros: produto, tipo (entrada/saída/ajuste), período
- Colunas: data, produto, tipo, quantidade, referência (nº pedido ou chave NF-e), usuário

---

## 4. Integração com Pedidos

### Saída automática ao entregar

Quando um pedido muda para status `entregue`:

```typescript
// Em /api/orders/[id]/status ou no kanban update
for (const item of orderItems) {
  await supabase.rpc('decrement_stock', {
    p_product_id: item.product_id,
    p_quantity: item.quantity,
  });
  // Insere stock_movement type: 'saida', reference: `Pedido #${orderId}`
}
```

Função SQL para evitar stock negativo:
```sql
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS void AS $$
  UPDATE products
  SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0)
  WHERE id = p_product_id;
$$ LANGUAGE sql;
```

---

## 5. Dashboard — Dados Reais

Substituições no `src/app/page.tsx`:

| Elemento atual | Substituição |
|---|---|
| `chartData` hardcoded | Query real: pedidos por dia nos últimos 7 dias agrupados por `created_at::date` |
| Card "+12% TrendingUp" | Variação real: pedidos desta semana vs semana anterior |
| (novo card) | "Produtos com estoque baixo" com contagem real |

A query de pedidos por dia:
```sql
SELECT created_at::date AS day, COUNT(*) AS pedidos
FROM orders
WHERE admin_id = $1
  AND created_at >= now() - interval '7 days'
GROUP BY day
ORDER BY day;
```

---

## 6. Página `/produtos` — Coluna de Estoque

Adicionar à tabela existente:
- Coluna "Estoque" com badge colorido
- Ação rápida de ajuste inline (sem abrir modal completo)
- Filtro adicional: "Estoque baixo" / "Zerado"

---

## 7. Componentes e arquivos novos

```
src/
  app/
    estoque/
      page.tsx              ← visão geral + histórico
      receber/
        page.tsx            ← importar NF-e + barcode scanner
  api/
    estoque/
      receber/route.ts      ← POST: confirma recebimento, grava movements
      ajuste/route.ts       ← POST: ajuste manual de estoque
    orders/
      [id]/
        status/route.ts     ← PATCH: muda status + debita estoque se entregue
  components/
    barcode-scanner.tsx     ← câmera + leitura EAN (@zxing/browser)
    nfe-xml-parser.ts       ← parser local do XML da NF-e (sem API)
    stock-badge.tsx         ← badge reutilizável OK/Baixo/Zerado

supabase/migrations/
  008_add_stock_fields.sql
  009_create_stock_movements.sql
  010_create_nfe_imports.sql
  011_create_decrement_stock_fn.sql
```

---

## 8. Dependências novas

- `@zxing/browser` — leitura de código de barras via câmera (MIT, gratuito)
- Nenhuma outra dependência paga

---

## 9. Constraints importantes

- **Produtos existentes preservados** — migrações usam `ADD COLUMN IF NOT EXISTS`, nunca `DROP` ou `RECREATE`
- **Estoque nunca fica negativo** — função `GREATEST(stock - qty, 0)` no banco
- **Custo zero** — sem APIs pagas; Open EAN para lookup de barcode, parser XML local para NF-e
- **RLS** — todos os dados filtrados por `admin_id`, cada lojista vê apenas seus dados
