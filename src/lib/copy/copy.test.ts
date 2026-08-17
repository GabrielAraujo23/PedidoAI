import { describe, it, expect } from "vitest";
import { COPY_PADRAO, LIMITES } from "@/lib/copy/padrao";
import { resolverCopy, interpolar } from "@/lib/copy";

describe("resolverCopy", () => {
    it("sem override, devolve o texto padrão", () => {
        expect(resolverCopy("login.titulo", null)).toBe(COPY_PADRAO["login.titulo"]);
    });

    it("com override, devolve o texto da loja", () => {
        expect(resolverCopy("login.titulo", { "login.titulo": "Peça seu gás" })).toBe("Peça seu gás");
    });

    it("override vazio ou só espaços cai no padrão", () => {
        for (const vazio of ["", "   "]) {
            expect(resolverCopy("login.titulo", { "login.titulo": vazio }))
                .toBe(COPY_PADRAO["login.titulo"]);
        }
    });

    it("chave desconhecida no override é ignorada, não quebra", () => {
        expect(resolverCopy("login.titulo", { "chave.que.nao.existe": "x" }))
            .toBe(COPY_PADRAO["login.titulo"]);
    });

    it("override que não é string cai no padrão", () => {
        // JSONB vindo do banco pode ter qualquer coisa dentro.
        const sujo = { "login.titulo": 42 } as unknown as Record<string, string>;
        expect(resolverCopy("login.titulo", sujo)).toBe(COPY_PADRAO["login.titulo"]);
    });
});

describe("interpolar", () => {
    it("substitui os marcadores pelos valores", () => {
        expect(interpolar("{n} itens · entrega {quando}", { n: 3, quando: "hoje" }))
            .toBe("3 itens · entrega hoje");
    });

    it("marcador sem valor fica como está, em vez de virar undefined", () => {
        // Melhor o texto mostrar {n} do que a palavra "undefined" para o cliente.
        expect(interpolar("{n} itens", {})).toBe("{n} itens");
    });

    it("texto sem marcador passa intacto", () => {
        expect(interpolar("Nenhum pedido ainda.", { n: 1 })).toBe("Nenhum pedido ainda.");
    });
});

describe("o catálogo respeita os próprios limites", () => {
    // Um título de 200 caracteres onde cabiam 40 destrói a tela que os Sprints
    // 1 e 2 calibraram. O limite é declarado junto da chave; este teste garante
    // que o PADRÃO já cabe nele — se o padrão não cabe, o limite está errado.
    it("todo texto padrão cabe no limite declarado da sua chave", () => {
        const estouros: string[] = [];
        for (const [chave, texto] of Object.entries(COPY_PADRAO)) {
            const limite = LIMITES[chave as keyof typeof LIMITES];
            if (limite && texto.length > limite) {
                estouros.push(`${chave}: ${texto.length} > ${limite}`);
            }
        }
        expect(estouros).toEqual([]);
    });

    it("nenhuma chave tem texto vazio", () => {
        for (const [chave, texto] of Object.entries(COPY_PADRAO)) {
            expect(texto.trim(), chave).not.toBe("");
        }
    });
});
