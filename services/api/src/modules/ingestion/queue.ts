import { Queue, Worker, type ConnectionOptions } from "bullmq";

export const INGESTION_QUEUE = "manual-ingestion";

export interface IngestionJob {
  manualId: string;
}

export interface IngestionQueue {
  enqueue(manualId: string): Promise<void>;
  close(): Promise<void>;
}

export function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    // Exigido pelo BullMQ para conexões de Worker (comandos bloqueantes).
    maxRetriesPerRequest: null,
  };
}

export class BullMqIngestionQueue implements IngestionQueue {
  private readonly queue: Queue<IngestionJob>;

  constructor(connection: ConnectionOptions) {
    this.queue = new Queue<IngestionJob>(INGESTION_QUEUE, { connection });
  }

  async enqueue(manualId: string) {
    await this.queue.add(
      "ingest",
      { manualId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  close() {
    return this.queue.close();
  }
}

export function createIngestionWorker(
  connection: ConnectionOptions,
  process: (manualId: string) => Promise<void>,
  concurrency = 2,
) {
  return new Worker<IngestionJob>(INGESTION_QUEUE, (job) => process(job.data.manualId), { connection, concurrency });
}

/** Executa a ingestão na hora, no mesmo processo — usado em testes e no seed. */
export class InlineIngestionQueue implements IngestionQueue {
  constructor(private readonly process: (manualId: string) => Promise<void>) {}

  async enqueue(manualId: string) {
    // Falhas já ficam registradas em `manuals.status/error` pelo IngestionService.
    await this.process(manualId).catch(() => {});
  }

  async close() {}
}
