export type Status = "novo" | "confirmado" | "rota" | "entregue";

export interface Order {
    id: string;
    client: string;
    products: string;
    status: Status;
    position: number;
    client_id?: string | null;
    created_at?: string;
    notes?: string | null;
}

export interface Client {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    // Structured address (migration 009)
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    created_at?: string;
}

export interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
    stock_quantity: number;
    barcode: string | null;
    admin_id: string | null;
    created_at: string;
}

export type StockMovementType = "entrada" | "saida" | "ajuste";

export interface StockMovement {
    id: string;
    admin_id: string;
    product_id: string;
    product_name: string;
    type: StockMovementType;
    quantity: number;
    reference: string | null;
    notes: string | null;
    created_at: string;
}

export interface NfeImport {
    id: string;
    admin_id: string;
    chave_acesso: string;
    supplier_name: string | null;
    total_items: number;
    imported_at: string;
    status: string;
}

export interface NfeProduct {
    cProd: string;
    xProd: string;
    uCom: string;
    qCom: number;
    vUnCom: number;
    cEAN: string | null;
}
