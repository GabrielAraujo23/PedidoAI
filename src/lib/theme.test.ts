import { describe, it, expect } from "vitest";
import { isTheme, resolveTheme, nextTheme, THEMES } from "@/lib/theme";

describe("isTheme", () => {
    it("aceita os três valores", () => {
        for (const t of THEMES) expect(isTheme(t)).toBe(true);
    });
    it("rejeita o resto", () => {
        for (const v of ["dark-mode", "", null, undefined, 1]) expect(isTheme(v)).toBe(false);
    });
});

describe("resolveTheme", () => {
    it("claro e escuro valem por si, ignorando o sistema", () => {
        expect(resolveTheme("claro", true)).toBe("claro");
        expect(resolveTheme("escuro", false)).toBe("escuro");
    });
    it("sistema segue a preferência do aparelho", () => {
        expect(resolveTheme("sistema", true)).toBe("escuro");
        expect(resolveTheme("sistema", false)).toBe("claro");
    });
    it("preferência ausente cai em sistema", () => {
        expect(resolveTheme(null, true)).toBe("escuro");
        expect(resolveTheme(null, false)).toBe("claro");
    });
    it("valor corrompido no localStorage cai em sistema", () => {
        expect(resolveTheme("banana", true)).toBe("escuro");
    });
});

describe("nextTheme", () => {
    it("alterna entre claro e escuro", () => {
        expect(nextTheme("claro")).toBe("escuro");
        expect(nextTheme("escuro")).toBe("claro");
    });
    it("a partir de sistema, vai para o oposto do que está valendo", () => {
        expect(nextTheme("sistema", true)).toBe("claro");
        expect(nextTheme("sistema", false)).toBe("escuro");
    });
});
