import pino from "pino";
import { loadEnv } from "./config/env.js";
import { createIngestionService, loggerOptions } from "./container.js";
import { createPool } from "./db/pool.js";
import { createIngestionWorker, redisConnection } from "./modules/ingestion/queue.js";
import { LocalFileStorage } from "./modules/manuals/storage.js";
import { createEmbeddingProvider } from "./providers/index.js";

/** Processo separado da API: consome a fila `manual-ingestion` (BullMQ/Redis). */
const env = loadEnv();
const log = pino({ ...loggerOptions(env), name: "worker" });
const db = createPool(env.POSTGRES_URL);
const ingestion = createIngestionService(
  { env, db, storage: new LocalFileStorage(env.STORAGE_DIR), embeddings: createEmbeddingProvider(env) },
  log,
);

const worker = createIngestionWorker(redisConnection(env.REDIS_URL), (manualId) => ingestion.process(manualId));
worker.on("ready", () => log.info("worker de ingestão pronto"));
worker.on("failed", (job, error) =>
  log.warn({ manualId: job?.data.manualId, attempt: job?.attemptsMade, err: error }, "job de ingestão falhou"),
);

const shutdown = async () => {
  await worker.close();
  await db.end();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
