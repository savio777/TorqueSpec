/**
 * Popula o ambiente local: cria o admin, a moto de exemplo e indexa o manual
 * `docs/manuals/yamaha-xtz250-lander.md` (convertido em PDF) — sem precisar do worker.
 *
 *   pnpm --filter @torquespec/api seed
 */
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import pino from "pino";
import { loadEnv } from "../src/config/env.js";
import { createIngestionService, loggerOptions } from "../src/container.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { LocalFileStorage } from "../src/modules/manuals/storage.js";
import { createEmbeddingProvider } from "../src/providers/index.js";
import { markdownToPdf } from "./markdown-to-pdf.js";

const MANUAL_TITLE = "Manual de Serviço Yamaha XTZ 250 Lander (ABS) Blueflex";

const env = loadEnv();
const log = pino({ ...loggerOptions(env), name: "seed" });
const db = createPool(env.POSTGRES_URL);
const storage = new LocalFileStorage(env.STORAGE_DIR);

try {
  await migrate(db, (message) => log.info(message));

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@torquespec.dev";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "torquespec-admin";
  await new AuthService(db).ensureAdmin({ name: "Administrador", email: adminEmail, password: adminPassword });
  log.info({ email: adminEmail }, "admin pronto");

  const { rows: motorcycles } = await db.query<{ id: string }>(
    `INSERT INTO motorcycles (brand, model, year) VALUES ('Yamaha', 'XTZ 250 Lander (ABS) Blueflex', 2019)
     ON CONFLICT (brand, model, year) DO UPDATE SET brand = EXCLUDED.brand
     RETURNING id`,
  );
  const motorcycleId = motorcycles[0]!.id;

  const { rows: existing } = await db.query<{ id: string; status: string; storage_key: string }>(
    "SELECT id, status, storage_key FROM manuals WHERE motorcycle_id = $1 AND title = $2",
    [motorcycleId, MANUAL_TITLE],
  );
  if (existing[0]?.status === "indexed") {
    log.info({ manualId: existing[0].id }, "manual de exemplo já indexado");
  } else {
    const markdown = await readFile(new URL("../../../docs/manuals/yamaha-xtz250-lander.md", import.meta.url), "utf8");
    const pdf = await markdownToPdf(markdown, MANUAL_TITLE);
    const { key, size } = await storage.save(Readable.from(Buffer.from(pdf)), "pdf");

    let manualId: string;
    if (existing[0]) {
      manualId = existing[0].id;
      // Seed anterior falhou no meio: reaproveita o registro e troca o arquivo.
      await db.query("UPDATE manuals SET storage_key = $2, file_size_bytes = $3 WHERE id = $1", [manualId, key, size]);
      await storage.remove(existing[0].storage_key);
    } else {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO manuals (motorcycle_id, title, original_filename, storage_key, file_size_bytes)
         VALUES ($1, $2, 'yamaha-xtz250-lander.pdf', $3, $4) RETURNING id`,
        [motorcycleId, MANUAL_TITLE, key, size],
      );
      manualId = rows[0]!.id;
    }

    await createIngestionService({ env, db, storage, embeddings: createEmbeddingProvider(env) }, log).process(manualId);
    log.info({ manualId }, "manual de exemplo indexado");
  }

  log.info(`pronto! login: ${adminEmail} / ${adminPassword}`);
} finally {
  await db.end();
}
