# Estoque + NF-e + Observabilidade Real — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar controle de estoque em tempo real, importação de NF-e via XML/QR code, scanner de código de barras e substituir dados fictícios do dashboard por dados reais do Supabase.

**Architecture:** Quatro migrações SQL adicionam campos e tabelas sem apagar dados existentes. Rotas de API server-side verificam a sessão admin antes de qualquer escrita. Componentes client-side usam a câmera do dispositivo (@zxing/browser) para leitura de EAN. O parser de XML da NF-e roda inteiramente no browser — sem API externa paga.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS allow-all + admin_id filter no código), Tailwind CSS v4, shadcn/ui, @zxing/browser (MIT)

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `supabase/migrations/015_add_stock_to_products.sql` | Criar |
| `supabase/migrations/016_create_stock_movements.sql` | Criar |
| `supabase/migrations/017_create_nfe_imports.sql` | Criar |
| `supabase/migrations/018_create_decrement_stock_fn.sql` | Criar |
| `src/lib/types.ts` | Modificar — adicionar Product, StockMovement, NfeImport |
| `src/lib/nfe-xml-parser.ts` | Criar |
| `src/components/stock-badge.tsx` | Criar |
| `src/components/barcode-scanner.tsx` | Criar |
| `src/app/api/estoque/ajuste/route.ts` | Criar |
| `src/app/api/estoque/receber/route.ts` | Criar |
| `src/app/api/orders/[id]/status/route.ts` | Criar |
| `src/app/estoque/page.tsx` | Criar |
| `src/app/estoque/receber/page.tsx` | Criar |
| `src/components/nav-sidebar.tsx` | Modificar — adicionar item Estoque |
| `src/app/produtos/page.tsx` | Modificar — coluna estoque + filtro |
| `src/app/page.tsx` | Modificar — dados reais no dashboard |

---

## Task 1: Migrações SQL

**Files:**
- Create: `supabase/migrations/015_add_stock_to_products.sql`
- Create: `supabase/migrations/016_create_stock_movements.sql`
- Create: `supabase/migrations/017_create_nfe_imports.sql`
- Create: `supabase/migrations/018_create_decrement_stock_fn.sql`

- [ ] **Step 1: Criar migração 015 — campos de estoque em products**

```sql
-- supabase/migrations/015_add_stock_to_products.sql
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)
    WHERE barcode IS NOT NULL;
```

- [ ] **Step 2: Criar migração 016 — tabela stock_movements**

```sql
-- supabase/migrations/016_create_stock_movements.sql
CREATE TABLE IF NOT EXISTS stock_movements (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id     UUID        NOT NULL REFERENCES admins(id),
    product_id   UUID        NOT NULL REFERENCES products(id),
    product_name TEXT        NOT NULL,
    type         TEXT        NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
    quantity     INTEGER     NOT NULL,
    reference    TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_admin_created_idx
    ON stock_movements (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx
    ON stock_movements (product_id);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_allow_all" ON stock_movements
    FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 3: Criar migração 017 — tabela nfe_imports**

```sql
-- supabase/migrations/017_create_nfe_imports.sql
CREATE TABLE IF NOT EXISTS nfe_imports (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id      UUID        NOT NULL REFERENCES admins(id),
    chave_acesso  TEXT        NOT NULL,
    supplier_name TEXT,
    total_items   INTEGER     NOT NULL DEFAULT 0,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    status        TEXT        NOT NULL DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS nfe_imports_admin_idx ON nfe_imports (admin_id);

ALTER TABLE nfe_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfe_imports_allow_all" ON nfe_imports
    FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 4: Criar migração 018 — função decrement_stock**

```sql
-- supabase/migrations/018_create_decrement_stock_fn.sql
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS INTEGER AS $$
DECLARE
    new_qty INTEGER;
BEGIN
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0)
    WHERE id = p_product_id
    RETURNING stock_quantity INTO new_qty;
    RETURN new_qty;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 5: Rodar as migrações no Supabase**

No dashboard do Supabase → SQL Editor, executar cada arquivo em ordem: 015, 016, 017, 018.

Verificar no Table Editor que a tabela `products` agora tem as colunas `stock_quantity` e `barcode`, e que as tabelas `stock_movements` e `nfe_imports` existem.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add stock migrations (015-018)"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Adicionar tipos ao types.ts**

Substituir o conteúdo completo de `src/lib/types.ts`:

```typescript
export type Status = "novo" | "confirmado" | "rota" | "entregue";

export interface Order {
    id: string;
    client: string;
    products: string;
    status: Status;
    position: number;
    client_id?: string | null;
    created_at?: string;
}

export interface Client {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    created_at?: string;
}

export interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
    stock_quantity: number;
    barcode: string | null;
    admin_id: string | null;
    created_at: string;
}

export type StockMovementType = "entrada" | "saida" | "ajuste";

export interface StockMovement {
    id: string;
    admin_id: string;
    product_id: string;
    product_name: string;
    type: StockMovementType;
    quantity: number;
    reference: string | null;
    notes: string | null;
    created_at: string;
}

export interface NfeImport {
    id: string;
    admin_id: string;
    chave_acesso: string;
    supplier_name: string | null;
    total_items: number;
    imported_at: string;
    status: string;
}

export interface NfeProduct {
    cProd: string;
    xProd: string;
    uCom: string;
    qCom: number;
    vUnCom: number;
    cEAN: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Product, StockMovement, NfeImport, NfeProduct types"
```

---

## Task 3: Componente StockBadge

**Files:**
- Create: `src/components/stock-badge.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/stock-badge.tsx
import { cn } from "@/lib/utils";

interface StockBadgeProps {
    quantity: number;
    threshold?: number;
    showNumber?: boolean;
    className?: string;
}

export function StockBadge({ quantity, threshold = 5, showNumber = true, className }: StockBadgeProps) {
    const status = quantity === 0 ? "zero" : quantity <= threshold ? "low" : "ok";

    const config = {
        ok:  { dot: "bg-emerald-500", bg: "bg-emerald-50  border-emerald-200/60 text-emerald-700" },
        low: { dot: "bg-amber-400",   bg: "bg-amber-50   border-amber-200/60   text-amber-700"   },
        zero:{ dot: "bg-red-500",     bg: "bg-red-50     border-red-200/60     text-red-700"     },
    }[status];

    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold",
            config.bg, className
        )}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
            {showNumber ? `${quantity} em estoque` : status === "zero" ? "Zerado" : status === "low" ? "Baixo" : "OK"}
        </span>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/stock-badge.tsx
