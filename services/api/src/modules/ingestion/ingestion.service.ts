import type { FastifyBaseLogger } from "fastify";
import { toVectorLiteral, withTransaction, type Db } from "../../db/pool.js";
import type { EmbeddingProvider } from "../../providers/types.js";
import type { FileStorage } from "../manuals/storage.js";
import { chunkPages, type ChunkOptions } from "./chunker.js";
import { extractPdfPages } from "./pdf.js";

const EMBEDDING_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 200;

export class IngestionError extends Error {}

/**
 * Pipeline de indexação de um manual:
 * PDF → texto por página → fragmentos → embeddings → manual_chunks (pgvector + tsvector).
 * O progresso é gravado em `manuals.progress` para o painel acompanhar via polling.
 */
export class IngestionService {
  constructor(
    private readonly db: Db,
    private readonly storage: FileStorage,
    private readonly embeddings: EmbeddingProvider,
    private readonly chunkOptions: ChunkOptions,
    private readonly log: FastifyBaseLogger,
  ) {}

  async process(manualId: string): Promise<void> {
    const { rows } = await this.db.query<{ storage_key: string }>("SELECT storage_key FROM manuals WHERE id = $1", [
      manualId,
    ]);
    const manual = rows[0];
    if (!manual) {
      this.log.warn({ manualId }, "manual removido antes da ingestão; ignorando");
      return;
    }

    const startedAt = Date.now();
    await this.update(manualId, { status: "processing", progress: 0, error: null });
    try {
      const pages = await extractPdfPages(await this.storage.read(manual.storage_key));
      await this.update(manualId, { progress: 10 });

      const chunks = chunkPages(pages, this.chunkOptions);
      if (chunks.length === 0) {
        throw new IngestionError("PDF sem texto extraível (provavelmente escaneado; OCR ainda não é suportado)");
      }

      const vectors: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embedded = await this.embeddings.embedDocuments(batch.map((chunk) => chunk.content));
        for (const vector of embedded) {
          if (vector.length !== this.embeddings.dimensions) {
            throw new IngestionError(
              `embedding com ${vector.length} dimensões; esperado ${this.embeddings.dimensions} (verifique EMBEDDING_MODEL)`,
            );
          }
        }
        vectors.push(...embedded);
        await this.update(manualId, { progress: 10 + Math.floor((85 * vectors.length) / chunks.length) });
      }

      await withTransaction(this.db, async (tx) => {
        await tx.query("DELETE FROM manual_chunks WHERE manual_id = $1", [manualId]);
        for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
          const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
          await tx.query(
            `INSERT INTO manual_chunks (manual_id, page_number, chunk_index, content, token_estimate, embedding)
             SELECT $1, page_number, chunk_index, content, token_estimate, embedding::vector
               FROM unnest($2::int[], $3::int[], $4::text[], $5::int[], $6::text[])
                 AS t(page_number, chunk_index, content, token_estimate, embedding)`,
            [
              manualId,
              batch.map((chunk) => chunk.pageNumber),
              batch.map((chunk) => chunk.chunkIndex),
              batch.map((chunk) => chunk.content),
              batch.map((chunk) => chunk.tokenEstimate),
              batch.map((_, offset) => toVectorLiteral(vectors[i + offset]!)),
            ],
          );
        }
        await tx.query(
          `UPDATE manuals
              SET status = 'indexed', progress = 100, error = NULL, page_count = $2, chunk_count = $3,
                  indexed_at = now(), updated_at = now()
            WHERE id = $1`,
          [manualId, pages.length, chunks.length],
        );
      });

      this.log.info(
        { manualId, pages: pages.length, chunks: chunks.length, ms: Date.now() - startedAt },
        "manual indexado",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.update(manualId, { status: "failed", error: message });
      this.log.error({ manualId, err: error }, "falha na ingestão do manual");
      throw error;
    }
  }

  private async update(
    manualId: string,
    fields: Partial<{ status: string; progress: number; error: string | null }>,
  ): Promise<void> {
    const entries = Object.entries(fields);
    const assignments = entries.map(([column], index) => `${column} = $${index + 2}`);
    await this.db.query(`UPDATE manuals SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1`, [
      manualId,
      ...entries.map(([, value]) => value),
    ]);
  }
}
