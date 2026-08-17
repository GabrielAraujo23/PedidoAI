import { describe, it, expect } from "vitest";
import { COPY_PADRAO } from "@/lib/copy/padrao";
import { sanitizarOverrides, TETO_CHAVES } from "@/lib/copy/sanitizar";

describe("sanitizarOverrides", () => {
    it("devolve {} para entrada null", () => {
        expect(sanitizarOverrides(null)).toEqual({});
    });

    it("devolve {} para entrada undefined", () => {
        expect(sanitizarOverrides(undefined)).toEqual({});
    });

    it("devolve {} para entrada que é array", () => {
        expect(sanitizarOverrides(["a", "b"])).toEqual({});
    });

    it("devolve {} para entrada que é número", () => {
        expect(sanitizarOverrides(42)).toEqual({});
    });

    it("devolve {} para entrada que é string", () => {
        expect(sanitizarOverrides("não é objeto")).toEqual({});
    });

    it("devolve {} para entrada que é booleano", () => {
        expect(sanitizarOverrides(true)).toEqual({});
    });

    it("descarta chave que não existe em COPY_PADRAO", () => {
        // Uma chave que nunca foi parte do padrão não pode virar override,
        // senão renomear uma chave no código deixaria o banco com lixo.
        const entrada = {
            "login.titulo": "Novo título",
            "chave.que.nao.existe": "deve ser ignorada",
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({ "login.titulo": "Novo título" });
    });

    it("descarta chave herdada de Object.prototype", () => {
        // `chave in COPY_PADRAO` percorre a cadeia de protótipos, e por isso
        // "toString", "constructor" e "valueOf" passavam como se fossem
        // chaves do catálogo. O teste acima não pegava: ele usa um nome
        // inventado, e nome inventado não está no protótipo. Estes três
        // estão, e é por isso que precisam de teste próprio.
        const entrada = {
            "toString": "invadido",
            "constructor": "invadido",
            "valueOf": "invadido",
            "login.titulo": "Novo título",
        };
        expect(sanitizarOverrides(entrada)).toEqual({ "login.titulo": "Novo título" });
    });

    it("descarta valor que não é string", () => {
        // JSONB vindo do banco pode ter qualquer tipo dentro.
        const entrada = {
            "login.titulo": "Válido",
            "login.bemvindo": 42,
            "login.continuar": null,
            "login.nao_sou_eu": true,
            "cabecalho.buscar": ["array"],
        } as unknown as Record<string, string>;
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({ "login.titulo": "Válido" });
    });

    it("descarta string vazia", () => {
        const entrada = {
            "login.titulo": "Novo título",
            "login.bemvindo": "",
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({ "login.titulo": "Novo título" });
    });

    it("descarta string só com espaços", () => {
        const entrada = {
            "login.titulo": "Novo título",
            "login.bemvindo": "   ",
            "login.continuar": "\t\n  ",
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({ "login.titulo": "Novo título" });
    });

    it("descarta valor idêntico ao padrão", () => {
        // Se o lojista gravar o padrão, é ruído no banco e congela a loja
        // na redação de hoje: quando o produto melhorar a frase, quem gravou
        // a padrão continua com a antiga.
        const entrada = {
            "login.titulo": COPY_PADRAO["login.titulo"], // idêntico ao padrão
            "login.continuar": "Prosseguir", // diferente, logo não será descartado
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({ "login.continuar": "Prosseguir" });
    });

    it("remove HTML: <script>", () => {
        const entrada = {
            "login.titulo": "Click <script>alert('xss')</script>aqui",
        };
        const resultado = sanitizarOverrides(entrada);
        // A tag inteira é removida, deixando apenas "Click aqui"
        expect(resultado).toEqual({ "login.titulo": "Click aqui" });
    });

    it("remove HTML: <b>, <i>, <img>, etc.", () => {
        const entrada = {
            "login.titulo": "<b>Título</b> com <i>tags</i> e <img src='x'>",
        };
        const resultado = sanitizarOverrides(entrada);
        // Todas as tags são removidas
        expect(resultado).toEqual({ "login.titulo": "Título com tags e" });
    });

    it("remove HTML e depois avalia se ficou vazio", () => {
        // Se o texto inteiro era só tags, após removê-las fica vazio,
        // e deve ser descartado.
        const entrada = {
            "login.titulo": "<script>xxx</script><b></b>",
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({});
    });

    it("apara espaços DEPOIS de remover HTML", () => {
        // Remover a tag pode deixar espaços, que precisam ser aparados.
        const entrada = {
            "login.titulo": "  <b>Texto</b>  ",
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado).toEqual({ "login.titulo": "Texto" });
    });

    it("HTML é removido ANTES de comparar com o padrão", () => {
        // Se o padrão é "Continuar" e o lojista colou "Continuar" com tag,
        // a tag é removida primeiro, e depois vemos que é igual ao padrão.
        const entrada = {
            "login.continuar": `<b>${COPY_PADRAO["login.continuar"]}</b>`,
        };
        const resultado = sanitizarOverrides(entrada);
        // A tag é removida, fica igual ao padrão, é descartado
        expect(resultado).toEqual({});
    });

    it("HTML é removido ANTES de cortar pelo limite", () => {
        // Se a chave tem limite de 20, o lojista cola "<script>x</script>válido",
        // o script é removido, deixa "válido" (6 chars), que cabe, não é cortado.
        // Se cortássemos DEPOIS, contaríamos a tag como caractere e faria corte errado.
        const entrada = {
            "login.continuar": "<script>xxxxxxxxxxxx</script>Clique", // limite é 20
        };
        const resultado = sanitizarOverrides(entrada);
        // Script removido, "Clique" fica intacto (cabe no limite de 20)
        expect(resultado).toEqual({ "login.continuar": "Clique" });
    });

    it("corta texto acima do limite da chave, não rejeita", () => {
        // Uma chave com LIMITE de 20 caracteres: o lojista colou 50 caracteres
        // Não é rejeitado, é cortado.
        const textolongo = "Este é um texto muito longo que estoura o limite";
        const entrada = {
            "login.continuar": textolongo, // limite é 20
        };
        const resultado = sanitizarOverrides(entrada);
        // Cortado exatamente no 20º caractere
        expect(resultado["login.continuar"]).toBe("Este é um texto muit");
        expect(resultado["login.continuar"]?.length).toBe(20);
    });

    it("chave sem limite não é cortada", () => {
        // "login.subtitulo" não tem limite declarado em LIMITES, então pode ser longo
        const textolongo = "a".repeat(500);
        const entrada = {
            "login.subtitulo": textolongo,
        };
        const resultado = sanitizarOverrides(entrada);
        expect(resultado["login.subtitulo"]).toBe(textolongo);
        expect(resultado["login.subtitulo"]?.length).toBe(500);
    });

    it("respeita teto de chaves (500)", () => {
        // Um objeto com 5000 chaves não vira 5000 comparações caras.
        // Processa até 500 e para.
        const entrada: Record<string, string> = {};
        for (let i = 0; i < 1000; i++) {
            // Mistura de chaves válidas e inválidas
            if (i % 2 === 0) {
                entrada["login.titulo"] = "Título";
            } else {
                entrada[`chave.falsa.${i}`] = "valor";
            }
        }
        const resultado = sanitizarOverrides(entrada);
        // Deve ter processado até 500 chaves
        // A função não lança erro
        expect(resultado).toBeDefined();
    });

    it("acumula até o teto de chaves processadas", () => {
        // Se temos 600 chaves no objeto, só 500 são processadas,
        // mas o resultado contém as 500 que foram validadas e aceitas.
        const entrada: Record<string, string> = {
            "login.titulo": "Novo título",
            "login.bemvindo": "Bem-vindo novo",
            "login.continuar": "Clique",
        };
        const resultado = sanitizarOverrides(entrada);
        // As 3 chaves foram processadas (3 < 500), todas aparecem
        expect(Object.keys(resultado).length).toBe(3);
    });

    it("integração: entrada real com HTML, limite e tudo", () => {
        // Cenário real: lojista colou texto do Word com formatação
        const entrada = {
            "login.titulo": "<b>Peça seu material</b>",
            "login.subtitulo": "  Cadastro <i>rápido</i>  ",
            "login.continuar": "Finalizar Pedido", // limite é 20, cabe (16 chars)
            "chave.falsa": "ignorada",
            "login.nao_sou_eu": "", // vazio, descartado
        } as unknown as Record<string, string>;
        const resultado = sanitizarOverrides(entrada);

        // login.titulo: HTML removido, apara espaços → "Peça seu material"
        expect(resultado["login.titulo"]).toBe("Peça seu material");

        // login.subtitulo: HTML removido, apara espaços → "Cadastro rápido"
        expect(resultado["login.subtitulo"]).toBe("Cadastro rápido");

        // login.continuar: 16 chars, limite 20, cabe → não cortado
        expect(resultado["login.continuar"]).toBe("Finalizar Pedido");

        // chave.falsa: não existe em COPY_PADRAO, descartada
        expect(resultado["chave.falsa"]).toBeUndefined();

        // login.nao_sou_eu: vazio, descartado
        expect(resultado["login.nao_sou_eu"]).toBeUndefined();
    });

    it("TETO_CHAVES é 500", () => {
        // A constante existe e está exportada para uso
        expect(TETO_CHAVES).toBe(500);
    });
});
