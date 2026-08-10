import { describe, it, expect } from "vitest";
import {
    canTransition, canUsePanel, canServeCustomers,
    isTenantStatus, isAdminRole, requiresReason,
    TENANT_STATUSES,
} from "@/lib/tenant-status";

describe("isTenantStatus", () => {
    it("aceita os quatro estados", () => {
        for (const s of TENANT_STATUSES) expect(isTenantStatus(s)).toBe(true);
    });
    it("rejeita qualquer outra coisa", () => {
        for (const v of ["ativo", "", null, undefined, 1, {}]) {
            expect(isTenantStatus(v)).toBe(false);
        }
    });
});

describe("isAdminRole", () => {
    it("aceita owner e lojista", () => {
        expect(isAdminRole("owner")).toBe(true);
        expect(isAdminRole("lojista")).toBe(true);
    });
    it("rejeita o resto", () => {
        expect(isAdminRole("admin")).toBe(false);
        expect(isAdminRole(undefined)).toBe(false);
    });
});

describe("canTransition", () => {
    it("permite as transições do ciclo de vida", () => {
        expect(canTransition("pendente", "ativa")).toBe(true);
        expect(canTransition("pendente", "recusada")).toBe(true);
        expect(canTransition("ativa", "suspensa")).toBe(true);
        expect(canTransition("suspensa", "ativa")).toBe(true);
    });

    it("recusada é terminal", () => {
        for (const to of TENANT_STATUSES) {
            expect(canTransition("recusada", to)).toBe(false);
        }
    });

    it("não deixa pular direto de pendente para suspensa", () => {
        expect(canTransition("pendente", "suspensa")).toBe(false);
    });

    it("não deixa voltar de ativa para pendente", () => {
        expect(canTransition("ativa", "pendente")).toBe(false);
    });

    it("não deixa suspensa virar recusada", () => {
        expect(canTransition("suspensa", "recusada")).toBe(false);
    });

    it("transição para o mesmo estado é inválida", () => {
        for (const s of TENANT_STATUSES) expect(canTransition(s, s)).toBe(false);
    });
});

describe("requiresReason", () => {
    it("exige motivo ao recusar e ao suspender", () => {
        expect(requiresReason("recusada")).toBe(true);
        expect(requiresReason("suspensa")).toBe(true);
    });
    it("não exige motivo ao ativar", () => {
        expect(requiresReason("ativa")).toBe(false);
    });
});

describe("portões", () => {
    it("só tenant ativa usa o painel", () => {
        expect(canUsePanel("ativa")).toBe(true);
        for (const s of ["pendente", "suspensa", "recusada"] as const) {
            expect(canUsePanel(s)).toBe(false);
        }
    });

    it("só tenant ativa atende cliente final", () => {
        expect(canServeCustomers("ativa")).toBe(true);
        for (const s of ["pendente", "suspensa", "recusada"] as const) {
            expect(canServeCustomers(s)).toBe(false);
        }
    });
});
