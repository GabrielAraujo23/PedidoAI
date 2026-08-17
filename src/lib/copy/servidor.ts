import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TENANT_COOKIE, verifyTenant } from "@/lib/session-cookie";
import { sanitizarOverrides } from "@/lib/copy/sanitizar";

/**
 * SÓ SERVIDOR. Usa a chave de serviço do Supabase e `next/headers`; importar
 * isto de um componente com "use client" quebra o build, que é a trava certa.
 *
 * Texto da loja, lido no SERVIDOR, para o layout raiz entregar já pronto.
 *
 * Por que aqui e não num `fetch` depois da montagem, como faz o BrandProvider:
 * uma logo que chega atrasada é um piscar, mas texto que chega atrasado é a
 * página se reescrevendo na frente de quem está lendo. O cliente veria "Faça
 * seu pedido agora." e, um instante depois, aquilo virar outra frase.
 *
 * Também não cabe em cookie, como a paleta coube: são 123 textos, passam dos
 * 4 KB, e cookie viaja em toda requisição.
 *
 * NUNCA LANÇA. Este código roda no layout raiz — uma exceção aqui não derruba
 * uma tela, derruba o app inteiro. O pior caso aceitável é a loja aparecer com
 * o texto padrão do produto, que é exatamente o que ela tem hoje.
 */
export async function lerOverridesDaLoja(): Promise<Record<string, string>> {
    try {
        const cookie = (await cookies()).get(TENANT_COOKIE)?.value;
        if (!cookie) return {};

        const tenant = await verifyTenant(cookie);
        if (!tenant?.adminId) return {};

        const { data, error } = await getSupabaseAdmin()
            .from("store_settings")
            .select("copy_overrides")
            .eq("admin_id", tenant.adminId)
            .maybeSingle();

        if (error || !data) return {};

        // Higieniza na LEITURA, não só na escrita. O banco pode ter dado
        // gravado por uma versão anterior das regras — um limite que mudou,
        // uma chave que foi renomeada no código — e é a tela do cliente final
        // que pagaria por isso.
        return sanitizarOverrides(data.copy_overrides);
    } catch {
        return {};
    }
}
