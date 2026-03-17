export type Status = "novo" | "confirmado" | "rota" | "entregue";

export interface Order {
    id: string;
    client: string;
    products: string;
    status: Status;
    position: number;
    client_id?: string | null;
    created_at?: string;
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
