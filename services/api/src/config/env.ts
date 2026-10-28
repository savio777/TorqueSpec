import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(3333),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    CORS_ORIGINS: z.string().default("*"),
    // Proxies confiáveis para X-Forwarded-For (o rate limit usa o IP do cliente):
    // "false" (padrão), IPs/CIDRs dos proxies separados por vírgula (ex.: "10.0.0.0/8,127.0.0.1")
    // ou "true" — só quando a API nunca recebe conexões diretas de clientes.
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform((value) => (value === "true" || value === "false" ? value === "true" : value.split(",").map((entry) => entry.trim()))),

    POSTGRES_URL: z.string().min(1).default("postgres://torque:torque@localhost:5432/torquespec"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

    JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter pelo menos 32 caracteres"),
    JWT_EXPIRES_IN: z.string().default("1d"),

    STORAGE_DIR: z.string().default("./storage"),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(100),

    // Geração de respostas: gemini | openai (qualquer API compatível) | fake (offline, para dev/testes)
    LLM_PROVIDER: z.enum(["gemini", "openai", "fake"]).default("fake"),
    LLM_MODEL: z.string().default("gemini-2.5-flash"),
    LLM_API_KEY: z.string().optional(),
    LLM_BASE_URL: z.url().optional(),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),

    // Embeddings: ollama (nomic-embed-text) | gemini | fake
    EMBEDDING_PROVIDER: z.enum(["ollama", "gemini", "fake"]).default("fake"),
    EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
    EMBEDDING_API_KEY: z.string().optional(),
    OLLAMA_URL: z.url().default("http://localhost:11434"),

    CHUNK_SIZE: z.coerce.number().int().min(200).default(1200),
    CHUNK_OVERLAP: z.coerce.number().int().min(0).default(200),
    RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
    RAG_CANDIDATES: z.coerce.number().int().min(5).max(200).default(30),

    ASK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    SWAGGER_ENABLED: booleanish.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.CHUNK_OVERLAP >= env.CHUNK_SIZE) {
      ctx.addIssue({ code: "custom", path: ["CHUNK_OVERLAP"], message: "deve ser menor que CHUNK_SIZE" });
    }
    if ((env.LLM_PROVIDER === "gemini" || env.LLM_PROVIDER === "openai") && !env.LLM_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["LLM_API_KEY"], message: `obrigatória para LLM_PROVIDER=${env.LLM_PROVIDER}` });
    }
    if (env.LLM_PROVIDER === "openai" && !env.LLM_BASE_URL) {
      ctx.addIssue({ code: "custom", path: ["LLM_BASE_URL"], message: "obrigatória para LLM_PROVIDER=openai" });
    }
    if (env.EMBEDDING_PROVIDER === "gemini" && !(env.EMBEDDING_API_KEY ?? env.LLM_API_KEY)) {
      ctx.addIssue({ code: "custom", path: ["EMBEDDING_API_KEY"], message: "obrigatória para EMBEDDING_PROVIDER=gemini" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Variáveis vazias no .env (ex.: `LLM_API_KEY=`) contam como ausentes.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}
