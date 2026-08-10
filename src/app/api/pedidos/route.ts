import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError, handleRouteError } from "@/lib/api-auth";
import { truncate, LIMITS } from "@/lib/validators";
import type { Status } from "@/lib/types";

const VALID_STATUSES: Status[] = ["novo", "confirmado", "rota", "entregue", "cancelado"];

/** GET /api/pedidos — pedidos da loja autenticada, ordenados para o kanban. */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { data, error } = await getSupabaseAdmin()
            .from("orders")
            .select("*")
            .eq("admin_id", auth.session.adminId)
            .order("position", { ascending: true });

        if (error) {
            console.error("[GET /api/pedidos]", error.message);
            return jsonError("Erro ao carregar pedidos.", 500);
        }

        return NextResponse.json({ orders: data ?? [] });
    } catch (e) {
        return handleRouteError(e, "GET /api/pedidos");
    }
}

/**
 * POST /api/pedidos — pedido manual criado pelo painel.
 *
 * O id é derivado do maior id existente em TODAS as lojas, não só na atual:
 * orders.id é texto e chave primária global, então numerar por loja faria duas
 * lojas disputarem o mesmo número. Mesma regra já usada em /api/atendimento.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        const { client, products, status } = parsed.body;

        const clientName = typeof client === "string" ? client.trim() : "";
        if (!clientName) return jsonError("Cliente é obrigatório.", 400);

        const productsStr = typeof products === "string" ? products.trim() : "";
        if (!productsStr) return jsonError("Produtos são obrigatórios.", 400);

        const st = typeof status === "string" ? status : "novo";
        if (!VALID_STATUSES.includes(st as Status)) return jsonError("Status inválido.", 400);

        const db = getSupabaseAdmin();

        const { data: globalMax } = await db
            .from("orders")
            .select("id")
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextId = String((parseInt(globalMax?.id ?? "0") || 0) + 1);

        const { count } = await db
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("admin_id", auth.session.adminId)
            .eq("status", st);

        const { data, error } = await db
            .from("orders")
            .insert({
                id:       nextId,
                client:   truncate(clientName, LIMITS.name),
                products: productsStr,
                status:   st,
                position: count ?? 0,
                admin_id: auth.session.adminId,
            })
            .select("*")
            .single();

        if (error) {
            console.error("[POST /api/pedidos]", error.message);
            return jsonError("Erro ao criar pedido.", 500);
        }

        return NextResponse.json({ order: data }, { status: 201 });
    } catch (e) {
        return handleRouteError(e, "POST /api/pedidos");
    }
}
