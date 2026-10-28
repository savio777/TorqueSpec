export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  /** Embeddings para trechos do manual (indexação). */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embedding para a pergunta do usuário (consulta). */
  embedQuery(text: string): Promise<number[]>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateInput {
  system: string;
  messages: ChatMessage[];
}

export interface GenerateResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface LlmProvider {
  readonly name: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** Dimensão fixada na coluna `manual_chunks.embedding vector(768)`. */
export const EMBEDDING_DIMENSIONS = 768;
