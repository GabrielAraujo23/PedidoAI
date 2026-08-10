import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireClient, readJson, jsonError, handleRouteError } from "@/lib/api-auth";
import { truncate, LIMITS } from "@/lib/validators";
import { notifyOrderStatus } from "@/lib/notify-order";

/** Campos de endereço que o cliente pode gravar no próprio cadastro. */
const ADDRESS_FIELDS = [
    "cep", "street", "number", "complement", "neighborhood", "city", "state",
    "latitude", "longitude",
] as const;

function pickAddress(body: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const f of ADDRESS_FIELDS) {
        if (body[f] === undefined) continue;
        const v = body[f];
        if (v === null) { out[f] = null; continue; }
        if (f === "latitude" || f === "longitude") {
            const n = Number(v);
            out[f] = Number.isFinite(n) ? n : null;
        } else {
            out[f] = truncate(String(v), 255);
        }
    }
    return out;
}

/** GET /api/cliente/checkout — config de entrega da loja + endereço salvo. */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const { clientId, adminId } = auth.session;
        const db = getSupabaseAdmin();

        const [storeRes, clientRes] = await Promise.all([
            db.from("store_settings")
                .select("latitude, longitude, delivery_radius_km, delivery_rate_per_km")
                .eq("admin_id", adminId)
                .maybeSingle(),
            db.from("clients").select("*").eq("id", clientId).maybeSingle(),
        ]);

        return NextResponse.json({
            store:  storeRes.data ?? null,
            client: clientRes.data ?? null,
        });
    } catch (e) {
        return handleRouteError(e, "GET /api/cliente/checkout");
    }
}

/** PATCH /api/cliente/checkout — grava o endereço no cadastro do cliente. */
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        const patch = pickAddress(parsed.body);
        if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

        const { error } = await getSupabaseAdmin()
            .from("clients")
            .update(patch)
            .eq("id", auth.session.clientId);

        if (error) {
            console.error("[PATCH /api/cliente/checkout]", error.message);
            return jsonError("Erro ao salvar endereço.", 500);
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        return handleRouteError(e, "PATCH /api/cliente/checkout");
    }
}

/**
 * POST /api/cliente/checkout — fecha o pedido.
 *
 * O id e a posição são calculados aqui. A tela derivava os dois de
 * `select("id, status")` sem filtro nenhum, ou seja, lia os pedidos de todas
 * as lojas — e a contagem de "novo" usada como posição vinha misturada com
 * pedidos de outros lojistas.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireClient(request);
        if (!auth.ok) return auth.response;

        const { clientId, adminId, name } = auth.session;
        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        const { items, distance_km, delivery_fee } = parsed.body as {
            items?: { product_id: string; name: string; unit: string; quantity: number; price: number }[];
            distance_km?: number | null;
            delivery_fee?: number | null;
        };

        if (!Array.isArray(items) || items.length === 0) {
            return jsonError("Carrinho vazio.", 400);
        }
        for (const i of items) {
            if (!i.product_id || !Number.isFinite(i.quantity) || i.quantity < 1) {
                return jsonError(`Item inválido: ${i.name ?? "desconhecido"}`, 400);
            }
        }

        const db = getSupabaseAdmin();
        const address = pickAddress(parsed.body);

        // Endereço final também fica no cadastro, para o próximo pedido.
        if (Object.keys(address).length > 0) {
            await db.from("clients").update(address).eq("id", clientId);
        }

        const { data: globalMax } = await db
            .from("orders").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
        const nextId = String((parseInt(globalMax?.id ?? "0") || 0) + 1);

        const { count: novoCount } = await db
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("admin_id", adminId)
            .eq("status", "novo");

        const { data: order, error } = await db
            .from("orders")
            .insert({
                id:           nextId,
                client:       truncate(name, LIMITS.name),
                client_id:    clientId,
                products:     items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
                status:       "novo",
                position:     novoCount ?? 0,
                distance_km:  Number.isFinite(distance_km as number) ? distance_km : null,
                delivery_fee: Number.isFinite(delivery_fee as number) ? delivery_fee : null,
                admin_id:     adminId,
                ...address,
            })
            .select("id")
            .single();

        if (error || !order) {
            console.error("[POST /api/cliente/checkout] order:", error?.message);
            return jsonError("Erro ao criar pedido. Tente novamente.", 500);
        }

        const { error: itemsErr } = await db.from("order_items").insert(
            items.map((i) => ({
                order_id:     order.id,
                product_id:   i.product_id,
                product_name: i.name,
                unit:         i.unit,
                quantity:     i.quantity,
                unit_price:   i.price,
                admin_id:     adminId,
            }))
        );

        if (itemsErr) {
            console.error("[POST /api/cliente/checkout] items:", itemsErr.message);
            await db.from("orders").delete().eq("id", order.id);
            return jsonError("Erro ao registrar os itens do pedido.", 500);
        }

        void notifyOrderStatus(order.id, "novo").catch(() => {});

        return NextResponse.json({ order_id: order.id }, { status: 201 });
    } catch (e) {
        return handleRouteError(e, "POST /api/cliente/checkout");
    }
}