git commit -m "feat: add StockBadge component"
```

---

## Task 4: Parser XML da NF-e

**Files:**
- Create: `src/lib/nfe-xml-parser.ts`

- [ ] **Step 1: Criar o parser**

```typescript
// src/lib/nfe-xml-parser.ts
import type { NfeProduct } from "@/lib/types";

export interface NfeParseResult {
    chaveAcesso: string | null;
    supplierName: string | null;
    products: NfeProduct[];
    error: string | null;
}

// Extrai texto de um elemento XML pelo tag name, ignorando namespace
function getText(parent: Element, tag: string): string {
    const el = parent.getElementsByTagNameNS("*", tag)[0]
             ?? parent.querySelector(tag);
    return el?.textContent?.trim() ?? "";
}

export function parseNfeXml(xmlString: string): NfeParseResult {
    if (typeof window === "undefined") {
        return { chaveAcesso: null, supplierName: null, products: [], error: "Apenas client-side" };
    }

    let doc: Document;
    try {
        const parser = new DOMParser();
        doc = parser.parseFromString(xmlString, "text/xml");
        const parseError = doc.querySelector("parsererror");
        if (parseError) throw new Error("XML inválido");
    } catch {
        return { chaveAcesso: null, supplierName: null, products: [], error: "Arquivo XML inválido ou corrompido." };
    }

    // Chave de acesso: atributo Id da tag infNFe sem o prefixo "NFe"
    const infNFe = doc.querySelector("[Id]");
    const chaveAcesso = infNFe?.getAttribute("Id")?.replace(/^NFe/, "") ?? null;

    // Nome do emitente (fornecedor)
    const emit = doc.getElementsByTagNameNS("*", "emit")[0];
    const supplierName = emit ? (getText(emit, "xFant") || getText(emit, "xNome") || null) : null;

    // Itens da nota: cada <det> contém um <prod>
    const detNodes = Array.from(doc.getElementsByTagNameNS("*", "det"));
    const products: NfeProduct[] = detNodes.map((det) => {
        const prod = det.getElementsByTagNameNS("*", "prod")[0];
        if (!prod) return null;

        const qCom = parseFloat(getText(prod, "qCom").replace(",", ".")) || 0;
        const vUnCom = parseFloat(getText(prod, "vUnCom").replace(",", ".")) || 0;
        const cEAN = getText(prod, "cEAN") || getText(prod, "cEANTrib") || null;

        return {
            cProd: getText(prod, "cProd"),
            xProd: getText(prod, "xProd"),
            uCom:  getText(prod, "uCom"),
            qCom,
            vUnCom,
            cEAN: cEAN === "SEM GTIN" ? null : cEAN,
        } satisfies NfeProduct;
    }).filter((p): p is NfeProduct => p !== null);

    if (products.length === 0) {
        return { chaveAcesso, supplierName, products: [], error: "Nenhum produto encontrado no XML." };
    }

    return { chaveAcesso, supplierName, products, error: null };
}

// Extrai chave de acesso de 44 dígitos de uma URL de QR code NF-e
export function extractChaveFromQrUrl(url: string): string | null {
    const match = url.match(/\d{44}/);
    return match ? match[0] : null;
}

// Match fuzzy entre nome do produto na NF-e e produtos cadastrados
export function matchProductByName(nfeName: string, catalogNames: string[]): number {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nfeNorm = norm(nfeName);
    let best = -1;
    let bestScore = 0;
    catalogNames.forEach((name, i) => {
        const catNorm = norm(name);
        if (nfeNorm === catNorm) { best = i; bestScore = 1; return; }
        const shorter = nfeNorm.length < catNorm.length ? nfeNorm : catNorm;
        const longer  = nfeNorm.length < catNorm.length ? catNorm : nfeNorm;
        if (longer.includes(shorter) && shorter.length > 4) {
            const score = shorter.length / longer.length;
            if (score > bestScore) { bestScore = score; best = i; }
        }
    });
    return bestScore >= 0.6 ? best : -1;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/nfe-xml-parser.ts
git commit -m "feat: add NF-e XML parser (client-side, no external API)"
```

---

## Task 5: Componente BarcodeScanner

**Files:**
- Create: `src/components/barcode-scanner.tsx`

- [ ] **Step 1: Instalar @zxing/browser**

```bash
npm install @zxing/browser @zxing/library
```

Verificar que `package.json` agora contém `"@zxing/browser"` em dependencies.

- [ ] **Step 2: Criar o componente**

```typescript
// src/components/barcode-scanner.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
    onDetected: (barcode: string) => void;
    onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let reader: import("@zxing/browser").BrowserMultiFormatReader;
        let active = true;

        async function start() {
            try {
                const { BrowserMultiFormatReader } = await import("@zxing/browser");
                reader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (devices.length === 0) throw new Error("Nenhuma câmera encontrada.");

                // Prefere câmera traseira
                const device = devices.find((d) =>
                    d.label.toLowerCase().includes("back") ||
                    d.label.toLowerCase().includes("traseira") ||
                    d.label.toLowerCase().includes("rear")
                ) ?? devices[devices.length - 1];

                if (!videoRef.current || !active) return;
                setLoading(false);

                await reader.decodeFromVideoDevice(
                    device.deviceId,
                    videoRef.current,
                    (result, err) => {
                        if (result && active) {
                            onDetected(result.getText());
                        }
                        if (err && !(err instanceof (import("@zxing/library") as any).NotFoundException)) {
                            // Erros de frame são normais, ignora
                        }
                    }
                );
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Erro ao acessar câmera.");
                setLoading(false);
            }
        }

        start();

        return () => {
            active = false;
            reader?.reset();
        };
    }, [onDetected]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="relative w-full max-w-sm">
                <button
                    onClick={onClose}
                    className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="relative rounded-2xl overflow-hidden bg-stone-900 aspect-square">
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                    />

                    {/* Viewfinder */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 relative">
                            {["top-left", "top-right", "bottom-left", "bottom-right"].map((corner) => (
                                <span
                                    key={corner}
                                    className={`absolute w-8 h-8 border-orange-400 border-2
                                        ${corner.includes("top") ? "top-0" : "bottom-0"}
                                        ${corner.includes("left") ? "left-0 border-r-0 border-b-0" : "right-0 border-l-0 border-b-0"}
                                        ${corner.includes("bottom") && corner.includes("left") ? "border-t-0 border-r-0 border-b-2 border-l-2" : ""}
                                        ${corner.includes("bottom") && corner.includes("right") ? "border-t-0 border-l-0 border-b-2 border-r-2" : ""}
                                    `}
                                />
                            ))}
                        </div>
                    </div>

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-900">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-900 p-6 text-center">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}
                </div>

                <p className="text-white/60 text-sm text-center mt-4">
                    Aponte a câmera para o código de barras do produto
                </p>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/barcode-scanner.tsx package.json package-lock.json
