# -*- coding: utf-8 -*-
"""
Security regression tests for PedidoAI.
Tests all flows modified during the VibeSec hardening cycle.
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright
import json

BASE = "http://localhost:3000"
PASS_MARK = "[PASS]"
FAIL_MARK = "[FAIL]"

results = []

def check(label, condition, detail=""):
    status = PASS_MARK if condition else FAIL_MARK
    results.append((label, condition))
    msg = f"{status} {label}"
    if detail:
        msg += f"\n       {detail}"
    print(msg)
    return condition

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()

    # ── 1. MIDDLEWARE: unauthenticated access to admin routes ─────────────────
    section("1 · Middleware — Proteção server-side de rotas admin")

    page = ctx.new_page()

    def nav(url):
        try:
            page.goto(url, wait_until="load", timeout=15000)
        except Exception:
            pass  # timeout ok — just check the URL
        return page.url

    landed = nav(f"{BASE}/")
    check("GET / sem sessao redireciona para /login",        "/login" in landed,      f"URL final: {landed}")
    landed = nav(f"{BASE}/pedidos")
    check("GET /pedidos sem sessao redireciona para /login", "/login" in landed,      f"URL final: {landed}")
    landed = nav(f"{BASE}/produtos")
    check("GET /produtos sem sessao redireciona para /login","/login" in landed,      f"URL final: {landed}")
    landed = nav(f"{BASE}/clientes")
    check("GET /clientes sem sessao redireciona para /login","/login" in landed,      f"URL final: {landed}")

    # ── 2. SESSION COOKIE: httpOnly attributes ────────────────────────────────
    section("2 · Cookie de sessão — atributos de segurança")

    # Try reading pedidoai_session via JS (should be undefined — httpOnly)
    nav(f"{BASE}/acesso")
    cookie_via_js = page.evaluate("""
        () => document.cookie.includes('pedidoai_session')
    """)
    check(
        "Cookie pedidoai_session NÃO acessível via document.cookie (httpOnly)",
        not cookie_via_js,
        f"document.cookie inclui pedidoai_session: {cookie_via_js}"
    )

    # Check localStorage has no admin session
    ls_val = page.evaluate("() => localStorage.getItem('pedidoai_admin_session')")
    check(
        "localStorage NÃO contém pedidoai_admin_session",
        ls_val is None,
        f"Valor no localStorage: {ls_val}"
    )

    # ── 3. ADMIN LOGIN PAGE: basic render ─────────────────────────────────────
    section("3 · Página /acesso — renderização e elementos")

    nav(f"{BASE}/acesso")
    check(
        "Pagina /acesso carrega sem erro",
        page.title() != "" and "error" not in page.content().lower()[:200],
    )

    # Should have email + password fields
    has_email = page.locator('input[type="email"]').count() > 0
    has_pass  = page.locator('input[type="password"]').count() > 0
    check("Campo de email presente",    has_email)
    check("Campo de senha presente",    has_pass)

    # Must NOT show any "código" / token on screen (prototype mode removed)
    content = page.content()
    no_token_leak = "Código gerado" not in content and "protótipo" not in content
    check(
        "Token de reset NÃO exibido na tela",
        no_token_leak,
        "Procurando 'Código gerado' e 'protótipo' no HTML"
    )

    # ── 4. ADMIN LOGIN: wrong credentials ────────────────────────────────────
    section("4 · Login admin — credenciais erradas")

    nav(f"{BASE}/acesso")
    page.locator('input[type="email"]').fill("naoexiste@teste.com")
    page.locator('input[type="password"]').fill("senhaerrada123")
    page.locator('button[type="submit"]').click()
    page.wait_for_timeout(2000)

    error_visible = page.locator("text=Credenciais inválidas").count() > 0
    check(
        "Mensagem unificada 'Credenciais inválidas' (sem enumerar usuário)",
        error_visible,
    )

    # Must NOT show "Email não encontrado" or "Senha incorreta"
    no_enum = (
        "Email não encontrado" not in page.content() and
        "Senha incorreta"      not in page.content()
    )
    check(
        "Mensagens específicas de enumeração ausentes",
        no_enum,
    )

    # ── 5. RATE LIMITING: hammer signin endpoint ──────────────────────────────
    section("5 · Rate limiting — múltiplas tentativas de login")

    import urllib.request, urllib.error

    blocked = False
    for i in range(12):
        data = json.dumps({"action": "signin", "email": "x@x.com", "password": "wrong"}).encode()
        req  = urllib.request.Request(
            f"{BASE}/api/auth/admin",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                pass  # 2xx
        except urllib.error.HTTPError as e:
            if e.code == 429:
                blocked = True
                retry_after = e.headers.get("Retry-After", "?")
                print(f"       Bloqueado na tentativa {i+1} — Retry-After: {retry_after}s")
                break

    check(
        "Endpoint /api/auth/admin retorna 429 após exceder limite",
        blocked,
    )

    # ── 6. CLIENT LOGIN PAGE: basic render ───────────────────────────────────
    section("6 · Página /login (cliente) — renderização")

    nav(f"{BASE}/login")
    check(
        "Pagina /login carrega sem erro",
        page.title() != "",
    )
    has_phone = page.locator('input[type="tel"]').count() > 0
    check("Campo de telefone presente", has_phone)

    # ── 7. PUBLIC ROUTES: accessible without session ──────────────────────────
    section("7 · Rotas públicas — acessíveis sem sessão")

    check("GET /login acessivel sem sessao",                nav(f"{BASE}/login")         and "/login"    in nav(f"{BASE}/login"))
    check("GET /acesso acessivel sem sessao",               "/acesso"  in nav(f"{BASE}/acesso"))
    check("GET /cliente/chat acessivel sem sessao",         "/cliente/" in nav(f"{BASE}/cliente/chat"))

    # ── 8. API SESSION: unauthenticated GET returns 401 ──────────────────────
    section("8 · API /api/auth/session — sem cookie retorna 401")

    req = urllib.request.Request(f"{BASE}/api/auth/session", method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code

    check(
        "GET /api/auth/session sem cookie retorna 401",
        status == 401,
        f"Status recebido: {status}"
    )

    # ── 9. SECURITY HEADERS ───────────────────────────────────────────────────
    section("9 · Security headers")

    req = urllib.request.Request(f"{BASE}/login", method="GET")
    with urllib.request.urlopen(req) as resp:
        headers = dict(resp.headers)

    cto  = headers.get("X-Content-Type-Options", "").lower()
    xfo  = headers.get("X-Frame-Options", "").lower()
    rp   = headers.get("Referrer-Policy", "").lower()
    csp  = headers.get("Content-Security-Policy", "")

    check("X-Content-Type-Options: nosniff",           cto == "nosniff",           cto)
    check("X-Frame-Options: DENY",                      xfo == "deny",              xfo)
    check("Referrer-Policy presente",                   "origin" in rp,             rp)
    check("Content-Security-Policy presente",           len(csp) > 0)
    check("CSP tem frame-ancestors 'none'",             "frame-ancestors 'none'" in csp)
    check("CSP tem object-src 'none'",                  "object-src 'none'" in csp)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
section("RESUMO")
total   = len(results)
passed  = sum(1 for _, ok in results if ok)
failed  = total - passed

print(f"\n  {passed}/{total} testes passaram")
if failed:
    print(f"\n  Falhas:")
    for label, ok in results:
        if not ok:
            print(f"    {FAIL_MARK} {label}")

sys.exit(0 if failed == 0 else 1)
