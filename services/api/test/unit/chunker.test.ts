import { describe, expect, it } from "vitest";
import { chunkPages, normalizePageText } from "../../src/modules/ingestion/chunker.js";

describe("normalizePageText", () => {
  it("colapsa espaços e linhas em branco excessivas", () => {
    expect(normalizePageText("  Torque:\t 20  N.m \r\n\r\n\r\n\r\nFim  ")).toBe("Torque: 20 N.m\n\nFim");
  });
});

describe("chunkPages", () => {
  const options = { chunkSize: 100, overlap: 30 };

  it("mantém cada fragmento dentro de uma única página e numera globalmente", () => {
    const chunks = chunkPages(["Página um.", "", "Página três."], options);
    expect(chunks).toEqual([
      expect.objectContaining({ pageNumber: 1, chunkIndex: 0, content: "Página um." }),
      expect.objectContaining({ pageNumber: 3, chunkIndex: 1, content: "Página três." }),
    ]);
  });

  it("divide páginas longas respeitando linhas e com sobreposição", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Linha ${i + 1}: porca do eixo ${i}`);
    const chunks = chunkPages([lines.join("\n")], options);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(options.chunkSize);
    // Nenhuma linha é cortada ao meio...
    const allLines = new Set(chunks.flatMap((chunk) => chunk.content.split("\n")));
    for (const line of lines) expect(allLines).toContain(line);
    // ...e a última linha de um fragmento reaparece no início do próximo (overlap).
    const lastOfFirst = chunks[0]!.content.split("\n").at(-1)!;
    expect(chunks[1]!.content.startsWith(lastOfFirst)).toBe(true);
  });

  it("corta linhas maiores que o limite por frase e, em último caso, por tamanho", () => {
    const longSentence = "x".repeat(250);
    const chunks = chunkPages([`Frase curta. ${longSentence}`], options);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(options.chunkSize);
    expect(chunks.map((chunk) => chunk.content).join("")).toContain("Frase curta.");
  });

  it("estima tokens", () => {
    const [chunk] = chunkPages(["12345678"], options);
    expect(chunk!.tokenEstimate).toBe(2);
  });
});