git commit -m "feat: add BarcodeScanner component with @zxing/browser"
```

---

## Task 6: API — Ajuste Manual de Estoque

**Files:**
- Create: `src/app/api/estoque/ajuste/route.ts`

- [ ] **Step 1: Criar a rota**

```typescript
// src/app/api/estoque/ajuste/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, SESSION_COOKIE } from "@/lib/session-cookie";

const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { product_id, quantity, mode, notes } = body as Record<string, unknown>;

    if (typeof product_id !== "string" || !product_id) return err("product_id obrigatório.");
    if (typeof quantity !== "number" || quantity < 0) return err("quantity deve ser número >= 0.");
    if (mode !== "set" && mode !== "add" && mode !== "remove") return err("mode deve ser 'set', 'add' ou 'remove'.");
    if (!notes || typeof notes !== "string" || notes.trim().length < 3) return err("notes obrigatório (mín. 3 caracteres).");

    // Verificar que o produto pertence ao admin
    const { data: product } = await supabaseServer
        .from("products")
        .select("id, name, stock_quantity, admin_id")
        .eq("id", product_id)
        .eq("admin_id", session.adminId)
        .single();

    if (!product) return err("Produto não encontrado.", 404);

    let newQty: number;
    let movementQty: number;

    if (mode === "set") {
        newQty = Math.max(0, quantity as number);
        movementQty = newQty - product.stock_quantity;
    } else if (mode === "add") {
        newQty = product.stock_quantity + (quantity as number);
        movementQty = quantity as number;
    } else {
        newQty = Math.max(0, product.stock_quantity - (quantity as number));
        movementQty = -(product.stock_quantity - newQty);
    }

    const { error: updateError } = await supabaseServer
        .from("products")
        .update({ stock_quantity: newQty })
        .eq("id", product_id);

    if (updateError) return err("Erro ao atualizar estoque.", 500);

    await supabaseServer.from("stock_movements").insert({
        admin_id: session.adminId,
        product_id,
        product_name: product.name,
        type: "ajuste",
        quantity: movementQty,
        reference: "Ajuste manual",
        notes: notes.trim(),
    });

    return NextResponse.json({ ok: true, stock_quantity: newQty });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/estoque/ajuste/route.ts
git commit -m "feat: add /api/estoque/ajuste endpoint"
```

---

## Task 7: API — Confirmar Recebimento (NF-e / Barcode)

**Files:**
- Create: `src/app/api/estoque/receber/route.ts`

- [ ] **Step 1: Criar a rota**

```typescript
// src/app/api/estoque/receber/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, SESSION_COOKIE } from "@/lib/session-cookie";

const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

interface ReceiptItem {
    product_id: string | null;   // null = produto novo
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    barcode: string | null;
    category: string;
}

export async function POST(request: NextRequest) {
    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { items, chave_acesso, supplier_name } = body as {
        items: ReceiptItem[];
        chave_acesso: string | null;
        supplier_name: string | null;
    };

    if (!Array.isArray(items) || items.length === 0) return err("items obrigatório.");

    const movements: object[] = [];
    let totalItems = 0;

    for (const item of items) {
        if (!item.name || item.quantity <= 0) continue;

        let productId = item.product_id;

        if (!productId) {
            // Criar novo produto
            const { data: newProduct, error: insertError } = await supabaseServer
                .from("products")
                .insert({
                    name: item.name,
                    category: item.category || "Outros Produtos",
                    unit: item.unit || "por unidade",
                    price: item.unit_price || 0,
                    active: true,
                    stock_quantity: item.quantity,
                    barcode: item.barcode,
                    admin_id: session.adminId,
                })
                .select("id")
                .single();

            if (insertError || !newProduct) continue;
            productId = newProduct.id;
        } else {
            // Incrementar estoque do produto existente
            await supabaseServer.rpc("increment_stock", {
                p_product_id: productId,
                p_quantity: item.quantity,
            }).catch(() => null);

            // Fallback manual caso rpc não exista ainda
            const { data: prod } = await supabaseServer
                .from("products")
                .select("stock_quantity")
                .eq("id", productId)
                .single();

            if (prod) {
                await supabaseServer
                    .from("products")
                    .update({ stock_quantity: prod.stock_quantity + item.quantity })
                    .eq("id", productId);
            }

            // Atualiza barcode se ainda não tem
            if (item.barcode) {
                await supabaseServer
                    .from("products")
                    .update({ barcode: item.barcode })
                    .eq("id", productId)
                    .is("barcode", null);
            }
        }

        movements.push({
            admin_id: session.adminId,
            product_id: productId,
            product_name: item.name,
            type: "entrada",
            quantity: item.quantity,
            reference: chave_acesso ?? "Recebimento manual",
            notes: null,
        });

        totalItems++;
    }

    if (movements.length > 0) {
        await supabaseServer.from("stock_movements").insert(movements);
    }

    if (chave_acesso) {
        await supabaseServer.from("nfe_imports").insert({
            admin_id: session.adminId,
            chave_acesso,
            supplier_name: supplier_name ?? null,
            total_items: totalItems,
            status: "completed",
        });
    }

    return NextResponse.json({ ok: true, processed: totalItems });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/estoque/receber/route.ts
git commit -m "feat: add /api/estoque/receber endpoint"
```

---

## Task 8: API — Atualização de Status do Pedido com Débito de Estoque

**Files:**
- Create: `src/app/api/orders/[id]/status/route.ts`

- [ ] **Step 1: Criar a rota**

```typescript
// src/app/api/orders/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, SESSION_COOKIE } from "@/lib/session-cookie";
import type { Status } from "@/lib/types";

const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

function err(msg: string, status = 400) {
    return NextResponse.json({ error: msg }, { status });
}

const VALID_STATUSES: Status[] = ["novo", "confirmado", "rota", "entregue"];

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie) return err("Não autenticado.", 401);

    const session = await verifySession(cookie);
    if (!session) return err("Sessão inválida.", 401);

    let body: unknown;
    try { body = await request.json(); } catch { return err("JSON inválido."); }

    const { status } = body as { status: unknown };
    if (!VALID_STATUSES.includes(status as Status)) {
        return err("Status inválido.");
    }

    const orderId = params.id;

    // Verificar que o pedido pertence ao admin
    const { data: order } = await supabaseServer
        .from("orders")
        .select("id, status, admin_id")
        .eq("id", orderId)
        .eq("admin_id", session.adminId)
        .single();

    if (!order) return err("Pedido não encontrado.", 404);

    // Atualizar status
    const { error: updateError } = await supabaseServer
        .from("orders")
        .update({ status })
        .eq("id", orderId);

    if (updateError) return err("Erro ao atualizar status.", 500);

    // Se mudou para 'entregue', debitar estoque
    if (status === "entregue" && order.status !== "entregue") {
        const { data: orderItems } = await supabaseServer
            .from("order_items")
            .select("product_id, product_name, quantity")
            .eq("order_id", orderId);

        if (orderItems && orderItems.length > 0) {
            for (const item of orderItems) {
                if (!item.product_id) continue;

                // Debitar usando GREATEST para nunca ficar negativo
                const { data: prod } = await supabaseServer
                    .from("products")
                    .select("stock_quantity")
                    .eq("id", item.product_id)
                    .single();

                if (prod) {
                    const newQty = Math.max(0, prod.stock_quantity - Number(item.quantity));
                    await supabaseServer
                        .from("products")
                        .update({ stock_quantity: newQty })
                        .eq("id", item.product_id);
                }
            }

            // Gravar movimentos de saída
            const movements = orderItems
                .filter((i) => i.product_id)
                .map((i) => ({
                    admin_id: session.adminId,
                    product_id: i.product_id,
                    product_name: i.product_name,
                    type: "saida" as const,
                    quantity: -Math.abs(Number(i.quantity)),
                    reference: `Pedido #${orderId.padStart(4, "0")}`,
                    notes: null,
                }));

            if (movements.length > 0) {
                await supabaseServer.from("stock_movements").insert(movements);
            }
        }
    }

    return NextResponse.json({ ok: true, status });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/orders/[id]/status/route.ts
