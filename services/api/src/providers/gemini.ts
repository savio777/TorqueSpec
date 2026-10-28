import { postJson } from "./http.js";
import {
  EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
  type GenerateInput,
  type GenerateResult,
  type LlmProvider,
} from "./types.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Google AI Studio (Gemini) via REST — sem SDK para manter o conector enxuto. */
export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly temperature: number,
  ) {}

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const response = await postJson<GenerateContentResponse>(
      this.name,
      `${BASE_URL}/models/${this.model}:generateContent`,
      {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: input.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: { temperature: this.temperature },
      },
      { "x-goog-api-key": this.apiKey },
    );
    const text = (response.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();
    return {
      text,
      model: this.model,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, "RETRIEVAL_DOCUMENT");
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], "RETRIEVAL_QUERY");
    return vector!;
  }

  private async embed(texts: string[], taskType: string): Promise<number[][]> {
    const response = await postJson<{ embeddings: { values: number[] }[] }>(
      this.name,
      `${BASE_URL}/models/${this.model}:batchEmbedContents`,
      {
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.dimensions,
        })),
      },
      { "x-goog-api-key": this.apiKey },
    );
    return response.embeddings.map((embedding) => embedding.values);
  }
}
