import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
    isTenantStatus, isAdminRole, canServeCustomers,
    type TenantStatus, type AdminRole,
} from "@/lib/tenant-status";

/**
 * Estado vivo de uma conta, lido do banco.
 *
 * O cookie tambem carrega role e status, mas ele vale 24h: uma suspensao
 * que dependesse so dele daria um dia de servico gratis a um inadimplente.
 * O cookie serve ao portao barato de pagina; aqui esta a palavra final.
 *
 * Server-only: importa a service role. Nunca importar em client component
 * nem no middleware (Edge).
 */
export interface AdminAuthState {
    adminId: string;
    email:   string;
    role:    AdminRole;
    status:  TenantStatus;
}

export async function getAdminAuthState(adminId: string): Promise<AdminAuthState | null> {
    const { data, error } = await getSupabaseAdmin()
        .from("admins")
        .select("id, email, role, status")
        .eq("id", adminId)
        .maybeSingle();

    if (error) {
        console.error("[getAdminAuthState]", error.message);
        return null;
    }
    if (!data) return null;
    // Valor fora do dominio conhecido nao vira "ativa" por omissao.
    if (!isAdminRole(data.role) || !isTenantStatus(data.status)) {
        console.error("[getAdminAuthState] role/status invalido para", adminId, data.role, data.status);
        return null;
    }

    return { adminId: data.id, email: data.email, role: data.role, status: data.status };
}

/**
 * A loja pode atender cliente final agora?
 *
 * Usado por /loja/<slug>, /api/loja/publica e resolveTenant. Bloquear so o
 * painel deixaria uma loja suspensa RECEBENDO PEDIDOS pelo link publico.
 */
export async function isTenantActive(adminId: string): Promise<boolean> {
    const state = await getAdminAuthState(adminId);
    return state !== null && canServeCustomers(state.status);
}

/** admin_id das contas que podem atender cliente final, no maximo `limit`. */
export async function listActiveAdminIds(limit: number): Promise<string[]> {
    const { data, error } = await getSupabaseAdmin()
        .from("admins")
        .select("id")
        .eq("status", "ativa")
        .order("created_at", { ascending: true })
        .limit(limit);

    if (error) {
        console.error("[listActiveAdminIds]", error.message);
        return [];
    }
    return (data ?? []).map((row) => row.id as string);
}
