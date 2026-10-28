import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type App } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createIngestionService } from "../../src/container.js";
import { migrate } from "../../src/db/migrate.js";
import { createPool, type Db } from "../../src/db/pool.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { InlineIngestionQueue } from "../../src/modules/ingestion/queue.js";
import { LocalFileStorage } from "../../src/modules/manuals/storage.js";
import { FakeEmbeddingProvider, FakeLlmProvider } from "../../src/providers/fake.js";
import { markdownToPdf } from "../../scripts/markdown-to-pdf.js";

/** Banco dedicado aos testes. Sem ele, a suíte de integração é pulada. */
export const TEST_POSTGRES_URL = process.env.TEST_POSTGRES_URL;

export interface TestContext {
  app: App;
  db: Db;
  adminToken: string;
  close(): Promise<void>;
}

/** Sobe a API com Postgres real, fila inline (ingestão síncrona) e provedores offline. */
export async function createTestContext(): Promise<TestContext> {
  const db = createPool(TEST_POSTGRES_URL!);
  await db.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await migrate(db);

  const storageDir = await mkdtemp(join(tmpdir(), "torquespec-test-"));
  const env = loadEnv({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-with-at-least-32-characters!",
    POSTGRES_URL: TEST_POSTGRES_URL,
    STORAGE_DIR: storageDir,
    MAX_UPLOAD_MB: "1",
    SWAGGER_ENABLED: "true",
  });
  const storage = new LocalFileStorage(storageDir);
  const embeddings = new FakeEmbeddingProvider();
  const ingestion = createIngestionService({ env, db, storage, embeddings }, silentLogger);
  const queue = new InlineIngestionQueue((manualId) => ingestion.process(manualId));

  const app = await buildApp({ env, db, storage, queue, llm: new FakeLlmProvider(), embeddings });
  await new AuthService(db).ensureAdmin({ name: "Admin", email: "admin@torquespec.dev", password: "admin-password" });
  const adminToken = await login(app, "admin@torquespec.dev", "admin-password");

  return {
    app,
    db,
    adminToken,
    async close() {
      await app.close();
      await db.end();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

export async function login(app: App, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  if (response.statusCode !== 200) throw new Error(`login falhou: ${response.body}`);
  return response.json().accessToken;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function sampleManualPdf(): Promise<Uint8Array> {
  const markdown = await readFile(new URL("../../../../docs/manuals/yamaha-xtz250-lander.md", import.meta.url), "utf8");
  return markdownToPdf(markdown);
}

/** Corpo multipart/form-data montado à mão (o `inject` do Fastify recebe Buffer). */
export function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Uint8Array }) {
  const boundary = `----torquespec${Date.now()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      Buffer.from(file.data),
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const noop = () => {};
const silentLogger = {
  level: "silent",
  fatal: noop,
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,
  silent: noop,
  child: () => silentLogger,
} as unknown as Parameters<typeof createIngestionService>[1];
