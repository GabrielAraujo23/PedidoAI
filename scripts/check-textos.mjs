#!/usr/bin/env node
/**
 * Encontra texto em português cravado no JSX que deve ser extraído para
 * uma camada de conteúdo.
 *
 * Procura por:
 * 1. Texto entre tags JSX: >Algum texto aqui<
 * 2. Texto em atributos: placeholder="...", title="...", alt="...", aria-label="..."
 *
 * Imprime arquivo, linha e o texto encontrado, ordenado por arquivo com mais
 * ocorrências. Sai com 1 se encontrar algo, 0 se não houver.
 *
 * Uso:  node scripts/check-textos.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = "src";

// Arquivos a ignorar na verificação de textos
const EXCECOES = [
    // Não é .tsx, mas fica declarado para quem procurar
    "src/lib/terms.ts",
    // O contrato do PedidoAI é texto do produto, não da loja do lojista
    "src/app/contratar/page.tsx",
];

function arquivos(dir) {
    const saida = [];
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
        else if (nome.endsWith(".tsx")) saida.push(caminho);
    }
    return saida;
}

function ehTextoPortugues(texto) {
    // Remove espaços
    const limpo = texto.trim();

    // Deve ter 4 ou mais caracteres
    if (limpo.length < 4) return false;

    // Deve conter pelo menos uma letra
    if (!/[a-záéíóúãõâêô]/i.test(limpo)) return false;

    // Não é só código (caracteres de sintaxe)
    if (/^[{}()\[\]<>\/\\|&;:,.\-_=+*#@!?$%^~`'"0-9\s]*$/.test(limpo)) return false;

    // Não começa com { (interpolação JavaScript)
    if (limpo.startsWith("{")) return false;

    return true;
}

function extrairTextosDeJSX(conteudo) {
    const textos = [];

    const linhas = conteudo.split(/\r?\n/);
    linhas.forEach((linha, i) => {
        const numeroLinha = i + 1;

        // Padrão 1: Texto entre tags JSX: >Algum texto aqui<
        // Mas evita capturar tags, números, código, etc.
        const regexJSX = />([^<{}]+?)</g;
        let match;
        while ((match = regexJSX.exec(linha)) !== null) {
            const texto = match[1];
            if (ehTextoPortugues(texto)) {
                textos.push({
                    linha: numeroLinha,
                    texto: texto.trim(),
                    tipo: "JSX",
                });
            }
        }

        // Padrão 2: Atributos com texto: placeholder="...", title="...", alt="...", aria-label="..."
        const atributos = ["placeholder", "title", "alt", "aria-label"];
        for (const attr of atributos) {
            // Captura atributo com aspas duplas
            const regexAttr = new RegExp(
                `${attr}="([^"]*)"`,
                "g"
            );
            while ((match = regexAttr.exec(linha)) !== null) {
                const texto = match[1];
                if (ehTextoPortugues(texto)) {
                    textos.push({
                        linha: numeroLinha,
                        texto: texto.trim(),
                        tipo: `@${attr}`,
                    });
                }
            }
        }
    });

    return textos;
}

let total = 0;
const porArquivo = [];

for (const caminho of arquivos(RAIZ)) {
    const rel = relative(".", caminho).replace(/\\/g, "/");
    if (EXCECOES.includes(rel)) continue;

    const conteudo = readFileSync(caminho, "utf8");
    const achados = extrairTextosDeJSX(conteudo);

    if (achados.length) {
        total += achados.length;
        porArquivo.push({ rel, achados });
    }
}

porArquivo.sort((a, b) => b.achados.length - a.achados.length);
for (const { rel, achados } of porArquivo) {
    console.log(`\n${rel}  (${achados.length} ocorrência(s))`);
    for (const { linha, texto, tipo } of achados.slice(0, 5)) {
        console.log(`  ${String(linha).padStart(5)}: [${tipo}] ${texto}`);
    }
    if (achados.length > 5) console.log(`  ... e mais ${achados.length - 5} ocorrência(s)`);
}

if (total === 0) {
    console.log("check:textos — nenhum texto em português cravado. Tudo pronto para extração.");
    process.exit(0);
}
console.log(`\ncheck:textos — ${total} ocorrência(s) de texto em ${porArquivo.length} arquivo(s).`);
process.exit(1);
