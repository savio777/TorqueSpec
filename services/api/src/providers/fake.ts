/**
 * Provedores offline e determinísticos. Permitem rodar a API, o seed e os
 * testes sem chave de LLM — úteis também para demonstrar o pipeline completo.
 */
import { estimateTokens, roughStem, tokenize } from "../lib/text.js";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider, type GenerateInput, type GenerateResult, type LlmProvider } from "./types.js";
import { NOT_FOUND_ANSWER, parseContextBlocks } from "../modules/rag/prompt.js";

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Embeddings por feature hashing dos radicais: similaridade puramente lexical, mas estável. */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = "fake";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embed(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  private embed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const hash = fnv1a(roughStem(token));
      vector[hash % this.dimensions]! += hash & 0x8000_0000 ? -1 : 1;
    }
    const norm = Math.hypot(...vector);
    // Vetor nulo deixaria a distância de cosseno indefinida (NaN) no pgvector.
    if (norm === 0) {
      vector[0] = 1;
      return vector;
    }
    return vector.map((value) => value / norm);
  }
}

/**
 * "LLM" extrativa: escolhe, nos trechos recebidos, a linha com maior
 * sobreposição de termos com a pergunta e a devolve citando a página.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly name = "fake";

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const prompt = input.messages.at(-1)?.content ?? "";
    const question = prompt.split(/^Pergunta:\s*/m).at(-1) ?? "";
    const questionStems = new Set(tokenize(question).map(roughStem));

    let best: { page: number; line: string; score: number } | undefined;
    for (const block of parseContextBlocks(prompt)) {
      for (const rawLine of block.content.split("\n")) {
        const line = rawLine.replace(/^[\s>*#-]+/, "").replace(/\*\*/g, "").trim();
        if (!line) continue;
        const score = new Set(tokenize(line).map(roughStem).filter((stem) => questionStems.has(stem))).size;
        if (score > (best?.score ?? 0)) best = { page: block.page, line, score };
      }
    }

    const text = best
      ? `De acordo com a pág. ${best.page} do manual: ${best.line.replace(/[.;:]$/, "")}.`
      : NOT_FOUND_ANSWER;
    return {
      text,
      model: "fake-extractive",
      usage: { promptTokens: estimateTokens(input.system + prompt), completionTokens: estimateTokens(text) },
    };
  }
}
