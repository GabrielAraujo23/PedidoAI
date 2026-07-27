# Pedido por Ligação — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task.

**Goal:** Allow admin to create a full order (client + items) on behalf of a customer who called by phone, via a guided 3-step wizard at `/atendimento`.

**Architecture:** Single page with local wizard state (step 1–3). Client search hits Supabase directly (anon key, admin_id filter). Order creation goes through a new API route that enforces session + CSRF. On success, redirects to `/pedidos`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (anon key), Tailwind CSS v4, lucide-react. No new npm packages.

---

## Visual Style

Matches the existing admin aesthetic exactly:
- Background: `bg-warm` (#F7F2EA cream)
- Font display: `var(--font-display)` for headings
- Font body: `var(--font-body)` for content
- Primary accent: `#f97316` (orange-500) / `stone-900` for CTAs
- Cards: `bg-white rounded-2xl border border-stone-200/70`
- Step indicator: horizontal bar with filled circle (orange) for current step, muted for others
- Eyebrow labels: `text-[11px] uppercase tracking-[0.22em] font-semibold text-stone-500`
- Animations: `animate-in fade-in slide-in-from-bottom-4 duration-500` on page mount; `slide-in-from-right` on step advance

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/019_add_notes_to_orders.sql` | Create | Add `notes TEXT` column to orders |
| `src/app/atendimento/page.tsx` | Create | Wizard page — all 3 steps |
| `src/app/api/atendimento/pedido/route.ts` | Create | POST: create order + order_items |
| `src/components/nav-sidebar.tsx` | Modify | Add "Atendimento" entry with PhoneCall icon |

---

## Data Model

**Migration required:** Add `notes TEXT` column to `orders` table (one new migration file).

Uses existing tables:

```
clients  (id, name, phone, address, admin_id, created_at)
orders   (id, client, client_id, products, status, position, admin_id, created_at)
order_items (id, order_id, product_id, product_name, unit, quantity, unit_price, total_price)
products (id, name, category, unit, price, active, admin_id)
```

**CartItem** (local state only):
```ts
interface CartItem {
  product_id: string;
  product_name: string;
  unit: string;
  unit_price: number;   // from products.price, read-only
  quantity: number;     // min 1
}
```

**WizardState** (local state):
```ts
type Step = 1 | 2 | 3;

interface SelectedClient {
  id: string;           // existing client id OR "new" for freshly created
  name: string;
  phone: string;
  address: string;
}
```

---

## Step 1 — Cliente

**Layout:**
- Eyebrow: "Atendimento · Passo 1 de 3"
- Heading: "Quem está ligando?"
- Search input (placeholder: "Nome ou telefone...") — queries `clients` table filtering by `admin_id`, matching `name ilike %q%` OR `phone ilike %q%`, limit 8
- Results list: each row shows name (bold) + phone + truncated address; click to select (orange border highlight + orange "✓ Selecionado" badge)
- Deselect: clicking selected row deselects
- Empty state (no results for query): shows "Nenhum cliente encontrado" message
- "Cadastrar novo cliente" section — always visible below results, collapsed by default (shows a `+` expand button). Expands into:
  - Campo: Nome completo (required)
  - Campo: Telefone (required, numeric mask `(XX) XXXXX-XXXX`)
  - Campo: Endereço (optional) — stored in `clients.address` as a single string (not the structured CEP fields)
  - Button "Cadastrar e selecionar": inserts into `clients` via `supabase.from("clients").insert(...)`, then auto-selects the new client; shows inline loading + error
- "Avançar →" button: enabled only when a client is selected; advances to step 2

**Validation:**
- Can't advance without a selected client
- New client form: name and phone are required; inline error messages if empty

---

## Step 2 — Produtos

**Layout:**
- Eyebrow: "Atendimento · Passo 2 de 3"
- Heading: "Montar pedido"
- Sticky top bar (inside card): shows cart summary — "N itens · R$ X,XX" in orange; button "Avançar →" (enabled when cart has ≥1 item)
- Category filter: horizontal scrollable pill row — "Todos" + all distinct categories from products; clicking filters the grid
- Search input: filters by product name (client-side, no extra queries)
- Product grid: 2 columns on mobile, 3 on md+
  - Each card: product name (bold), category (muted small), unit price per unit, quantity stepper (− / qty / +)
  - qty = 0: stepper shows "0" in muted gray, no − button active
  - qty > 0: card gets a subtle orange ring, qty shown in orange
- All products loaded once on step mount, filtered client-side
- "← Voltar" link at bottom-left to go back to step 1 (preserves cart)

**Validation:**
- Cart must have ≥ 1 item to advance
- Minimum quantity per item: 1 (can't go below 0; − at 0 does nothing)

---

## Step 3 — Confirmar

**Layout:**
- Eyebrow: "Atendimento · Passo 3 de 3"
- Heading: "Confirmar pedido"
- Client card (read-only): name, phone, address
- Items list: product name × qty · unit — subtotal right-aligned per row
- Total line (bold, larger): sum of all subtotals
- Observations textarea (optional, placeholder: "Observações de entrega ou produção...")
- "← Editar produtos" text-link (bottom-left) — goes back to step 2, preserves everything
- "✓ Confirmar Pedido" button (stone-900 bg, full-width on mobile, right-aligned on desktop) — triggers API call

**On confirm:**
1. Disable button, show spinner
2. POST `/api/atendimento/pedido` with `{ client_id, client_name, items, notes }`
3. On success: `router.push("/pedidos")`
4. On error: show inline error message below the button (red, with error text from API)

---

## API Route — POST /api/atendimento/pedido

**File:** `src/app/api/atendimento/pedido/route.ts`

**Request body:**
```ts
{
  client_id: string;       // existing client id
  client_name: string;     // for orders.client field
  notes: string | null;    // observations
  items: Array<{
    product_id: string;
    product_name: string;
    unit: string;
    unit_price: number;
    quantity: number;
  }>;
}
```

**Validation:**
- `checkOrigin(request)` → 403 if fails
- `verifySession(cookie)` → 401 if no session
- `items` must be non-empty array, each item must have quantity > 0
- `client_id` must be non-empty string

**Logic:**
1. Verify client belongs to admin: `SELECT id FROM clients WHERE id = client_id AND admin_id = session.adminId` → 404 if not found
2. Compute `products` summary string: `items.map(i => \`\${i.product_name} (x\${i.quantity})\`).join(", ")`
3. Compute next position: `SELECT MAX(position) FROM orders WHERE admin_id = session.adminId` → `max + 1` (or 1 if none)
4. Insert order: `orders` with `{ client: client_name, client_id, products: summary, status: "novo", position, admin_id: session.adminId }`
5. Insert order_items: bulk insert `{ order_id, product_id, product_name, unit, quantity, unit_price }` — `total_price` is a GENERATED column in Postgres, do NOT insert it
6. Return `{ ok: true, order_id }`

**Error handling:** each step returns descriptive error message; no silent swallowing.

---

## Nav Sidebar Change

Add after "Estoque" entry:
```ts
{ icon: PhoneCall, label: "Atendimento", href: "/atendimento" }
```

Import `PhoneCall` from `lucide-react`.

---

## Step Indicator Component (inline)

Horizontal bar with 3 steps. Used at top of each step card:

```
● Cliente ──── ○ Produtos ──── ○ Confirmar
```

- Filled orange circle + bold label = current step
- Muted circle + muted label = upcoming step  
- Checkmark circle + muted label = completed step
- Connecting line: `border-t border-stone-200` between steps

---

## Edge Cases

- **Client not found + creates new**: after `supabase.insert` on client, if insert fails (e.g. duplicate phone), show inline error and keep form open
- **Products load fails**: show error state with retry button in step 2
- **API confirm fails**: show error inline below the confirm button; button re-enables so user can retry
- **Zero-item cart advance**: button is disabled, no action
- **Back navigation**: wizard state is local; pressing browser back leaves `/atendimento` entirely (no special handling needed)
- **Concurrent orders**: position computed with MAX() — acceptable for single-admin use (no transactions needed)
