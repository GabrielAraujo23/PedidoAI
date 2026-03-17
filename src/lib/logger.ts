// ============================================================
// logger.ts — Sistema de logging centralizado do PedidoAI
//
// REGRAS DE SEGURANÇA:
//   - NUNCA logar: senhas, password_hash, tokens, telefones
//     completos, endereços de email ou dados pessoais
//   - Usar actor_id (ex: CL001, UUID admin) — IDs opacos
//   - Usar metadata apenas com contagens, códigos de erro e flags
//   - logError() sanitiza o objeto de erro antes de exibir no console
// ============================================================

import { supabase } from "./supabase";

// ── Tipos de evento ──────────────────────────────────────────

export type EventType =
    // Autenticação — cliente
    | "client_login"
    | "client_registered"
    | "client_registration_failed"
    // Autenticação — admin
    | "admin_login_success"
    | "admin_login_failure"
    | "admin_signup_completed"
    | "admin_unauthorized_signup"
    | "admin_password_reset_requested"
    | "admin_password_reset_code_failed"
    | "admin_password_reset_completed"
    // Pedidos
    | "order_created"
    | "order_failed"
    // Produtos
    | "product_created"
    | "product_updated"
    | "product_deleted"
    | "product_toggled"
    // Configurações da loja
    | "store_settings_saved"
    | "store_settings_failed"
    // Erros de banco / sistema
    | "db_error";

export interface AuditEvent {
    event_type: EventType;
    actor_type?: "admin" | "client" | "system";
    /** ID opaco do ator (CL001, UUID admin). NUNCA email, telefone ou nome. */
    actor_id?: string;
    resource_type?: string;
    resource_id?: string;
    /** Metadados não-sensíveis: error_code, item_count, channel, etc. */
    metadata?: Record<string, unknown>;
}

// ── logEvent: persiste no banco de forma fire-and-forget ─────

export function logEvent(event: AuditEvent): void {
    // Fire-and-forget — logging jamais deve bloquear o fluxo principal
    supabase.from("audit_log").insert(event).then(({ error }) => {
        if (error) {
            // Fallback silencioso: não re-lança, evita loop de erro
            // eslint-disable-next-line no-console
            console.warn("[logger] falha ao persistir evento:", event.event_type);
        }
    });
}

// ── logError: console.error seguro sem expor dados sensíveis ─

/**
 * Loga um erro no console de forma sanitizada.
 * Extrai apenas `name`, `message` e `code` — nunca o objeto bruto.
 * @param context  Identificador do local do erro (ex: "order_creation")
 * @param error    O objeto de erro capturado no catch
 */
export function logError(context: string, error: unknown): void {
    let safe: Record<string, string>;

    if (error instanceof Error) {
        safe = { name: error.name, message: error.message };
    } else if (
        typeof error === "object" &&
        error !== null &&
        "code" in error
    ) {
        // Erro do Supabase — loga apenas o código (ex: "23505")
        // O `message` pode conter nomes de colunas/tabelas
        safe = { code: String((error as { code: unknown }).code) };
    } else {
        safe = { message: "unknown error" };
    }

    // eslint-disable-next-line no-console
    console.error(`[${context}]`, safe);
}
