// ============================================================
// validators.ts — Validação centralizada de entradas do usuário
// Usado em todos os formulários do PedidoAI.
// ============================================================

// ── Tipos de resultado ──────────────────────────────────────

export interface ValidationResult {
    ok: boolean;
    error: string;
}

const OK: ValidationResult = { ok: true, error: "" };
function fail(error: string): ValidationResult { return { ok: false, error }; }

// ── Limites de tamanho ──────────────────────────────────────

export const LIMITS = {
    name:          80,
    phone:         20,
    email:        120,
    password_min:   8,
    password_max:  72,   // bcrypt/PBKDF2 practical limit
    cep:            8,   // só dígitos
    address_number:10,
    complement:    60,
    street:       120,
    neighborhood:  80,
    city:          80,
    state:          2,
    store_name:   100,
    business_hours:100,
    category:      50,
    product_name: 120,
    description:  500,
    chat_message: 500,
    coupon:        20,
} as const;

// ── Coordenadas geográficas ─────────────────────────────────

export interface Coords { lat: number; lng: number }

export function validateLatitude(v: unknown): ValidationResult {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    if (!isFinite(n))          return fail("Latitude inválida.");
    if (n < -90 || n > 90)    return fail("Latitude deve estar entre -90 e 90.");
    return OK;
}

export function validateLongitude(v: unknown): ValidationResult {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    if (!isFinite(n))          return fail("Longitude inválida.");
    if (n < -180 || n > 180)  return fail("Longitude deve estar entre -180 e 180.");
    return OK;
}

/**
 * Sanitiza coordenadas vindas de APIs externas (Nominatim, BrasilAPI, etc.).
 * Retorna null se os valores forem inválidos — o caller deve tratar este caso.
 */
export function sanitizeExternalCoords(
    rawLat: unknown,
    rawLng: unknown
): Coords | null {
    const lat = typeof rawLat === "string" ? parseFloat(rawLat) : Number(rawLat);
    const lng = typeof rawLng === "string" ? parseFloat(rawLng) : Number(rawLng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < -90  || lat > 90)           return null;
    if (lng < -180 || lng > 180)          return null;
    // Brasil: lat aprox -34 a 5, lng aprox -74 a -28
    if (lat < -35 || lat > 6)             return null;
    if (lng < -75 || lng > -28)           return null;
    return { lat, lng };
}

// ── Telefone ────────────────────────────────────────────────

const PHONE_RE = /^\(\d{2}\) \d{4,5}-\d{4}$/;

export function validatePhone(v: string, required = false): ValidationResult {
    const t = v.trim();
    if (!t) return required ? fail("Telefone é obrigatório.") : OK;
    if (t.length > LIMITS.phone) return fail(`Telefone deve ter no máximo ${LIMITS.phone} caracteres.`);
    if (!PHONE_RE.test(t))        return fail("Telefone inválido. Use o formato (XX) XXXXX-XXXX.");
    return OK;
}

// ── Nome de pessoa ──────────────────────────────────────────

export function validateName(v: string, required = true): ValidationResult {
    const t = v.trim();
    if (!t)                        return required ? fail("Nome é obrigatório.") : OK;
    if (t.length > LIMITS.name)    return fail(`Nome deve ter no máximo ${LIMITS.name} caracteres.`);
    if (t.length < 2)              return fail("Nome deve ter pelo menos 2 caracteres.");
    return OK;
}

// ── E-mail ──────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(v: string): ValidationResult {
    const t = v.trim().toLowerCase();
    if (!t)                         return fail("Email é obrigatório.");
    if (t.length > LIMITS.email)    return fail(`Email muito longo.`);
    if (!EMAIL_RE.test(t))          return fail("Email inválido.");
    return OK;
}

// ── Senha ───────────────────────────────────────────────────

export function validatePassword(v: string): ValidationResult {
    if (!v)                              return fail("Senha é obrigatória.");
    if (v.length < LIMITS.password_min)  return fail(`Senha deve ter pelo menos ${LIMITS.password_min} caracteres.`);
    if (v.length > LIMITS.password_max)  return fail(`Senha muito longa.`);
    if (!/[A-Z]/.test(v))                return fail("Senha deve conter pelo menos uma letra maiúscula.");
    if (!/[0-9]/.test(v))                return fail("Senha deve conter pelo menos um número.");
    return OK;
}

// ── CEP ─────────────────────────────────────────────────────

export function validateCep(digits: string): ValidationResult {
    if (!/^\d{8}$/.test(digits)) return fail("CEP deve ter 8 dígitos numéricos.");
    return OK;
}

// ── Número de endereço ──────────────────────────────────────

