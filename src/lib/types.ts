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
    created_at?: string;
}
