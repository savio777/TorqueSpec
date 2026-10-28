import type { Env } from "../config/env.js";
import { FakeEmbeddingProvider, FakeLlmProvider } from "./fake.js";
import { GeminiEmbeddingProvider, GeminiLlmProvider } from "./gemini.js";
import { OllamaEmbeddingProvider } from "./ollama.js";
import { OpenAiCompatibleLlmProvider } from "./openai-compatible.js";
import type { EmbeddingProvider, LlmProvider } from "./types.js";

export function createLlmProvider(env: Env): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case "gemini":
      return new GeminiLlmProvider(env.LLM_API_KEY!, env.LLM_MODEL, env.LLM_TEMPERATURE);
    case "openai":
      return new OpenAiCompatibleLlmProvider(env.LLM_BASE_URL!, env.LLM_API_KEY!, env.LLM_MODEL, env.LLM_TEMPERATURE);
    case "fake":
      return new FakeLlmProvider();
  }
}

export function createEmbeddingProvider(env: Env): EmbeddingProvider {
  switch (env.EMBEDDING_PROVIDER) {
    case "ollama":
      return new OllamaEmbeddingProvider(env.OLLAMA_URL, env.EMBEDDING_MODEL);
    case "gemini":
      return new GeminiEmbeddingProvider((env.EMBEDDING_API_KEY ?? env.LLM_API_KEY)!, env.EMBEDDING_MODEL);
    case "fake":
      return new FakeEmbeddingProvider();
  }
}

export type { EmbeddingProvider, LlmProvider } from "./types.js";
