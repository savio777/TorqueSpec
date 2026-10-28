import type { ListChunksQuery, ListManualsQuery, Manual, ManualChunk, ManualStatus } from "@torquespec/shared-types";
import type { Queryable } from "../../db/pool.js";
import { conflict, notFound } from "../../lib/errors.js";
import type { IngestionQueue } from "../ingestion/queue.js";
import type { FileStorage } from "./storage.js";

interface ManualRow {
  id: string;
  motorcycle_id: string;
  brand: string;
  model: string;
  year: number;
  title: string;
  original_filename: string;
  storage_key: string;
  file_size_bytes: number;
  page_count: number | null;
  chunk_count: number;
  status: ManualStatus;
  progress: number;
  error: string | null;
  created_at: Date;
  indexed_at: Date | null;
}

const SELECT = `
  SELECT ma.*, mo.brand, mo.model, mo.year
    FROM manuals ma
    JOIN motorcycles mo ON mo.id = ma.motorcycle_id`;

const toManual = (row: ManualRow): Manual => ({
  id: row.id,
  motorcycleId: row.motorcycle_id,
  motorcycle: { brand: row.brand, model: row.model, year: row.year },
  title: row.title,
  originalFilename: row.original_filename,
  fileSizeBytes: row.file_size_bytes,
  pageCount: row.page_count,
  chunkCount: row.chunk_count,
  status: row.status,
  progress: row.progress,
  error: row.error,
  createdAt: row.created_at.toISOString(),
  indexedAt: row.indexed_at?.toISOString() ?? null,
});

export interface CreateManualData {
  motorcycleId: string;
  title: string;
  originalFilename: string;
  storageKey: string;
  fileSizeBytes: number;
  uploadedBy: string;
}

export class ManualsService {
  constructor(
    private readonly db: Queryable,
    private readonly storage: FileStorage,
    private readonly queue: IngestionQueue,
  ) {}

  async list({ page, pageSize, motorcycleId, status }: ListManualsQuery) {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (motorcycleId) filters.push(`ma.motorcycle_id = $${values.push(motorcycleId)}`);
    if (status) filters.push(`ma.status = $${values.push(status)}`);
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const [{ rows }, count] = await Promise.all([
      this.db.query<ManualRow>(
        `${SELECT} ${where} ORDER BY ma.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ total: number }>(`SELECT count(*) AS total FROM manuals ma ${where}`, values),
    ]);
    return { items: rows.map(toManual), page, pageSize, total: count.rows[0]!.total };
  }

  async get(id: string): Promise<Manual> {
    return toManual(await this.getRow(id));
  }

  async motorcycleExists(id: string): Promise<boolean> {
    const { rowCount } = await this.db.query("SELECT 1 FROM motorcycles WHERE id = $1", [id]);
    return Boolean(rowCount);
  }

  /** Registra o manual como `pending` e agenda a ingestão em segundo plano. */
  async create(data: CreateManualData): Promise<Manual> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO manuals (motorcycle_id, title, original_filename, storage_key, file_size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [data.motorcycleId, data.title, data.originalFilename, data.storageKey, data.fileSizeBytes, data.uploadedBy],
    );
    const id = rows[0]!.id;
    await this.queue.enqueue(id);
    return this.get(id);
  }

  async reindex(id: string): Promise<Manual> {
    const { rowCount } = await this.db.query(
      `UPDATE manuals SET status = 'pending', progress = 0, error = NULL, updated_at = now()
        WHERE id = $1 AND status <> 'processing'`,
      [id],
    );
    if (!rowCount) {
      await this.getRow(id); // 404 se não existir
      throw conflict("O manual já está sendo processado");
    }
    await this.queue.enqueue(id);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const { rows } = await this.db.query<{ storage_key: string }>(
      "DELETE FROM manuals WHERE id = $1 RETURNING storage_key",
      [id],
    );
    if (!rows[0]) throw notFound("Manual");
    await this.storage.remove(rows[0].storage_key);
  }

  async listChunks(manualId: string, { page, pageSize, pageNumber }: ListChunksQuery) {
    await this.getRow(manualId);
    const values: unknown[] = [manualId];
    const pageFilter = pageNumber ? `AND page_number = $${values.push(pageNumber)}` : "";
    const [{ rows }, count] = await Promise.all([
      this.db.query<ManualChunk>(
        `SELECT id, page_number AS "pageNumber", chunk_index AS "chunkIndex", content, token_estimate AS "tokenEstimate"
           FROM manual_chunks WHERE manual_id = $1 ${pageFilter}
          ORDER BY chunk_index LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ total: number }>(
        `SELECT count(*) AS total FROM manual_chunks WHERE manual_id = $1 ${pageFilter}`,
        values,
      ),
    ]);
    return { items: rows, page, pageSize, total: count.rows[0]!.total };
  }

  private async getRow(id: string): Promise<ManualRow> {
    const { rows } = await this.db.query<ManualRow>(`${SELECT} WHERE ma.id = $1`, [id]);
    if (!rows[0]) throw notFound("Manual");
    return rows[0];
  }
}
