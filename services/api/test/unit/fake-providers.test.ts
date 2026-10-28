import { describe, expect, it } from "vitest";
import { buildUserPrompt, NOT_FOUND_ANSWER, SYSTEM_PROMPT } from "../../src/modules/rag/prompt.js";
import { FakeEmbeddingProvider, FakeLlmProvider } from "../../src/providers/fake.js";

const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

describe("FakeEmbeddingProvider", () => {
  const provider = new FakeEmbeddingProvider();

  it("gera vetores normalizados com 768 dimensões", async () => {
    const [vector] = await provider.embedDocuments(["Porca do eixo da roda traseira"]);
    expect(vector).toHaveLength(768);
    expect(Math.hypot(...vector!)).toBeCloseTo(1);
  });

  it("aproxima textos com termos em comum (ignorando acento e flexão)", async () => {
    const query = await provider.embedQuery("porca do eixo traseiro");
    const [related, unrelated] = await provider.embedDocuments([
      "Porca do eixo da roda traseira: 4,6 kgf.m",
      "Capacidade de óleo com filtro: 1,45 L",
    ]);
    expect(cosine(query, related!)).toBeGreaterThan(cosine(query, unrelated!));
  });

  it("nunca devolve vetor nulo", async () => {
    expect(Math.hypot(...(await provider.embedQuery("?!")))).toBeCloseTo(1);
  });
});

describe("FakeLlmProvider", () => {
  const llm = new FakeLlmProvider();
  const prompt = buildUserPrompt("Qual o torque da porca do eixo traseiro?", [
    { page: 3, content: "Parafuso de dreno de óleo: 2,0 kgf.m (20 N.m)\nPorca do eixo da roda traseira: 4,6 kgf.m (46 N.m)" },
    { page: 4, content: "Pressão dos pneus: 22 psi" },
  ]);

  it("responde com a linha mais relevante citando a página", async () => {
    const result = await llm.generate({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] });
    expect(result.text).toBe("De acordo com a pág. 3 do manual: Porca do eixo da roda traseira: 4,6 kgf.m (46 N.m).");
    expect(result.usage.promptTokens).toBeGreaterThan(0);
  });

  it("considera números na pergunta", async () => {
    const pressures = buildUserPrompt("Pressão do pneu traseiro com 2 pessoas?", [
      { page: 3, content: "1 Pessoa: Traseiro 22 psi (150 kPa)\n2 Pessoas: Traseiro 29 psi (200 kPa)" },
    ]);
    const result = await llm.generate({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: pressures }] });
    expect(result.text).toContain("29 psi");
  });

  it("admite quando nada no contexto é relevante", async () => {
    const offTopic = buildUserPrompt("Como trocar a lâmpada do farol?", [{ page: 1, content: "Torque: 20 N.m" }]);
    const result = await llm.generate({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: offTopic }] });
    expect(result.text).toBe(NOT_FOUND_ANSWER);
  });
});
