import { describe, it, expect } from "vitest";
import { resolveBrandMark, showsPoweredBy, type Brand } from "@/lib/brand";

const marca = (over: Partial<Brand> = {}): Brand => ({
    logoUrl: null, storeName: null, whiteLabel: false, ...over,
});

describe("resolveBrandMark", () => {
    it("usa a imagem quando existe logo", () => {
        expect(resolveBrandMark(marca({ logoUrl: "https://x/l.png", storeName: "Izomar" })))
            .toEqual({ kind: "image", url: "https://x/l.png", alt: "Izomar" });
    });

    it("cai no nome da loja quando nao ha logo", () => {
        expect(resolveBrandMark(marca({ storeName: "Depósito Izomar" })))
            .toEqual({ kind: "text", text: "Depósito Izomar" });
    });

    it("apara espacos do nome antes de decidir", () => {
        // O banco tem "Depósito Izomar " com espaço no fim.
        expect(resolveBrandMark(marca({ storeName: "Depósito Izomar " })))
            .toEqual({ kind: "text", text: "Depósito Izomar" });
    });

    it("nome so de espacos nao conta como nome", () => {
        expect(resolveBrandMark(marca({ storeName: "   " }))).toEqual({ kind: "pedidoai" });
    });

    it("logo vazia nao conta como logo", () => {
        expect(resolveBrandMark(marca({ logoUrl: "", storeName: "Izomar" })))
            .toEqual({ kind: "text", text: "Izomar" });
    });

    it("sem logo e sem nome, cai no PedidoAI", () => {
        expect(resolveBrandMark(marca())).toEqual({ kind: "pedidoai" });
    });

    it("marca nula cai no PedidoAI", () => {
        expect(resolveBrandMark(null)).toEqual({ kind: "pedidoai" });
    });
});

describe("showsPoweredBy", () => {
    it("mostra o credito por padrao", () => {
        expect(showsPoweredBy(marca({ storeName: "Izomar" }))).toBe(true);
    });

    it("esconde quando white-label esta ligado", () => {
        expect(showsPoweredBy(marca({ storeName: "Izomar", whiteLabel: true }))).toBe(false);
    });

    it("marca nula mostra o credito — na duvida, o credito aparece", () => {
        expect(showsPoweredBy(null)).toBe(true);
    });
});
