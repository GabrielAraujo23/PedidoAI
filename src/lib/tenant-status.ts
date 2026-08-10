/**
 * Ciclo de vida de uma tenant — regras puras, sem I/O.
 *
 * Isolado de propósito: é a única parte do fluxo de contratação coberta por
 * teste automatizado, porque um erro aqui não aparece em tela. Aparece como
 * uma loja no ar que devia estar cortada, ou cortada que devia estar no ar.
 *
 * Sem dependências de runtime: roda no Edge (middleware), no Node (rotas) e
 * no navegador.
 */

export type TenantStatus = "pendente" | "ativa" | "suspensa" | "recusada";
export type AdminRole    = "owner" | "lojista";

export const TENANT_STATUSES = ["pendente", "ativa", "suspensa", "recusada"] as const;
export const ADMIN_ROLES     = ["owner", "lojista"] as const;

/**
 * Transições válidas. "recusada" é terminal: quem foi recusado contrata de
 * novo, não é ressuscitado — senão o slug reservado pelo pedido antigo teria
 * que ser reconciliado com o novo, sem ninguém para decidir o empate.
 */
const ALLOWED_TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
    pendente: ["ativa", "recusada"],
    ativa:    ["suspensa"],
    suspensa: ["ativa"],
    recusada: [],
};

export function isTenantStatus(value: unknown): value is TenantStatus {
    return typeof value === "string" && (TENANT_STATUSES as readonly string[]).includes(value);
}

export function isAdminRole(value: unknown): value is AdminRole {
    return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function canTransition(from: TenantStatus, to: TenantStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Recusar e suspender tiram o serviço de alguém: o motivo vira a explicação na tela dele. */
export function requiresReason(to: TenantStatus): boolean {
    return to === "recusada" || to === "suspensa";
}

/** Portão do painel administrativo. */
export function canUsePanel(status: TenantStatus): boolean {
    return status === "ativa";
}

/**
 * Portão do lado do cliente final: /loja/<slug>, catálogo, checkout.
 * Hoje idêntico a canUsePanel, e ainda assim uma função separada — quando
 * existir inadimplência, é plausível cortar a venda antes do painel, e a
 * mudança precisa ter um lugar óbvio para acontecer.
 */
export function canServeCustomers(status: TenantStatus): boolean {
    return status === "ativa";
}
