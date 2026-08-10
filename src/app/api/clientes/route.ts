import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, readJson, jsonError, handleRouteError } from "@/lib/api-auth";
import { validateName, validatePhone, truncate, escapeLike, LIMITS } from "@/lib/validators";

/**
 * GET /api/clientes — clientes da loja autenticada, mais a projeção mínima de
 * pedidos que a tela usa para montar as métricas (contagem por cliente, último
 * pedido, ativos no mês). O agregado continua sendo calculado na tela; aqui só
 * garantimos que ambos os conjuntos venham filtrados pelo mesmo tenant.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const { adminId } = auth.session;
        const db = getSupabaseAdmin();

        // ?q= — busca usada pelo Atendimento. Devolve só os clientes, sem o
        // agregado de pedidos, que a busca não usa.
        const q = request.nextUrl.searchParams.get("q")?.trim();
        if (q) {
            if (q.length < 2) return NextResponse.json({ clients: [] });
            const safe = escapeLike(q);
            const { data, error } = await db
                .from("clients")
                .select("id, name, phone, address")
                .eq("admin_id", adminId)
                .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
                .limit(8);

            if (error) {
                console.error("[GET /api/clientes?q]", error.message);
                return jsonError("Erro na busca.", 500);
            }
            return NextResponse.json({ clients: data ?? [] });
        }

        const [clientsRes, ordersRes] = await Promise.all([
            db.from("clients").select("*").eq("admin_id", adminId).order("created_at", { ascending: false }),
            db.from("orders").select("client_id, created_at").eq("admin_id", adminId),
        ]);

        if (clientsRes.error || ordersRes.error) {
            console.error("[GET /api/clientes]", clientsRes.error?.message ?? ordersRes.error?.message);
            return jsonError("Erro ao carregar clientes.", 500);
        }

        return NextResponse.json({
            clients: clientsRes.data ?? [],
            orders:  ordersRes.data ?? [],
        });
    } catch (e) {
        return handleRouteError(e, "GET /api/clientes");
    }
}

/** POST /api/clientes — cadastra um cliente na loja autenticada. */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (!auth.ok) return auth.response;

        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        const { name, phone, address } = parsed.body;

        const nameVal = validateName(typeof name === "string" ? name : "");
        if (!nameVal.ok) return jsonError(nameVal.error, 400);

        const phoneStr = typeof phone === "string" ? phone.trim() : "";
        if (phoneStr) {
            const phoneVal = validatePhone(phoneStr);
            if (!phoneVal.ok) return jsonError(phoneVal.error, 400);
        }

        // ID aleatório em vez de MAX(id)+1 por tenant. O antigo lia o maior
        // CL### da própria loja, então duas lojas geravam "CL001" e colidiam na
        // chave primária, que é global. Duas criações simultâneas na mesma loja
        // também colidiam. Mesmo formato usado no cadastro pelo /login.
        const bytes = crypto.getRandomValues(new Uint8Array(4));
        const id = "CL" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");

        const row = {
            id,
            name:    truncate((name as string).trim(), LIMITS.name),
            phone:   phoneStr ? truncate(phoneStr, LIMITS.phone) : null,
            address: typeof address === "string" && address.trim() ? truncate(address.trim(), 255) : null,
            admin_id: auth.session.adminId,
        };

        const { data, error } = await getSupabaseAdmin()
            .from("clients")
            .insert(row)
            .select("*")
            .single();

        if (error) {
            console.error("[POST /api/clientes]", error.message);
            return jsonError("Erro ao cadastrar cliente.", 500);
        }

        return NextResponse.json({ client: data }, { status: 201 });
    } catch (e) {
        return handleRouteError(e, "POST /api/clientes");
    }
}
