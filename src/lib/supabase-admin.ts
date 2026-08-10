import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role — SOMENTE servidor.
 *
 * NUNCA importe isto de um componente "use client": a service role ignora
 * RLS por completo e vazaria acesso total ao banco no bundle do navegador.
 *
 * A partir da migration 023 o RLS nega tudo para anon/authenticated, então
 * as rotas de API só funcionam com esta chave. Antes existia um fallback
 * silencioso para a anon key; ele foi removido de propósito — degradar em
 * silêncio aqui significaria "login parou de funcionar em produção e
 * ninguém sabe por quê".
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (cached) return cached;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) ausente. " +
            "As rotas de API precisam da service role porque o RLS bloqueia anon. " +
            "Configure em .env.local e nas variáveis de ambiente da Vercel."
        );
    }

    cached = createClient(url, key, { auth: { persistSession: false } });
    return cached;
}
