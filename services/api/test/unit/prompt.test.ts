import { describe, expect, it } from "vitest";
import { buildUserPrompt, extractCitedPages, parseContextBlocks } from "../../src/modules/rag/prompt.js";
import { resolveCitations } from "../../src/modules/rag/rag.service.js";
import type { RetrievedChunk } from "../../src/modules/rag/retriever.js";

describe("prompt", () => {
  it("monta e interpreta os blocos de contexto", () => {
    const blocks = [
      { page: 3, content: "Porca do eixo: 46 N.m" },
      { page: 12, content: "Linha 1\nLinha 2" },
    ];
    const prompt = buildUserPrompt("Qual o torque?", blocks);
    expect(prompt).toContain("[Trecho 2 | pág. 12]");
    expect(prompt.endsWith("Pergunta: Qual o torque?")).toBe(true);
    expect(parseContextBlocks(prompt)).toEqual(blocks);
  });

  it("extrai páginas citadas em formatos variados, sem repetir", () => {
    expect(extractCitedPages("Veja a pág. 142 e a página 7; também pag 142 e Pág.3")).toEqual([142, 7, 3]);
    expect(extractCitedPages("Não encontrei essa informação no manual.")).toEqual([]);
  });
});

describe("resolveCitations", () => {
  const chunk = (id: number, pageNumber: number, score: number, content = `conteúdo ${id}`): RetrievedChunk => ({
    id,
    pageNumber,
    content,
    score,
    vectorRank: 1,
    textRank: 1,
  });

  it("usa o melhor fragmento da página citada", () => {
    const citations = resolveCitations("Conforme a pág. 5...", [chunk(1, 5, 0.01), chunk(2, 5, 0.03), chunk(3, 6, 0.05)]);
    expect(citations).toEqual([{ page: 5, chunkId: 2, excerpt: "conteúdo 2", score: 0.03 }]);
  });

  it("descarta páginas citadas que não vieram da busca (alucinação)", () => {
    expect(resolveCitations("Segundo a pág. 99, o torque é 10 N.m", [chunk(1, 5, 0.1)])).toEqual([]);
  });

  it("encurta trechos longos", () => {
    const [citation] = resolveCitations("pág. 1", [chunk(1, 1, 0.1, "a".repeat(500))]);
    expect(citation!.excerpt.length).toBe(281);
    expect(citation!.excerpt.endsWith("…")).toBe(true);
  });
});
