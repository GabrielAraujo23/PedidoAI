import {
    validateProductName, validatePrice, validateDescription, truncate, LIMITS,
} from "@/lib/validators";

/** Campos que o navegador pode enviar. admin_id nunca vem do corpo. */
export interface ProductInput {
    name?: unknown;
    description?: unknown;
    category?: unknown;
    subcategory?: unknown;
    unit?: unknown;
    price?: unknown;
    active?: unknown;
    barcode?: unknown;
}

export type SanitizeResult =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };

/**
 * Valida e normaliza os campos de produto vindos do navegador.
 *
 * Vive fora das rotas porque tanto POST /api/produtos quanto
 * PATCH /api/produtos/[id] usam a mesma regra, e importar de um arquivo
 * `route.ts` acopla módulos ao roteador do Next sem necessidade.
 */
export function sanitizeProduct(body: ProductInput): SanitizeResult {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const nameVal = validateProductName(name);
    if (!nameVal.ok) return { ok: false, error: nameVal.error };

    const priceRaw = typeof body.price === "number" ? String(body.price) : String(body.price ?? "");
    const priceVal = validatePrice(priceRaw);
    if (!priceVal.ok) return { ok: false, error: priceVal.error };

    const description = typeof body.description === "string" ? body.description.trim() : "";
    const descVal = validateDescription(description);
    if (!descVal.ok) return { ok: false, error: descVal.error };

    const category = typeof body.category === "string" ? body.category.trim() : "";
    if (!category) return { ok: false, error: "Categoria é obrigatória." };

    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    if (!unit) return { ok: false, error: "Unidade é obrigatória." };

    return {
        ok: true,
        value: {
            name:        truncate(name, LIMITS.product_name),
            description: description ? truncate(description, LIMITS.description) : null,
            category:    truncate(category, LIMITS.category),
            subcategory: typeof body.subcategory === "string" && body.subcategory.trim()
                ? truncate(body.subcategory.trim(), LIMITS.category)
                : null,
            unit,
            price:       parseFloat(priceRaw.replace(/\./g, "").replace(",", ".")),
            active:      body.active !== false,
            barcode:     typeof body.barcode === "string" && body.barcode.trim() ? body.barcode.trim() : null,
        },
    };
}