export function validateAddressNumber(v: string, required = true): ValidationResult {
    const t = v.trim();
    if (!t) return required ? fail("Número do endereço é obrigatório.") : OK;
    if (t.length > LIMITS.address_number) return fail(`Número deve ter no máximo ${LIMITS.address_number} caracteres.`);
    return OK;
}

// ── Complemento ─────────────────────────────────────────────

export function validateComplement(v: string): ValidationResult {
    if (v.length > LIMITS.complement) return fail(`Complemento deve ter no máximo ${LIMITS.complement} caracteres.`);
    return OK;
}

// ── Nome do produto ─────────────────────────────────────────

export function validateProductName(v: string): ValidationResult {
    const t = v.trim();
    if (!t)                             return fail("Nome do produto é obrigatório.");
    if (t.length > LIMITS.product_name) return fail(`Nome deve ter no máximo ${LIMITS.product_name} caracteres.`);
    return OK;
}

// ── Descrição do produto ────────────────────────────────────

export function validateDescription(v: string): ValidationResult {
    if (v.length > LIMITS.description) return fail(`Descrição deve ter no máximo ${LIMITS.description} caracteres.`);
    return OK;
}

// ── Preço do produto ────────────────────────────────────────

export function validatePrice(v: string): ValidationResult {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    if (isNaN(n) || n <= 0)    return fail("Preço deve ser maior que zero.");
    if (n > 999_999.99)        return fail("Preço deve ser menor que R$ 999.999,99.");
    return OK;
}

// ── Nome da loja ────────────────────────────────────────────

export function validateStoreName(v: string): ValidationResult {
    const t = v.trim();
    if (!t)                           return fail("Nome da loja é obrigatório.");
    if (t.length > LIMITS.store_name) return fail(`Nome deve ter no máximo ${LIMITS.store_name} caracteres.`);
    return OK;
}

// ── Horário de funcionamento ────────────────────────────────

export function validateBusinessHours(v: string): ValidationResult {
    if (v.length > LIMITS.business_hours) return fail(`Horário deve ter no máximo ${LIMITS.business_hours} caracteres.`);
    return OK;
}

// ── Categoria ───────────────────────────────────────────────

export function validateCategory(v: string): ValidationResult {
    const t = v.trim();
    if (!t)                        return fail("Categoria não pode estar vazia.");
    if (t.length > LIMITS.category) return fail(`Categoria deve ter no máximo ${LIMITS.category} caracteres.`);
    return OK;
}

// ── Taxa de entrega ─────────────────────────────────────────

export function validateDeliveryRate(v: string | number): ValidationResult {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n) || n < 0)  return fail("Taxa de entrega deve ser maior ou igual a zero.");
    if (n > 999)             return fail("Taxa de entrega deve ser menor que R$ 999/km.");
    return OK;
}

// ── Raio de entrega ─────────────────────────────────────────

export function validateDeliveryRadius(v: string | number): ValidationResult {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n) || n < 1)  return fail("Raio de entrega mínimo é 1 km.");
    if (n > 500)             return fail("Raio de entrega máximo é 500 km.");
    return OK;
}

// ── Mensagem de chat ────────────────────────────────────────

export function validateChatMessage(v: string): ValidationResult {
    if (v.length > LIMITS.chat_message) return fail(`Mensagem deve ter no máximo ${LIMITS.chat_message} caracteres.`);
    return OK;
}

// ── Quantidade de produto (chat / carrinho) ─────────────────

export function validateQuantity(v: number): ValidationResult {
    if (!Number.isInteger(v) || v < 1) return fail("Quantidade deve ser um número inteiro positivo.");
    if (v > 9_999)                     return fail("Quantidade máxima é 9.999.");
    return OK;
}

// ── Escape para LIKE / ILIKE do Postgres ────────────────────
// Previne que % e _ do usuário se comportem como wildcards.

export function escapeLike(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ── Token de reset seguro (32 bytes hex = 64 chars) ─────────
// Substitui o token de 6 dígitos brute-forçável.

export function generateSecureToken(): string {
    const bytes = (window.crypto ?? globalThis.crypto).getRandomValues(new Uint8Array(32));
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Truncar string para o banco (segurança extra) ───────────

export function truncate(v: string, max: number): string {
    return v.length > max ? v.slice(0, max) : v;
}

// ── Sanitizar texto vindo de APIs externas ───────────────────
// Remove tags HTML e caracteres de controle para prevenir
// armazenamento de markup malicioso no banco de dados.
// Usar sempre em campos logradouro/bairro/cidade/uf de viaCEP,
// BrasilAPI ou AwesomeAPI antes de salvar no state ou no DB.

export function sanitizeExternalText(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    return v
        .replace(/<[^>]*>/g, "")           // strip HTML tags
        .replace(/[\x00-\x1F\x7F]/g, "")   // strip control chars
        .trim()
        .slice(0, max);
}
