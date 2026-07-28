import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    CLIENT_SESSION_COOKIE, clientSessionCookieOptions,
    signClientSession, verifyClientSession,
} from "@/lib/session-cookie";
import type { ClientSessionPayload } from "@/lib/session-cookie";
import { validateName, validatePhone, truncate } from "@/lib/validators";
import { checkOrigin } from "@/lib/csrf";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

export async function PATCH(request: NextRequest) {
    if (!checkOrigin(request)) return err("Forbidden", 403);

    const ip  = getClientIP(request);
    const rl  = rateLimit(`cliente_perfil:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) return NextResponse.json(
        { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429 }
    );

    const cookie = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifyClientSession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }
    if (typeof body !== "object" || body === null) return err("Requisição inválida.");

    const raw = body as Record<string, unknown>;
    const hasAddress = "address" in raw;

    const rawName  = typeof raw.name  === "string" ? raw.name  : "";
    const rawPhone = typeof raw.phone === "string" ? raw.phone : "";

    const nameVal = validateName(rawName);
    if (!nameVal.ok) return err(nameVal.error, 400);

    const phoneVal = validatePhone(rawPhone, true);
    if (!phoneVal.ok) return err(phoneVal.error, 400);

    const cleanName  = rawName.trim();
    const cleanPhone = rawPhone.trim();
    const cleanAddress = hasAddress
        ? (typeof raw.address === "string" && raw.address.trim()
            ? truncate(raw.address.trim(), 255)
            : null)
        : undefined;

    // Unicidade: checa se outro cliente neste admin já usa esse telefone
    const { data: conflict } = await supabase
        .from("clients")
        .select("id")
        .eq("phone", cleanPhone)
        .eq("admin_id", session.adminId)
        .neq("id", session.clientId)
        .maybeSingle();
    if (conflict) return err("Este telefone já está em uso por outra conta.", 409);

    const updatePayload: Record<string, unknown> = { name: cleanName, phone: cleanPhone };
    if (cleanAddress !== undefined) updatePayload.address = cleanAddress;

    const { error: updateError } = await supabase
        .from("clients")
        .update(updatePayload)
        .eq("id", session.clientId)
        .eq("admin_id", session.adminId);

    if (updateError) {
        console.error("[PATCH /api/cliente/perfil]", updateError.message);
        return err("Erro ao salvar. Tente novamente.", 500);
    }

    const newPayload: ClientSessionPayload = {
        clientId: session.clientId,
        name:     cleanName,
        phone:    cleanPhone,
        adminId:  session.adminId,
    };

    const signed = await signClientSession(newPayload);
    const res = NextResponse.json({ ok: true, name: cleanName, phone: cleanPhone });
    res.cookies.set(CLIENT_SESSION_COOKIE, signed, clientSessionCookieOptions());
    return res;
}
