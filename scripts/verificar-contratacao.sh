#!/usr/bin/env bash
# Verificação ponta a ponta da contratação de tenant.
#
# Uso:  BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_SENHA=... ./scripts/verificar-contratacao.sh
#
# Cobre o ciclo inteiro, não só o caminho feliz: cadastrar, confirmar que a
# loja NÃO atende, aprovar, confirmar que atende, suspender, confirmar que
# parou de atender.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
OWNER_EMAIL="${OWNER_EMAIL:?defina OWNER_EMAIL}"
OWNER_SENHA="${OWNER_SENHA:?defina OWNER_SENHA}"

SUFIXO="$(date +%s)"
EMAIL="teste-${SUFIXO}@exemplo.com"
SLUG="loja-teste-${SUFIXO}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

falhou() { echo "FALHOU: $1"; exit 1; }
ok()     { echo "ok: $1"; }

echo "== 1. cadastro =="
curl -sS -c "$TMP/lojista.txt" -o "$TMP/cadastro.json" -w '%{http_code}' \
    -H "Content-Type: application/json" -H "Origin: $BASE" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"SenhaDeTeste123\",\"storeName\":\"Loja Teste $SUFIXO\",\"cnpj\":\"\",\"phone\":\"(11) 99999-9999\",\"address\":\"Rua Teste, 1, Centro, São Paulo/SP\",\"slug\":\"$SLUG\",\"acceptedTerms\":true}" \
    "$BASE/api/contratar" > "$TMP/code" || true
[ "$(cat "$TMP/code")" = "200" ] || falhou "cadastro devolveu $(cat "$TMP/code"): $(cat "$TMP/cadastro.json")"
ok "conta criada como pendente"

echo "== 2. loja pendente NÃO atende =="
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/loja/$SLUG")
[ "$CODE" = "404" ] || falhou "/loja/$SLUG devolveu $CODE, esperado 404"
ok "/loja/$SLUG responde 404 enquanto pendente"

echo "== 3. painel bloqueado para pendente =="
CODE=$(curl -sS -b "$TMP/lojista.txt" -o /dev/null -w '%{http_code}' "$BASE/api/produtos")
[ "$CODE" = "403" ] || falhou "/api/produtos devolveu $CODE para tenant pendente, esperado 403"
ok "API do painel responde 403 para pendente"

echo "== 4. login do dono =="
curl -sS -c "$TMP/dono.txt" -o "$TMP/login.json" -w '%{http_code}' \
    -H "Content-Type: application/json" -H "Origin: $BASE" \
    -d "{\"action\":\"signin\",\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_SENHA\"}" \
    "$BASE/api/auth/admin" > "$TMP/code"
[ "$(cat "$TMP/code")" = "200" ] || falhou "login do dono devolveu $(cat "$TMP/code"): $(cat "$TMP/login.json")"
ok "dono autenticado"

ADMIN_ID=$(node -e "const fs=require('fs');process.stdout.write(JSON.parse(fs.readFileSync('$TMP/cadastro.json','utf8')).adminId)")

echo "== 5. aprovação =="
CODE=$(curl -sS -b "$TMP/dono.txt" -o "$TMP/patch.json" -w '%{http_code}' -X PATCH \
    -H "Content-Type: application/json" -H "Origin: $BASE" \
    -d "{\"adminId\":\"$ADMIN_ID\",\"status\":\"ativa\"}" \
    "$BASE/api/pedido-ai-admin/contratacoes")
[ "$CODE" = "200" ] || falhou "aprovação devolveu $CODE: $(cat "$TMP/patch.json")"
ok "tenant liberada"

echo "== 6. loja ativa ATENDE =="
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/loja/$SLUG")
[ "$CODE" = "307" ] || falhou "/loja/$SLUG devolveu $CODE após liberar, esperado 307"
curl -sS -D "$TMP/headers.txt" -o /dev/null "$BASE/loja/$SLUG"
grep -qi 'set-cookie: pedidoai_tenant=' "$TMP/headers.txt" || falhou "redirect sem cookie de tenant"
ok "/loja/$SLUG responde 307 e grava o cookie de tenant"

echo "== 7. suspensão =="
CODE=$(curl -sS -b "$TMP/dono.txt" -o "$TMP/patch2.json" -w '%{http_code}' -X PATCH \
    -H "Content-Type: application/json" -H "Origin: $BASE" \
    -d "{\"adminId\":\"$ADMIN_ID\",\"status\":\"suspensa\",\"reason\":\"teste automatizado\"}" \
    "$BASE/api/pedido-ai-admin/contratacoes")
[ "$CODE" = "200" ] || falhou "suspensão devolveu $CODE: $(cat "$TMP/patch2.json")"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/loja/$SLUG")
[ "$CODE" = "404" ] || falhou "/loja/$SLUG devolveu $CODE após suspender, esperado 404"
ok "suspensão derruba o endereço público"

echo "== 8. transição inválida é recusada =="
CODE=$(curl -sS -b "$TMP/dono.txt" -o /dev/null -w '%{http_code}' -X PATCH \
    -H "Content-Type: application/json" -H "Origin: $BASE" \
    -d "{\"adminId\":\"$ADMIN_ID\",\"status\":\"recusada\",\"reason\":\"x\"}" \
    "$BASE/api/pedido-ai-admin/contratacoes")
[ "$CODE" = "409" ] || falhou "suspensa->recusada devolveu $CODE, esperado 409"
ok "máquina de estados recusa transição inválida"

echo
echo "TUDO OK. Conta de teste deixada no banco: $EMAIL (admin_id $ADMIN_ID)"
echo "Para limpar:  DELETE FROM admins WHERE id = '$ADMIN_ID';"
