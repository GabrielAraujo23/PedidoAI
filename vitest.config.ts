import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Só lógica pura roda aqui: ambiente "node", sem jsdom.
 * Componente e rota não são cobertos por teste automatizado — ver a seção
 * "Verificação" da spec.
 */
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
