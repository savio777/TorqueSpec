import type { CreateMotorcycleInput, Motorcycle, UpdateMotorcycleInput } from "@torquespec/shared-types";
import { isUniqueViolation } from "../../db/errors.js";
import type { Queryable } from "../../db/pool.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";

interface MotorcycleRow {
  id: string;
  brand: string;
  model: string;
  year: number;
  manual_count: number;
  created_at: Date;
}

const SELECT = `
  SELECT m.*, (SELECT count(*) FROM manuals WHERE motorcycle_id = m.id) AS manual_count
    FROM motorcycles m`;

const toMotorcycle = (row: MotorcycleRow): Motorcycle => ({
  id: row.id,
  brand: row.brand,
  model: row.model,
  year: row.year,
  manualCount: row.manual_count,
  createdAt: row.created_at.toISOString(),
});

const DUPLICATE = "Já existe uma moto com essa marca, modelo e ano";

export class MotorcyclesService {
  constructor(private readonly db: Queryable) {}

  async list(): Promise<Motorcycle[]> {
    const { rows } = await this.db.query<MotorcycleRow>(`${SELECT} ORDER BY m.brand, m.model, m.year DESC`);
    return rows.map(toMotorcycle);
  }

  async get(id: string): Promise<Motorcycle> {
    const { rows } = await this.db.query<MotorcycleRow>(`${SELECT} WHERE m.id = $1`, [id]);
    if (!rows[0]) throw notFound("Moto");
    return toMotorcycle(rows[0]);
  }

  async create(input: CreateMotorcycleInput): Promise<Motorcycle> {
    try {
      const { rows } = await this.db.query<{ id: string }>(
        "INSERT INTO motorcycles (brand, model, year) VALUES ($1, $2, $3) RETURNING id",
        [input.brand, input.model, input.year],
      );
      return this.get(rows[0]!.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(DUPLICATE);
      throw error;
    }
  }

  async update(id: string, input: UpdateMotorcycleInput): Promise<Motorcycle> {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw badRequest("Informe ao menos um campo para atualizar");
    try {
      const { rowCount } = await this.db.query(
        `UPDATE motorcycles SET ${entries.map(([column], i) => `${column} = $${i + 2}`).join(", ")} WHERE id = $1`,
        [id, ...entries.map(([, value]) => value)],
      );
      if (!rowCount) throw notFound("Moto");
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(DUPLICATE);
      throw error;
    }
  }

  /** Remove a moto; os manuais e fragmentos vão junto (ON DELETE CASCADE). Devolve os arquivos a apagar. */
  async remove(id: string): Promise<string[]> {
    const { rows } = await this.db.query<{ storage_key: string }>(
      "SELECT storage_key FROM manuals WHERE motorcycle_id = $1",
      [id],
    );
    const { rowCount } = await this.db.query("DELETE FROM motorcycles WHERE id = $1", [id]);
    if (!rowCount) throw notFound("Moto");
    return rows.map((row) => row.storage_key);
  }
}
