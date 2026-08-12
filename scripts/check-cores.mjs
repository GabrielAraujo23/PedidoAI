#!/usr/bin/env node
/**
 * Falha se sobrar cor fixa do Tailwind em qualquer .tsx.
 *
 * Este é o critério objetivo de pronto da conversão para tokens, e a defesa
 * contra a reinfiltração: escrever `text-stone-500` é mais rápido que pensar
 * no token certo, então sem uma trava a cor fixa volta sozinha.
 *
 * Uso:  node scripts/check-cores.mjs
 * Sai com 1 se encontrar algo, imprimindo arquivo, linha e o que achou.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = "src";

// Ornamento, não semântica: os "blooms" radiais das telas públicas são
// gradientes decorativos com cor própria, e não representam estado nenhum.
// Ficam nesta lista para a exceção ser visível num lugar só.
const EXCECOES = [
    "src/app/login/page.tsx",
    "src/app/contratar/page.tsx",
    "src/app/contratar/status/page.tsx",
];

const PALETAS = "stone|orange|amber|emerald|red|blue|purple|green|yellow|gray|slate|zinc|neutral|indigo|pink|teal|cyan|rose|lime|sky|violet|fuchsia";
const PREFIXOS = "text|bg|border|ring|from|to|via|divide|outline|decoration|shadow|accent|caret|fill|stroke|placeholder";
const PADRAO = new RegExp(`\\b(?:${PREFIXOS})-(?:${PALETAS})-\\d{2,3}\\b`, "g");

function arquivos(dir) {
    const saida = [];
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
        else if (nome.endsWith(".tsx")) saida.push(caminho);
    }
    return saida;
}

let total = 0;
const porArquivo = [];

for (const caminho of arquivos(RAIZ)) {
    const rel = relative(".", caminho).replace(/\\/g, "/");
    if (EXCECOES.includes(rel)) continue;

    const linhas = readFileSync(caminho, "utf8").split(/\r?\n/);
    const achados = [];
    linhas.forEach((linha, i) => {
        const m = linha.match(PADRAO);
        if (m) achados.push({ linha: i + 1, classes: [...new Set(m)] });
    });
    if (achados.length) {
        total += achados.reduce((a, x) => a + x.classes.length, 0);
        porArquivo.push({ rel, achados });
    }
}

porArquivo.sort((a, b) => b.achados.length - a.achados.length);
for (const { rel, achados } of porArquivo) {
    console.log(`\n${rel}  (${achados.length} linha(s))`);
    for (const { linha, classes } of achados.slice(0, 5)) {
        console.log(`  ${String(linha).padStart(5)}: ${classes.join(" ")}`);
    }
    if (achados.length > 5) console.log(`  ... e mais ${achados.length - 5} linha(s)`);
}

if (total === 0) {
    console.log("check:cores — nenhuma cor fixa. Tudo em tokens.");
    process.exit(0);
}
console.log(`\ncheck:cores — ${total} ocorrência(s) de cor fixa em ${porArquivo.length} arquivo(s).`);
process.exit(1);
