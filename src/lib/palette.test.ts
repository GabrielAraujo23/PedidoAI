import { describe, it, expect } from "vitest";
import {
    FAMILIAS, PALETTE_FAMILIES, ACENTO_PADRAO,
    contraste, isPaletteFamily, avaliarAcento, ajustarParaContraste, tokensDaLoja,
} from "@/lib/palette";

describe("contraste", () => {
    it("preto sobre branco é o máximo de 21:1", () => {
        expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    });
    it("a mesma cor não tem contraste nenhum", () => {
        expect(contraste("#C2410C", "#C2410C")).toBeCloseTo(1, 5);
    });
    it("a ordem não importa", () => {
        expect(contraste("#1C1917", "#F7F2EA")).toBeCloseTo(contraste("#F7F2EA", "#1C1917"), 5);
    });
});

describe("as famílias são legíveis — todas, nos dois temas", () => {
    // Este é o teste que impede alguém (inclusive eu) de acrescentar uma
    // família bonita e ilegível. Ele percorre TUDO em vez de amostrar.
    it("todo par texto/superfície passa de 4.5:1", () => {
        const falhas: string[] = [];
        for (const nome of PALETTE_FAMILIES) {
            for (const tema of ["claro", "escuro"] as const) {
                const v = FAMILIAS[nome][tema];
                for (const sup of ["background", "card", "muted"] as const) {
                    for (const txt of ["foreground", "mutedForeground"] as const) {
                        const r = contraste(v[txt], v[sup]);
                        if (r < 4.5) falhas.push(`${nome}/${tema}: ${txt} sobre ${sup} = ${r.toFixed(2)}`);
                    }
                }
            }
        }
        expect(falhas).toEqual([]);
    });

    it("a borda se distingue do fundo em toda família", () => {
        for (const nome of PALETTE_FAMILIES) {
            for (const tema of ["claro", "escuro"] as const) {
                const v = FAMILIAS[nome][tema];
                expect(contraste(v.border, v.background)).toBeGreaterThanOrEqual(1.35);
            }
        }
    });
});

describe("isPaletteFamily", () => {
    it("aceita as quatro", () => {
        for (const f of PALETTE_FAMILIES) expect(isPaletteFamily(f)).toBe(true);
    });
    it("rejeita o resto", () => {
        for (const v of ["rosa", "", null, undefined, 1]) expect(isPaletteFamily(v)).toBe(false);
    });
});

describe("avaliarAcento", () => {
    it("um amarelo claro reprova no tema claro e passa no escuro", () => {
        const r = avaliarAcento("#FDE047", "creme");
        expect(r.claro.passa).toBe(false);
        expect(r.escuro.passa).toBe(true);
    });

    it("o laranja padrão passa direto no claro", () => {
        expect(avaliarAcento(ACENTO_PADRAO, "creme").claro.adaptado).toBe(false);
    });

    it("o laranja padrão serve nos dois temas como preenchimento", () => {
        // A régua do acento é 3:1 (WCAG 1.4.11, elemento de interface), não os
        // 4.5:1 de texto: ele é fundo de botão, e quem precisa de 4.5:1 é o
        // texto EM CIMA dele. Com 4.5:1 nada funcionaria — para passar sobre
        // creme claro E creme escuro seria preciso luminância <=0.16 e >=0.21
        // ao mesmo tempo, faixas disjuntas.
        for (const tema of ["claro", "escuro"] as const) {
            expect(avaliarAcento(ACENTO_PADRAO, "creme")[tema].adaptado).toBe(false);
        }
    });

    it("um amarelo vibrante é escurecido para o tema claro", () => {
        const r = avaliarAcento("#FDE047", "creme").claro;
        expect(r.adaptado).toBe(true);
        expect(contraste(r.cor, FAMILIAS.creme.claro.background)).toBeGreaterThanOrEqual(3);
    });

    it("devolve a razão medida, não só o veredito", () => {
        const r = avaliarAcento("#FDE047", "creme");
        expect(r.claro.razao).toBeGreaterThan(1);
        expect(r.claro.razao).toBeLessThan(4.5);
    });
});

describe("ajustarParaContraste", () => {
    it("devolve uma cor que de fato passa", () => {
        const ajustada = ajustarParaContraste("#FDE047", "#F7F2EA");
        expect(contraste(ajustada, "#F7F2EA")).toBeGreaterThanOrEqual(4.5);
    });

    it("preserva o matiz — amarelo escurecido continua amarelo", () => {
        // Um ajuste que mexesse no matiz devolveria outra cor, e o lojista
        // diria, com razão, que o sistema trocou a marca dele.
        const ajustada = ajustarParaContraste("#FDE047", "#F7F2EA");
        const matiz = (hex: string) => {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
            const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
            if (d === 0) return 0;
            const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
            return ((h * 60) + 360) % 360;
        };
        expect(Math.abs(matiz(ajustada) - matiz("#FDE047"))).toBeLessThan(6);
    });

    it("não mexe numa cor que já passa", () => {
        expect(ajustarParaContraste("#7C2D12", "#F7F2EA")).toBe("#7C2D12");
    });
});

describe("tokensDaLoja", () => {
    it("devolve as variáveis CSS da família no tema pedido", () => {
        const t = tokensDaLoja("neve", null, "claro");
        expect(t["--background"]).toBe("#F8FAFC");
        expect(t["--foreground"]).toBe("#0F172A");
    });

    it("acento nulo usa o padrão do produto", () => {
        expect(tokensDaLoja("creme", null, "claro")["--primary"]).toBe(ACENTO_PADRAO);
    });

    it("acento que ja e legivel entra sem mudanca", () => {
        expect(tokensDaLoja("creme", "#1D4ED8", "claro")["--primary"]).toBe("#1D4ED8");
    });

    it("um azul escuro é clareado para o tema escuro", () => {
        // #1D4ED8 sobre o fundo escuro fica abaixo de 3:1 — some no preto.
        const escuro = tokensDaLoja("creme", "#1D4ED8", "escuro")["--primary"];
        expect(escuro).not.toBe("#1D4ED8");
        expect(contraste(escuro, FAMILIAS.creme.escuro.background)).toBeGreaterThanOrEqual(3);
    });

    it("todo par acento/texto-do-acento passa de 4.5:1, em qualquer cor", () => {
        // O acento pode ser adaptado; o texto sobre ele NUNCA pode ser
        // ilegível. Esta é a garantia que impede o botão amarelo com texto
        // branco.
        for (const cor of ["#FDE047", "#1D4ED8", "#C2410C", "#000000", "#FFFFFF", "#22C55E"]) {
            for (const tema of ["claro", "escuro"] as const) {
                const t = tokensDaLoja("creme", cor, tema);
                expect(contraste(t["--primary-foreground"], t["--primary"])).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it("o texto sobre o acento acompanha o acento", () => {
        // Sem isto, um lojista que escolhesse amarelo teria botões com texto
        // branco sobre amarelo — ilegível — porque --primary-foreground era
        // branco fixo. O par tem que ser calculado junto.
        expect(tokensDaLoja("creme", "#FDE047", "claro")["--primary-foreground"]).toBe("#17130F");
        expect(tokensDaLoja("creme", "#1D4ED8", "claro")["--primary-foreground"]).toBe("#FFFFFF");
    });

    it("família desconhecida cai em creme em vez de quebrar", () => {
        expect(tokensDaLoja("rosa-choque", null, "claro")["--background"]).toBe(FAMILIAS.creme.claro.background);
    });
});
