import pg from "pg";

// BIGINT/COUNT(*) chegam como string por padrão; os volumes do projeto cabem em Number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool, "query">;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function withTransaction<T>(db: Db, fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Serializa um vetor no formato textual aceito pelo pgvector: `[0.1,0.2,...]`. */
export const toVectorLiteral = (vector: readonly number[]) => `[${vector.join(",")}]`;
