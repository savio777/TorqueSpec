import { postJson } from "./http.js";
import type { GenerateInput, GenerateResult, LlmProvider } from "./types.js";

interface ChatCompletionResponse {
  model?: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Conector genérico para qualquer API no formato `/chat/completions`
 * (OpenAI, Groq, OpenRouter, Ollama, vLLM...). É o que permite trocar de LLM
 * apenas com variáveis de ambiente.
 */
export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly name = "openai";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly temperature: number,
  ) {}

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const response = await postJson<ChatCompletionResponse>(
      this.name,
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model: this.model,
        temperature: this.temperature,
        messages: [{ role: "system", content: input.system }, ...input.messages],
      },
      { authorization: `Bearer ${this.apiKey}` },
    );
    return {
      text: (response.choices[0]?.message.content ?? "").trim(),
      model: response.model ?? this.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
