import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const base = { JWT_SECRET: "x".repeat(32) };

describe("loadEnv", () => {
  it("aplica padrões seguros para desenvolvimento", () => {
    const env = loadEnv(base);
    expect(env.LLM_PROVIDER).toBe("fake");
    expect(env.EMBEDDING_PROVIDER).toBe("fake");
    expect(env.MAX_UPLOAD_MB).toBe(100);
  });

  it("trata variáveis vazias como ausentes", () => {
    expect(loadEnv({ ...base, LLM_API_KEY: "", PORT: "" }).PORT).toBe(3333);
  });

  it("exige chave quando o provedor é remoto", () => {
    expect(() => loadEnv({ ...base, LLM_PROVIDER: "gemini" })).toThrow(/LLM_API_KEY/);
    expect(() => loadEnv({ ...base, LLM_PROVIDER: "openai", LLM_API_KEY: "k" })).toThrow(/LLM_BASE_URL/);
  });

  it("interpreta TRUST_PROXY (desligado por padrão, para o rate limit não confiar em X-Forwarded-For)", () => {
    expect(loadEnv(base).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...base, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...base, TRUST_PROXY: "10.0.0.0/8, 127.0.0.1" }).TRUST_PROXY).toEqual(["10.0.0.0/8", "127.0.0.1"]);
  });

  it("rejeita segredo JWT curto e overlap maior que o fragmento", () => {
    expect(() => loadEnv({ JWT_SECRET: "curto" })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, CHUNK_SIZE: "500", CHUNK_OVERLAP: "500" })).toThrow(/CHUNK_OVERLAP/);
  });
});
