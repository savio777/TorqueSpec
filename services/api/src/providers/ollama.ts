import { postJson, ProviderError } from "./http.js";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types.js";

/**
 * Embeddings locais via Ollama. O `nomic-embed-text` foi treinado com
 * prefixos de tarefa, então documentos e perguntas recebem prefixos diferentes.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts.map((text) => `search_document: ${text}`));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([`search_query: ${text}`]);
    return vector!;
  }

  private async embed(input: string[]): Promise<number[][]> {
    const response = await postJson<{ embeddings: number[][] }>(
      this.name,
      `${this.baseUrl.replace(/\/$/, "")}/api/embed`,
      { model: this.model, input },
    );
    if (response.embeddings.length !== input.length) {
      throw new ProviderError(this.name, "quantidade de embeddings diferente da entrada");
    }
    return response.embeddings;
  }
}
