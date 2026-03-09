-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relacionamento: orders passa a referenciar clients
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id);

-- Dados iniciais de clientes
INSERT INTO clients (id, name, phone, address) VALUES
    ('CL001', 'João Silva',    '(11) 99999-9999', 'Rua X, 123'),
    ('CL002', 'Maria Oliveira','(11) 88888-8888', 'Av Y, 456'),
    ('CL003', 'Pedro Santos',  '(11) 77777-7777', 'Rua Z, 789'),
    ('CL004', 'Ana Costa',     '(11) 66666-6666', 'Av W, 321')
ON CONFLICT (id) DO NOTHING;

-- Vincular pedidos existentes aos clientes pelo nome
UPDATE orders SET client_id = 'CL001' WHERE id = '1234';
UPDATE orders SET client_id = 'CL002' WHERE id = '1235';
UPDATE orders SET client_id = 'CL003' WHERE id = '1236';
UPDATE orders SET client_id = 'CL004' WHERE id = '1237';
