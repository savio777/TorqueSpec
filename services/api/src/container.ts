import type { FastifyBaseLogger } from "fastify";
import type { AppDeps } from "./app.js";
import type { Env } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { IngestionService } from "./modules/ingestion/ingestion.service.js";
import { BullMqIngestionQueue, redisConnection } from "./modules/ingestion/queue.js";
import { LocalFileStorage } from "./modules/manuals/storage.js";
import { createEmbeddingProvider, createLlmProvider } from "./providers/index.js";

export function createDeps(env: Env): AppDeps {
  return {
    env,
    db: createPool(env.POSTGRES_URL),
    storage: new LocalFileStorage(env.STORAGE_DIR),
    queue: new BullMqIngestionQueue(redisConnection(env.REDIS_URL)),
    llm: createLlmProvider(env),
    embeddings: createEmbeddingProvider(env),
  };
}

export function createIngestionService(deps: Pick<AppDeps, "env" | "db" | "storage" | "embeddings">, log: FastifyBaseLogger) {
  return new IngestionService(
    deps.db,
    deps.storage,
    deps.embeddings,
    { chunkSize: deps.env.CHUNK_SIZE, overlap: deps.env.CHUNK_OVERLAP },
    log,
  );
}

export function loggerOptions(env: Env) {
  return {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { singleLine: true } } } : {}),
  };
}
