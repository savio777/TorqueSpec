import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPool, withTransaction, type Db } from "./pool.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));
// Chave arbitrária para pg_advisory_lock: impede que API e worker migrem ao mesmo tempo.
const LOCK_KEY = 7_412_025;

/** Aplica, em ordem, os arquivos `NNN_nome.sql` ainda não registrados em `schema_migrations`. */
export async function migrate(db: Db, log: (message: string) => void = () => {}): Promise<string[]> {
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.name));

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
    const pending = files.filter((file) => !applied.has(file));

    for (const file of pending) {
      const sql = await readFile(`${MIGRATIONS_DIR}${file}`, "utf8");
      await withTransaction(db, async (tx) => {
        await tx.query(sql);
        await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      });
      log(`migration aplicada: ${file}`);
    }
    return pending;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

// Execução direta: `pnpm migrate`
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const db = createPool(process.env.POSTGRES_URL ?? "postgres://torque:torque@localhost:5432/torquespec");
  migrate(db, console.log)
    .then((applied) => console.log(applied.length ? "migrations concluídas" : "banco já está atualizado"))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}
