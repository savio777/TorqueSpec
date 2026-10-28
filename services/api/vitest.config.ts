import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Testes usam o código-fonte dos contratos, sem exigir build prévio.
      "@torquespec/shared-types": fileURLToPath(new URL("../../packages/shared-types/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Os testes de integração compartilham um banco; rodar arquivos em série evita interferência.
    fileParallelism: false,
  },
});
