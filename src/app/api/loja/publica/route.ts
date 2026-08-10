import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { handleRouteError } from "@/lib/api-auth";
import { TENANT_COOKIE, verifyTenant } from "@/lib/session-cookie";
import { slugify } from "@/lib/slug";

const PUBLIC_FIELDS =
    "admin_id, store_name, slug, latitude, longitude, delivery_radius_km, delivery_rate_per_km";

/**
 * GET /api/loja/publica?slug=<slug> | ?admin=<uuid> — dados da loja sem sessão.
 *
 * A tela de login precisa disto antes de existir sessão: para dizer de qual
 * loja se trata e para estimar frete durante o cadastro. Devolve só o
 * necessário: nome, endereço público, coordenadas, raio e taxa por km. Nada de
 * CNPJ, telefone, e-mail ou faturamento.
 *
 * Precedência de resolução:
 *   1. `?slug=`  — a forma nova, o link que o lojista compartilha
 *   2. `?admin=` — links antigos já espalhados por aí; continuam funcionando
 *   3. cookie de tenant assinado, gravado por /loja/<slug>
 *   4. se existir exatamente UMA loja, ela; com várias, `null`
 *
 * O passo 4 não é mais "a loja mais antiga". Chutar a loja aqui faria a tela
 * de login exibir o nome de uma loja e cadastrar o cliente em outra.
 */
export async function GET(request: NextRequest) {
    try {
        const db = getSupabaseAdmin();
        const params = request.nextUrl.searchParams;

        const rawSlug = params.get("slug")?.trim();
        if (rawSlug) {
            const slug = slugify(rawSlug);
            if (!slug) return NextResponse.json({ store: null });
            return await respond(db.from("store_settings").select(PUBLIC_FIELDS).eq("slug", slug).maybeSingle());
        }

        const adminId = params.get("admin")?.trim();
        if (adminId) {
            return await respond(db.from("store_settings").select(PUBLIC_FIELDS).eq("admin_id", adminId).maybeSingle());
        }

        const cookie = request.cookies.get(TENANT_COOKIE)?.value;
        if (cookie) {
            const tenant = await verifyTenant(cookie);
            if (tenant?.adminId) {
                return await respond(
                    db.from("store_settings").select(PUBLIC_FIELDS).eq("admin_id", tenant.adminId).maybeSingle()
                );
            }
        }

        // Sem nenhuma pista: só responde se a instalação tiver uma loja só.
        // Pedimos 2 linhas justamente para saber se existe uma segunda.
        const { data: stores, error } = await db
            .from("store_settings")
            .select(PUBLIC_FIELDS)
            .order("created_at", { ascending: true })
            .limit(2);

        if (error) {
            console.error("[GET /api/loja/publica]", error.message);
            return NextResponse.json({ store: null });
        }
        if (stores?.length !== 1) return NextResponse.json({ store: null, needsStore: (stores?.length ?? 0) > 1 });

        return NextResponse.json({ store: stores[0] });
    } catch (e) {
        return handleRouteError(e, "GET /api/loja/publica");
    }
}

async function respond(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const { data, error } = await query;
    if (error) {
        console.error("[GET /api/loja/publica]", error.message);
        return NextResponse.json({ store: null });
    }
    return NextResponse.json({ store: data ?? null });
}
