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
