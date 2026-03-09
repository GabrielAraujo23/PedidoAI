-- Tabela de pedidos do PedidoAI
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    products TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'novo'
        CHECK (status IN ('novo', 'confirmado', 'rota', 'entregue')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais de exemplo
INSERT INTO orders (id, client, products, status, position) VALUES
    ('1234', 'João', '5 cimento', 'novo', 0),
    ('1235', 'Maria', '100 tijolo', 'confirmado', 0),
    ('1236', 'Pedro', '20 areia', 'rota', 0),
    ('1237', 'Ana', '10 cimento', 'entregue', 0)
ON CONFLICT (id) DO NOTHING;
