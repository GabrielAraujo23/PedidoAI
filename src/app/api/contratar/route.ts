import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashPasswordServer } from "@/lib/server-crypto";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session-cookie";
import { rateLimit, getClientIP, LIMITS } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, readJson } from "@/lib/api-auth";
import { slugify, isValidSlug } from "@/lib/slug";
import { TERMS_VERSION } from "@/lib/terms";
import {
    validateEmail, validatePassword, validateStoreName, validatePhone, LIMITS as FIELD,
} from "@/lib/validators";

/**
 * POST /api/contratar — cadastro público de uma nova loja.
 *
 * Cria a conta em `admins` com status 'pendente' e a `store_settings` com o
 * slug já reservado, numa única transação (função criar_tenant, migration
 * 027). A loja existe mas não atende: /loja/<slug> responde 404 até o dono
 * aprovar na fila.
 *
 * Ao final devolve sessão assinada — a pessoa já entra logada e cai na tela
 * de acompanhamento, sem precisar digitar a senha que acabou de escolher.
 */
export async function POST(request: NextRequest) {
    try {
        if (!checkOrigin(request)) return jsonError("Forbidden", 403);

        const ip = getClientIP(request);
        const rl = rateLimit(`contratar:${ip}`, LIMITS.contratar.max, LIMITS.contratar.windowMs);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
                { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
            );
        }

        const parsed = await readJson<Record<string, unknown>>(request);
        if (!parsed.ok) return parsed.response;

        const b = parsed.body;
        const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

        const email     = str(b.email).toLowerCase();
        const password  = typeof b.password === "string" ? b.password : "";
        const storeName = str(b.storeName);
        const cnpj      = str(b.cnpj);
        const phone     = str(b.phone);
        const address   = str(b.address);
        const slug      = slugify(str(b.slug));

        // ── Validação ────────────────────────────────────────────────────
        const emailCheck = validateEmail(email);
        if (!emailCheck.ok) return jsonError(emailCheck.error, 400);

        const passCheck = validatePassword(password);
        if (!passCheck.ok) return jsonError(passCheck.error, 400);

        const nameCheck = validateStoreName(storeName);
        if (!nameCheck.ok) return jsonError(nameCheck.error, 400);

        const phoneCheck = validatePhone(phone, true);
        if (!phoneCheck.ok) return jsonError(phoneCheck.error, 400);

        const slugCheck = isValidSlug(slug);
        if (!slugCheck.ok) return jsonError(slugCheck.error, 400);

        if (!address) return jsonError("Informe o endereço da loja.", 400);
        if (address.length > FIELD.street) {
            return jsonError(`O endereço deve ter no máximo ${FIELD.street} caracteres.`, 400);
        }
        if (cnpj && cnpj.replace(/\D/g, "").length !== 14) {
            return jsonError("CNPJ inválido.", 400);
        }

        // O aceite é a etapa que dá respaldo para cobrar e suspender: sem ele
        // não há contratação, e não adianta "assumir que sim".
        if (b.acceptedTerms !== true) {
            return jsonError("É preciso aceitar o contrato para continuar.", 400);
        }

        const db = getSupabaseAdmin();

        // ── Pré-checagens, para mensagem útil em vez de erro cru do índice ──
        const { data: emailTaken } = await db
            .from("admins").select("id").eq("email", email).maybeSingle();
        if (emailTaken) {
            return jsonError("Este e-mail já tem cadastro. Entre pela tela de acesso.", 409);
        }

        const { data: slugTaken, error: slugErr } = await db
            .from("store_settings").select("admin_id").eq("slug", slug).maybeSingle();
        if (slugErr) {
            console.error("[POST /api/contratar] slug", slugErr.message);
            const detail = slugErr.code === "42703"
                ? "Coluna 'slug' não encontrada. Execute a migration 025 no Supabase."
                : "Erro ao verificar o endereço.";
            return jsonError(detail, 500);
        }
        if (slugTaken) {
            return jsonError("Este endereço já está em uso por outra loja.", 409);
        }

        // ── Criação transacional ─────────────────────────────────────────
        const password_hash = await hashPasswordServer(password);

        const { data: adminId, error } = await db.rpc("criar_tenant", {
            p_email:         email,
            p_password_hash: password_hash,
            p_store_name:    storeName,
            p_cnpj:          cnpj || null,
            p_phone:         phone,
            p_address:       address,
            p_slug:          slug,
            p_terms_version: TERMS_VERSION,
            p_terms_ip:      ip,
        });

        if (error || typeof adminId !== "string") {
            console.error("[POST /api/contratar] criar_tenant", error?.message);
            // 23505 = violação de unicidade. As pré-checagens acima cobrem o
            // caso normal; aqui só chega quem perdeu uma corrida por
            // milissegundos. A transação inteira já foi desfeita.
            if (error?.code === "23505") {
                return jsonError(
                    error.message.includes("slug")
                        ? "Este endereço acabou de ser tomado. Escolha outro."
                        : "Este e-mail já tem cadastro. Entre pela tela de acesso.",
                    409
                );
            }
            if (error?.code === "42883") {
                return jsonError("Função 'criar_tenant' não encontrada. Execute a migration 027 no Supabase.", 500);
            }
            return jsonError("Erro ao criar a loja. Tente novamente.", 500);
        }

        // Entra já logada, direto na tela de acompanhamento.
        const signed = await signSession({
            adminId, email, role: "lojista", status: "pendente",
        });
        const res = NextResponse.json({ adminId, email, slug });
        res.cookies.set(SESSION_COOKIE, signed, sessionCookieOptions());
        return res;
    } catch (e) {
        return handleRouteError(e, "POST /api/contratar");
    }
}