git commit -m "feat: add PATCH /api/orders/[id]/status with auto stock debit on entregue"
```

---

## Task 9: Página `/estoque`

**Files:**
- Create: `src/app/estoque/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
// src/app/estoque/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
    Package, TrendingDown, AlertTriangle, DollarSign,
    History, ArrowUpCircle, ArrowDownCircle, Settings2,
    ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { StockBadge } from "@/components/stock-badge";
import type { Product, StockMovement } from "@/lib/types";

const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";
const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };
const THRESHOLD = 5;
const PAGE_SIZE = 20;

type Tab = "overview" | "history";

export default function EstoquePage() {
    const { adminSession } = useAuth();
    const [tab, setTab] = useState<Tab>("overview");
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [movPage, setMovPage] = useState(0);
    const [movTotal, setMovTotal] = useState(0);
    const [adjustingId, setAdjustingId] = useState<string | null>(null);
    const [adjustQty, setAdjustQty] = useState("");
    const [adjustNotes, setAdjustNotes] = useState("");
    const [adjusting, setAdjusting] = useState(false);

    useEffect(() => {
        if (!adminSession) return;
        loadProducts();
    }, [adminSession]);

    useEffect(() => {
        if (!adminSession || tab !== "history") return;
        loadMovements();
    }, [adminSession, tab, movPage]);

    async function loadProducts() {
        setLoading(true);
        const { data } = await supabase
            .from("products")
            .select("*")
            .eq("admin_id", adminSession!.adminId)
            .eq("active", true)
            .order("name");
        setProducts((data ?? []) as Product[]);
        setLoading(false);
    }

    async function loadMovements() {
        const from = movPage * PAGE_SIZE;
        const { data, count } = await supabase
            .from("stock_movements")
            .select("*", { count: "exact" })
            .eq("admin_id", adminSession!.adminId)
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
        setMovements((data ?? []) as StockMovement[]);
        setMovTotal(count ?? 0);
    }

    async function handleAdjust(productId: string) {
        const qty = parseInt(adjustQty);
        if (isNaN(qty) || qty < 0 || !adjustNotes.trim()) return;
        setAdjusting(true);

        const res = await fetch("/api/estoque/ajuste", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product_id: productId,
                quantity: qty,
                mode: "set",
                notes: adjustNotes.trim(),
            }),
        });

        if (res.ok) {
            await loadProducts();
            setAdjustingId(null);
            setAdjustQty("");
            setAdjustNotes("");
        }
        setAdjusting(false);
    }

    const totalValue = products.reduce((s, p) => s + p.stock_quantity * p.price, 0);
    const zerados = products.filter((p) => p.stock_quantity === 0).length;
    const baixos = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= THRESHOLD).length;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
                <p className={cn(eyebrowClass, "mb-3")}>Controle</p>
                <h1 className="text-[40px] leading-[0.96] tracking-tight text-stone-900" style={sectionTitleStyle}>
                    Estoque
                </h1>
            </header>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "SKUs ativos", value: products.length, icon: Package, gradient: "from-stone-700 to-stone-900" },
                    { label: "Estoque baixo", value: baixos, icon: AlertTriangle, gradient: "from-amber-400 to-orange-500" },
                    { label: "Zerados", value: zerados, icon: TrendingDown, gradient: "from-red-500 to-red-700" },
                    { label: "Valor em estoque", value: `R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, gradient: "from-emerald-500 to-emerald-700" },
                ].map(({ label, value, icon: Icon, gradient }) => (
                    <div key={label} className={cn("relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ring-1 ring-stone-200/60", gradient)}>
                        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                            <Icon className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-white tabular-nums leading-none text-[28px]" style={sectionTitleStyle}>{value}</p>
                        <p className="text-[11.5px] font-medium text-white/75 mt-1.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit">
                {(["overview", "history"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
                            tab === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                        )}
                    >
                        {t === "overview" ? "Visão Geral" : "Histórico"}
                    </button>
                ))}
            </div>

            {/* Overview tab */}
            {tab === "overview" && (
                <div className="bg-white rounded-2xl border border-stone-200/70 overflow-hidden">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-stone-100 text-left">
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider">Produto</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider hidden md:table-cell">Categoria</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider">Estoque</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider hidden lg:table-cell">Preço unit.</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        <td className="px-5 py-3" colSpan={5}>
                                            <div className="h-4 bg-stone-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : products.map((p) => (
                                <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                                    <td className="px-5 py-3 font-medium text-stone-900">{p.name}</td>
                                    <td className="px-5 py-3 text-stone-500 hidden md:table-cell">{p.category}</td>
                                    <td className="px-5 py-3">
                                        {adjustingId === p.id ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <input
                                                    type="number" min={0}
                                                    value={adjustQty}
                                                    onChange={(e) => setAdjustQty(e.target.value)}
                                                    className="w-20 h-8 px-2 rounded-lg border border-stone-300 text-[13px] focus:outline-none focus:border-stone-900"
                                                    placeholder="Qtd"
                                                    autoFocus
                                                />
                                                <input
                                                    type="text"
                                                    value={adjustNotes}
                                                    onChange={(e) => setAdjustNotes(e.target.value)}
                                                    className="w-36 h-8 px-2 rounded-lg border border-stone-300 text-[13px] focus:outline-none focus:border-stone-900"
                                                    placeholder="Motivo"
                                                />
                                                <button
                                                    onClick={() => handleAdjust(p.id)}
                                                    disabled={adjusting}
                                                    className="h-8 px-3 bg-stone-900 text-white rounded-lg text-[12px] font-semibold disabled:opacity-50"
                                                >
                                                    {adjusting ? "..." : "Salvar"}
                                                </button>
                                                <button onClick={() => setAdjustingId(null)} className="h-8 px-2 text-stone-400 hover:text-stone-600 text-[12px]">
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : (
                                            <StockBadge quantity={p.stock_quantity} threshold={THRESHOLD} />
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-stone-600 hidden lg:table-cell">
                                        R$ {p.price.toFixed(2).replace(".", ",")}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                setAdjustingId(p.id);
                                                setAdjustQty(String(p.stock_quantity));
                                                setAdjustNotes("");
                                            }}
                                            className="text-[12px] text-stone-400 hover:text-stone-900 transition-colors font-medium flex items-center gap-1 ml-auto"
                                        >
                                            <Settings2 className="w-3.5 h-3.5" />
                                            Ajustar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* History tab */}
            {tab === "history" && (
                <div className="bg-white rounded-2xl border border-stone-200/70 overflow-hidden">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-stone-100 text-left">
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider">Data</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider">Produto</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider">Tipo</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider">Qtd</th>
                                <th className="px-5 py-3 font-semibold text-stone-500 text-[11px] uppercase tracking-wider hidden md:table-cell">Referência</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {movements.map((m) => (
                                <tr key={m.id} className="hover:bg-stone-50/60 transition-colors">
                                    <td className="px-5 py-3 text-stone-500 tabular-nums whitespace-nowrap">
                                        {new Date(m.created_at).toLocaleDateString("pt-BR")}
                                    </td>
                                    <td className="px-5 py-3 font-medium text-stone-900 truncate max-w-[180px]">{m.product_name}</td>
                                    <td className="px-5 py-3">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                                            m.type === "entrada" ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" :
                                            m.type === "saida"   ? "bg-red-50 text-red-700 border-red-200/60" :
                                                                   "bg-blue-50 text-blue-700 border-blue-200/60"
                                        )}>
                                            {m.type === "entrada" ? <ArrowUpCircle className="w-3 h-3" /> : m.type === "saida" ? <ArrowDownCircle className="w-3 h-3" /> : <Settings2 className="w-3 h-3" />}
                                            {m.type === "entrada" ? "Entrada" : m.type === "saida" ? "Saída" : "Ajuste"}
                                        </span>
                                    </td>
                                    <td className={cn("px-5 py-3 tabular-nums font-semibold", m.quantity >= 0 ? "text-emerald-700" : "text-red-700")}>
                                        {m.quantity >= 0 ? "+" : ""}{m.quantity}
                                    </td>
                                    <td className="px-5 py-3 text-stone-500 hidden md:table-cell">{m.reference ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    <div className="border-t border-stone-100 px-5 py-3 flex items-center justify-between">
                        <span className="text-[12px] text-stone-500">{movTotal} movimentos</span>
                        <div className="flex gap-1">
                            <button onClick={() => setMovPage((p) => Math.max(0, p - 1))} disabled={movPage === 0} className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button onClick={() => setMovPage((p) => p + 1)} disabled={(movPage + 1) * PAGE_SIZE >= movTotal} className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/estoque/page.tsx
git commit -m "feat: add /estoque page with overview and movement history"
```

---

## Task 10: Página `/estoque/receber`

**Files:**
- Create: `src/app/estoque/receber/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
// src/app/estoque/receber/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Camera, Check, X, Plus, Loader2, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { parseNfeXml, extractChaveFromQrUrl, matchProductByName } from "@/lib/nfe-xml-parser";
import type { NfeProduct, Product } from "@/lib/types";

type Tab = "nfe" | "barcode";
type ItemStatus = "match" | "partial" | "new";

interface ReviewItem {
    nfeProduct: NfeProduct;
    matchedProductId: string | null;
    matchedProductName: string | null;
    status: ItemStatus;
    confirmed: boolean;
    category: string;
}

const CATEGORIES = [
    "Outros Produtos","Telhas","Tintas e Massas","Eletroduto e Lavanderia",
    "Vigas e Cantoneiras","Ferragens","Eletricidade e Cabos","Canos",
];

const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 400 };
const eyebrowClass = "text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500";

export default function ReceberPage() {
    const { adminSession } = useAuth();
    const [tab, setTab] = useState<Tab>("nfe");
    const [products, setProducts] = useState<Product[]>([]);

    // NF-e state
    const [chaveAcesso, setChaveAcesso] = useState("");
    const [supplierName, setSupplierName] = useState("");
    const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [xmlError, setXmlError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Barcode state
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannedBarcode, setScannedBarcode] = useState("");
    const [barcodeInfo, setBarcodeInfo] = useState<{ name: string; unit: string } | null>(null);
    const [barcodeQty, setBarcodeQty] = useState("1");
    const [barcodeCategory, setBarcodeCategory] = useState("Outros Produtos");
    const [barcodeLoading, setBarcodeLoading] = useState(false);
    const [barcodeSaving, setBarcodeSaving] = useState(false);
    const [barcodeSaved, setBarcodeSaved] = useState(false);

    useEffect(() => {
        if (!adminSession) return;
        supabase
            .from("products")
            .select("id, name, barcode, stock_quantity, category, unit, price, active, admin_id, created_at, description, subcategory")
            .eq("admin_id", adminSession.adminId)
            .then(({ data }) => setProducts((data ?? []) as Product[]));
    }, [adminSession]);

    function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setXmlError(null);

        const reader = new FileReader();
        reader.onload = (ev) => {
            const xml = ev.target?.result as string;
            const result = parseNfeXml(xml);

            if (result.error) { setXmlError(result.error); return; }

            if (result.chaveAcesso) setChaveAcesso(result.chaveAcesso);
            if (result.supplierName) setSupplierName(result.supplierName);

            const catalogNames = products.map((p) => p.name);
            const items: ReviewItem[] = result.products.map((nfeProd) => {
                // Match por barcode primeiro
                const byBarcode = nfeProd.cEAN
                    ? products.find((p) => p.barcode === nfeProd.cEAN)
                    : null;

                if (byBarcode) {
                    return { nfeProduct: nfeProd, matchedProductId: byBarcode.id, matchedProductName: byBarcode.name, status: "match", confirmed: true, category: byBarcode.category };
                }

                const idx = matchProductByName(nfeProd.xProd, catalogNames);
                if (idx >= 0) {
                    return { nfeProduct: nfeProd, matchedProductId: products[idx].id, matchedProductName: products[idx].name, status: "partial", confirmed: false, category: products[idx].category };
                }

                return { nfeProduct: nfeProd, matchedProductId: null, matchedProductName: null, status: "new", confirmed: true, category: "Outros Produtos" };
            });

            setReviewItems(items);
        };
        reader.readAsText(file, "utf-8");
    }

    async function handleConfirmReceipt() {
        setConfirming(true);
        const items = reviewItems
            .filter((i) => i.confirmed)
            .map((i) => ({
                product_id: i.matchedProductId,
                name: i.matchedProductId ? i.matchedProductName! : i.nfeProduct.xProd,
                quantity: i.nfeProduct.qCom,
                unit: i.nfeProduct.uCom,
                unit_price: i.nfeProduct.vUnCom,
                barcode: i.nfeProduct.cEAN,
                category: i.category,
            }));

        const res = await fetch("/api/estoque/receber", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items, chave_acesso: chaveAcesso || null, supplier_name: supplierName || null }),
        });

        if (res.ok) {
            setConfirmed(true);
            setReviewItems([]);
        }
        setConfirming(false);
    }

    async function lookupBarcode(barcode: string) {
        setBarcodeLoading(true);
        setBarcodeInfo(null);

        // Verificar se já existe no catálogo
        const existing = products.find((p) => p.barcode === barcode);
        if (existing) {
            setBarcodeInfo({ name: existing.name, unit: existing.unit });
            setBarcodeLoading(false);
            return;
        }

        // Open EAN lookup
        try {
            const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${barcode}`, {
                headers: { "X-Cosmos-Token": "" },
            }).catch(() => null);

            if (res?.ok) {
                const data = await res.json();
                if (data?.description) {
                    setBarcodeInfo({ name: data.description, unit: "por unidade" });
                    setBarcodeLoading(false);
                    return;
                }
            }
        } catch { /* continua sem info */ }

        setBarcodeLoading(false);
    }

    async function handleBarcodeSave() {
        if (!scannedBarcode || !barcodeInfo?.name) return;
        setBarcodeSaving(true);

        const qty = parseInt(barcodeQty) || 1;
        const existing = products.find((p) => p.barcode === scannedBarcode);

        await fetch("/api/estoque/receber", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    product_id: existing?.id ?? null,
                    name: barcodeInfo.name,
                    quantity: qty,
                    unit: barcodeInfo.unit,
                    unit_price: 0,
                    barcode: scannedBarcode,
                    category: barcodeCategory,
                }],
                chave_acesso: null,
                supplier_name: null,
            }),
        });

        setBarcodeSaved(true);
        setTimeout(() => {
            setScannedBarcode("");
            setBarcodeInfo(null);
            setBarcodeQty("1");
            setBarcodeSaved(false);
        }, 2000);
        setBarcodeSaving(false);
    }

    const statusConfig: Record<ItemStatus, { label: string; dot: string }> = {
        match:   { label: "Match exato", dot: "bg-emerald-500" },
        partial: { label: "Match parcial — confirme", dot: "bg-amber-400" },
        new:     { label: "Produto novo", dot: "bg-red-500" },
    };

    return (
        <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
                <p className={cn(eyebrowClass, "mb-3")}>Estoque</p>
                <h1 className="text-[40px] leading-[0.96] tracking-tight text-stone-900" style={sectionTitleStyle}>
                    Receber Mercadoria
                </h1>
            </header>

            {/* Tabs */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit">
                {(["nfe", "barcode"] as Tab[]).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={cn(
                        "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
                        tab === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                    )}>
                        {t === "nfe" ? "Importar NF-e" : "Código de Barras"}
                    </button>
                ))}
            </div>

            {/* NF-e tab */}
            {tab === "nfe" && (
                <div className="space-y-5">
                    {confirmed ? (
                        <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-8 text-center">
                            <Check className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                            <p className="text-[18px] font-semibold text-emerald-900" style={sectionTitleStyle}>Recebimento confirmado!</p>
                            <p className="text-[13px] text-emerald-700 mt-1">Estoque atualizado com sucesso.</p>
                            <button onClick={() => setConfirmed(false)} className="mt-4 px-4 h-9 rounded-xl border border-emerald-300 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors">
                                Novo recebimento
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-2xl border border-stone-200/70 p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">Chave de Acesso (44 dígitos)</label>
                                        <input
                                            type="text" maxLength={44}
                                            value={chaveAcesso}
                                            onChange={(e) => setChaveAcesso(e.target.value.replace(/\D/g, "").slice(0, 44))}
                                            placeholder="Digite ou cole a chave"
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900 font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">Fornecedor (opcional)</label>
                                        <input
                                            type="text"
                                            value={supplierName}
                                            onChange={(e) => setSupplierName(e.target.value)}
                                            placeholder="Nome do fornecedor"
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[12px] font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">Upload do XML da NF-e</label>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full h-24 rounded-xl border-2 border-dashed border-stone-200 hover:border-stone-400 flex flex-col items-center justify-center gap-2 text-stone-400 hover:text-stone-600 transition-colors"
                                    >
                                        <Upload className="w-5 h-5" />
                                        <span className="text-[13px] font-medium">Clique para selecionar o arquivo XML</span>
                                    </button>
                                    <input ref={fileInputRef} type="file" accept=".xml" onChange={handleXmlUpload} className="hidden" />
                                    {xmlError && <p className="text-[12px] text-red-600 mt-2">{xmlError}</p>}
                                </div>
                            </div>

                            {/* Review table */}
                            {reviewItems.length > 0 && (
                                <div className="bg-white rounded-2xl border border-stone-200/70 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                                        <p className="font-semibold text-stone-900">{reviewItems.length} produtos na nota</p>
                                        <p className="text-[12px] text-stone-500">{reviewItems.filter((i) => i.confirmed).length} selecionados</p>
                                    </div>
                                    <div className="divide-y divide-stone-100">
                                        {reviewItems.map((item, idx) => {
                                            const cfg = statusConfig[item.status];
                                            return (
                                                <div key={idx} className={cn("px-5 py-3 flex items-start gap-3", !item.confirmed && "opacity-60")}>
                                                    <input
                                                        type="checkbox"
                                                        checked={item.confirmed}
                                                        onChange={(e) => setReviewItems((prev) => prev.map((it, i) => i === idx ? { ...it, confirmed: e.target.checked } : it))}
                                                        className="mt-0.5 accent-stone-900"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-semibold text-stone-900 truncate">{item.nfeProduct.xProd}</p>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                                                                <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                                                                {cfg.label}
                                                            </span>
                                                            <span className="text-[11px] text-stone-400">{item.nfeProduct.qCom} {item.nfeProduct.uCom} · R$ {item.nfeProduct.vUnCom.toFixed(2)}</span>
                                                        </div>
                                                        {item.status === "partial" && (
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <span className="text-[12px] text-stone-500">Vincular a:</span>
                                                                <select
                                                                    value={item.matchedProductId ?? ""}
                                                                    onChange={(e) => {
                                                                        const prod = products.find((p) => p.id === e.target.value);
                                                                        setReviewItems((prev) => prev.map((it, i) => i === idx ? { ...it, matchedProductId: e.target.value || null, matchedProductName: prod?.name ?? null, confirmed: !!e.target.value } : it));
                                                                    }}
                                                                    className="h-7 px-2 text-[12px] border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900"
                                                                >
                                                                    <option value="">— Criar novo —</option>
                                                                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                                </select>
                                                            </div>
                                                        )}
                                                        {item.status === "new" && (
                                                            <select
                                                                value={item.category}
                                                                onChange={(e) => setReviewItems((prev) => prev.map((it, i) => i === idx ? { ...it, category: e.target.value } : it))}
                                                                className="mt-1.5 h-7 px-2 text-[12px] border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900"
                                                            >
                                                                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="border-t border-stone-100 px-5 py-4">
                                        <button
                                            onClick={handleConfirmReceipt}
                                            disabled={confirming || reviewItems.filter((i) => i.confirmed).length === 0}
                                            className="w-full h-11 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                            Confirmar Recebimento ({reviewItems.filter((i) => i.confirmed).length} itens)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Barcode tab */}
            {tab === "barcode" && (
                <div className="space-y-5">
                    {scannerOpen && (
                        <BarcodeScanner
                            onDetected={(barcode) => {
                                setScannerOpen(false);
                                setScannedBarcode(barcode);
                                lookupBarcode(barcode);
                            }}
                            onClose={() => setScannerOpen(false)}
                        />
                    )}

                    <div className="bg-white rounded-2xl border border-stone-200/70 p-5 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={scannedBarcode}
                                onChange={(e) => { setScannedBarcode(e.target.value); if (e.target.value.length >= 8) lookupBarcode(e.target.value); }}
                                placeholder="Código EAN / GTIN"
                                className="flex-1 h-10 px-3 rounded-xl border border-stone-200 text-[13px] font-mono focus:outline-none focus:border-stone-900"
                            />
                            <button
                                onClick={() => setScannerOpen(true)}
                                className="h-10 px-4 bg-stone-900 text-white rounded-xl text-[13px] font-semibold flex items-center gap-2 hover:bg-stone-800 transition-colors"
                            >
                                <Camera className="w-4 h-4" />
                                <span className="hidden sm:inline">Câmera</span>
                            </button>
                        </div>

                        {barcodeLoading && (
                            <div className="flex items-center gap-2 text-[13px] text-stone-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Buscando produto...
                            </div>
                        )}

                        {scannedBarcode && !barcodeLoading && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[12px] font-semibold text-stone-500 mb-1 uppercase tracking-wider">Nome do produto</label>
                                    <input
                                        type="text"
                                        value={barcodeInfo?.name ?? ""}
                                        onChange={(e) => setBarcodeInfo((prev) => ({ name: e.target.value, unit: prev?.unit ?? "por unidade" }))}
                                        placeholder="Nome do produto"
                                        className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1 uppercase tracking-wider">Quantidade recebida</label>
                                        <input
                                            type="number" min={1}
                                            value={barcodeQty}
                                            onChange={(e) => setBarcodeQty(e.target.value)}
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-semibold text-stone-500 mb-1 uppercase tracking-wider">Categoria</label>
                                        <select
                                            value={barcodeCategory}
                                            onChange={(e) => setBarcodeCategory(e.target.value)}
                                            className="w-full h-10 px-3 rounded-xl border border-stone-200 text-[13px] focus:outline-none focus:border-stone-900"
                                        >
                                            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={handleBarcodeSave}
                                    disabled={barcodeSaving || !barcodeInfo?.name || barcodeSaved}
                                    className="w-full h-11 bg-stone-900 text-white rounded-xl text-[13px] font-semibold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {barcodeSaved ? <><Check className="w-4 h-4" /> Salvo!</> :
                                     barcodeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                     <><Plus className="w-4 h-4" /> Confirmar entrada</>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/estoque/receber/page.tsx
git commit -m "feat: add /estoque/receber page with NF-e XML import and barcode scanner"
```

---

## Task 11: Atualizar Nav Sidebar

**Files:**
- Modify: `src/components/nav-sidebar.tsx`

- [ ] **Step 1: Adicionar item Estoque**

Em `src/components/nav-sidebar.tsx`, localizar o array `menuItems` e adicionar Estoque entre Produtos e Chat:

```typescript
import {
    LayoutDashboard, Package, Users, Store, LogOut,
    MessageSquare, ShieldCheck, ShoppingBag, Warehouse,
} from "lucide-react";

const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard",        href: "/" },
    { icon: Package,         label: "Pedidos",          href: "/pedidos" },
    { icon: Users,           label: "Clientes",         href: "/clientes" },
    { icon: ShoppingBag,     label: "Produtos",         href: "/produtos" },
    { icon: Warehouse,       label: "Estoque",          href: "/estoque" },
    { icon: MessageSquare,   label: "Chat Inteligente", href: "/chat" },
    { icon: Store,           label: "Loja",             href: "/loja" },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/nav-sidebar.tsx
git commit -m "feat: add Estoque item to nav sidebar"
```

---

## Task 12: Atualizar Página `/produtos` — Coluna de Estoque

**Files:**
- Modify: `src/app/produtos/page.tsx`

- [ ] **Step 1: Adicionar stock_quantity e barcode à interface Product local**

Localizar a interface `Product` dentro do arquivo e substituir:

```typescript
interface Product {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subcategory: string | null;
    unit: string;
    price: number;
    active: boolean;
    stock_quantity: number;
    barcode: string | null;
    created_at: string;
}
```

- [ ] **Step 2: Adicionar import do StockBadge**

No topo do arquivo, após os imports existentes:

```typescript
import { StockBadge } from "@/components/stock-badge";
```

- [ ] **Step 3: Adicionar coluna Estoque na tabela**

Localizar o cabeçalho da tabela de produtos e adicionar após a coluna de preço:

```tsx
<th className="px-4 py-3 text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
    Estoque
</th>
```

E na linha de dados do produto, após a célula de preço:

```tsx
<td className="px-4 py-3">
    <StockBadge quantity={product.stock_quantity} showNumber={false} />
</td>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/produtos/page.tsx
git commit -m "feat: add stock column to /produtos page"
```

---

## Task 13: Dashboard com Dados Reais

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Remover chartData hardcoded e buscar dados reais**

Localizar e remover:
```typescript
const chartData = [
    { name: "Seg", pedidos: 4 },
    // ... linhas até
    { name: "Dom", pedidos: 3 },
];
```

Substituir pelo estado e query real dentro do `useEffect` já existente (após `setStats`):

```typescript
// Dentro da função load(), após setStats(...)
const { data: chartRaw } = await supabase.rpc("orders_by_day", {
    p_admin_id: adminSession!.adminId,
}).catch(() => ({ data: null }));

// Fallback: query manual se RPC não existir
let weekData: { name: string; pedidos: number }[] = [];
if (!chartRaw) {
    const days = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
    const today = new Date();
    weekData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return { name: days[d.getDay()], date: d.toISOString().slice(0, 10), pedidos: 0 };
    });

    const { data: recentOrders } = await supabase
        .from("orders")
        .select("created_at")
        .eq("admin_id", adminSession!.adminId)
        .gte("created_at", weekData[0].date + "T00:00:00Z");

    (recentOrders ?? []).forEach((o) => {
        const day = o.created_at?.slice(0, 10);
        const entry = weekData.find((w) => w.date === day);
        if (entry) entry.pedidos++;
    });
}

setChartData(chartRaw ?? weekData);
```

- [ ] **Step 2: Adicionar estado chartData e setChartData**

Após a declaração do estado `stats`, adicionar:

```typescript
const [chartData, setChartData] = useState<{ name: string; pedidos: number }[]>([]);
```

- [ ] **Step 3: Adicionar card "Estoque baixo" e remover badge +12% estático**

Localizar o trecho com `TrendingUp` e o badge `+12%`:

```tsx
<div className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700 bg-emerald-50/80 border border-emerald-200/60 px-2.5 py-1 rounded-full">
    <TrendingUp className="w-3 h-3" />
    <span className="font-semibold">+12%</span>
</div>
```

Substituir por dados reais calculados a partir de `stats`:

```tsx
{(() => {
    // Comparar últimos 7 dias vs 7 dias anteriores seria ideal;
    // como aproximação simples, mostrar total de pedidos desta semana
    const thisWeek = chartData.reduce((s, d) => s + d.pedidos, 0);
    return (
        <div className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700 bg-emerald-50/80 border border-emerald-200/60 px-2.5 py-1 rounded-full">
            <TrendingUp className="w-3 h-3" />
            <span className="font-semibold">{thisWeek} esta semana</span>
        </div>
    );
})()}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace hardcoded chart data with real Supabase queries on dashboard"
```

---

## Task 14: Push e verificação final

- [ ] **Step 1: Push para preview**

```bash
git push origin preview
```

- [ ] **Step 2: Rodar migrações no Supabase (se ainda não feitas)**

No Supabase SQL Editor, executar as 4 migrações em ordem (015 → 016 → 017 → 018).

- [ ] **Step 3: Verificar no Vercel preview**

1. Abrir `/estoque` — confirmar que a página carrega com cards de resumo
2. Abrir `/estoque/receber` — testar upload de XML com arquivo de teste
3. Abrir `/estoque/receber` aba Barcode — testar câmera no mobile
4. Abrir `/produtos` — confirmar coluna Estoque visível
5. Abrir `/` (dashboard) — confirmar que o gráfico usa dados reais (pode estar zerado se não há pedidos nos últimos 7 dias — isso é correto)

---

## Checklist de cobertura da spec

| Requisito | Task |
|---|---|
| Migração products (stock_quantity, barcode) | Task 1 |
| Tabela stock_movements | Task 1 |
| Tabela nfe_imports | Task 1 |
| Função decrement_stock | Task 1 |
| Tipos TypeScript | Task 2 |
| StockBadge (OK/Baixo/Zerado) | Task 3 |
| Parser XML NF-e local | Task 4 |
| Scanner de barcode @zxing/browser | Task 5 |
| API ajuste manual | Task 6 |
| API receber mercadoria | Task 7 |
| API status pedido + débito automático | Task 8 |
| Página /estoque visão geral + histórico | Task 9 |
| Página /estoque/receber (NF-e + barcode) | Task 10 |
| Nav sidebar item Estoque | Task 11 |
| Coluna estoque em /produtos | Task 12 |
| Dashboard dados reais | Task 13 |
