import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireOwner, readJson, jsonError, handleRouteError } from "@/lib/api-auth";
import {
    canTransition, requiresReason, isTenantStatus, type TenantStatus,
} from "@/lib/tenant-status";

interface LojaEmbed { store_name: string | null; slug: string | null; cnpj: string | null; phone: string | null; address: string | null; white_label: boolean | null }
interface LinhaFila {
    id: string; email: string; status: string; status_reason: string | null;
    status_changed_at: string | null; created_at: string | null;
    terms_accepted_at: string | null; terms_version: string | null; terms_ip: string | null;
    store_settings: LojaEmbed | LojaEmbed[] | null;
}

function primeiraLoja(v: LinhaFila["store_settings"]): LojaEmbed | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * GET /api/pedido-ai-admin/contratacoes?status=pendente — a fila do dono.
 *
 * Devolve tudo que a decisão de aprovar exige: dados da loja, endereço
 * pedido e a prova do aceite (data, versão e IP).
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireOwner(request);
        if (!auth.ok) return auth.response;

        const filtro = request.nextUrl.searchParams.get("status");

        let query = getSupabaseAdmin()
            .from("admins")
            .select(
                "id, email, status, status_reason, status_changed_at, created_at, " +
                "terms_accepted_at, terms_version, terms_ip, " +
                "store_settings(store_name, slug, cnpj, phone, address, white_label)"
            )
            .neq("role", "owner")
            .order("created_at", { ascending: false })
            .limit(200);

        if (filtro && isTenantStatus(filtro)) query = query.eq("status", filtro);

        const { data, error } = await query;

        if (error) {
            console.error("[GET /api/pedido-ai-admin/contratacoes]", error.message);
            return jsonError("Erro ao carregar as contratações.", 500);
        }

        const contratacoes = ((data ?? []) as unknown as LinhaFila[]).map((row) => {
            const loja = primeiraLoja(row.store_settings);
            return {
                adminId:   row.id,
                email:     row.email,
                status:    row.status,
                reason:    row.status_reason,
                changedAt: row.status_changed_at,
                createdAt: row.created_at,
                terms:     { acceptedAt: row.terms_accepted_at, version: row.terms_version, ip: row.terms_ip },
                loja: {
                    storeName:  loja?.store_name ?? null,
                    slug:       loja?.slug ?? null,
                    cnpj:       loja?.cnpj ?? null,
                    phone:      loja?.phone ?? null,
                    address:    loja?.address ?? null,
                    whiteLabel: loja?.white_label === true,
                },
            };
        });

        return NextResponse.json({ contratacoes });
    } catch (e) {
        return handleRouteError(e, "GET /api/pedido-ai-admin/contratacoes");
    }
}

/**
 * PATCH /api/pedido-ai-admin/contratacoes — muda o status de uma tenant.
 *
 * Body: { adminId, status, reason? }
 *
 * A transição é validada contra a máquina de estados (src/lib/tenant-status.ts)
 * ANTES de escrever. O UPDATE ainda repete o status de origem no WHERE: entre
 * a leitura e a escrita alguém pode ter mudado, e a checagem em memória não
 * vale nada nesse intervalo.
 */
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireOwner(request);
        if (!auth.ok) return auth.response;

        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        const adminId = typeof parsed.body.adminId === "string" ? parsed.body.adminId.trim() : "";
        const destino = parsed.body.status;
        const reason  = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";

        if (!adminId) return jsonError("Contratação não informada.", 400);
        if (adminId === auth.session.adminId) {
            return jsonError("Você não pode alterar a própria conta.", 400);
        }

        const db = getSupabaseAdmin();

        // Alternar white-label é a outra decisão que o dono toma sobre uma
        // conta. Mora nesta rota porque é a mesma autorização — requireOwner,
        // alvo validado, conta própria protegida — e sai cedo, sem passar pela
        // máquina de estados, que não tem nada a ver com marca.
        //
        // ATENÇÃO À ORDEM: este bloco precisa vir ANTES da validação de
        // `status`. Uma chamada de white-label não manda `status` nenhum, e a
        // validação abaixo rejeitaria com "Status inválido" antes de chegar
        // aqui — foi exatamente esse o bug que deixou o botão da fila sem
        // funcionar desde que nasceu.
        if (typeof parsed.body.whiteLabel === "boolean") {
            const { data: atualizado, error: wlErr } = await db
                .from("store_settings")
                .update({ white_label: parsed.body.whiteLabel })
                .eq("admin_id", adminId)
                .select("admin_id, white_label")
                .maybeSingle();

            if (wlErr) {
                console.error("[PATCH contratacoes] white_label", wlErr.message);
                // 42703 = coluna inexistente: a migration 028 não rodou aqui.
                return jsonError(
                    wlErr.code === "42703"
                        ? "Coluna 'white_label' não encontrada. Execute a migration 028 no Supabase."
                        : "Erro ao atualizar o white-label.",
                    500
                );
            }
            if (!atualizado) return jsonError("Loja não encontrada para esta conta.", 404);

            return NextResponse.json({ adminId, whiteLabel: atualizado.white_label });
        }

        // Daqui para baixo é mudança de status, e só ela.
        if (!isTenantStatus(destino)) return jsonError("Status inválido.", 400);

        const { data: alvo, error: readErr } = await db
            .from("admins").select("id, status, role").eq("id", adminId).maybeSingle();

        if (readErr) {
            console.error("[PATCH /api/pedido-ai-admin/contratacoes] read", readErr.message);
            return jsonError("Erro ao carregar a contratação.", 500);
        }
        if (!alvo) return jsonError("Contratação não encontrada.", 404);
        if (alvo.role === "owner") return jsonError("Não é possível alterar uma conta de dono.", 400);
        if (!isTenantStatus(alvo.status)) return jsonError("Conta em estado inconsistente.", 500);

        if (!canTransition(alvo.status, destino as TenantStatus)) {
            return jsonError(`Não é possível ir de "${alvo.status}" para "${destino}".`, 409);
        }
        if (requiresReason(destino as TenantStatus) && !reason) {
            return jsonError("Informe o motivo — ele aparece para o lojista.", 400);
        }

        const { data: updated, error: updErr } = await db
            .from("admins")
            .update({
                status:            destino,
                status_reason:     reason || null,
                status_changed_at: new Date().toISOString(),
            })
            .eq("id", adminId)
            .eq("status", alvo.status) // perde a corrida quem chegou depois
            .select("id, status")
            .maybeSingle();

        if (updErr) {
            console.error("[PATCH /api/pedido-ai-admin/contratacoes] update", updErr.message);
            return jsonError("Erro ao atualizar o status.", 500);
        }
        if (!updated) {
            return jsonError("O status mudou enquanto você decidia. Recarregue a fila.", 409);
        }

        return NextResponse.json({ adminId: updated.id, status: updated.status });
    } catch (e) {
        return handleRouteError(e, "PATCH /api/pedido-ai-admin/contratacoes");
    }
}
