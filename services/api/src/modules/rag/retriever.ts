import { toVectorLiteral, type Queryable } from "../../db/pool.js";
import { tokenize } from "../../lib/text.js";
import type { EmbeddingProvider } from "../../providers/types.js";
import { reciprocalRankFusion } from "./fusion.js";

export interface RetrievedChunk {
  id: number;
  pageNumber: number;
  content: string;
  score: number;
  vectorRank: number | null;
  textRank: number | null;
}

interface ChunkRow {
  id: number;
  page_number: number;
  content: string;
}

/**
 * Busca híbrida: similaridade de cosseno (pgvector/HNSW) + full-text
 * (tsvector em português sem acentos, ranqueado por ts_rank_cd), fundidas por RRF.
 * A busca lexical garante precisão em termos exatos ("520VD2", "DR8EA-N"),
 * a vetorial cobre paráfrases ("aperto" ↔ "torque").
 */
export class HybridRetriever {
  constructor(
    private readonly db: Queryable,
    private readonly embeddings: EmbeddingProvider,
    private readonly candidates: number,
  ) {}

  async search(manualId: string, question: string, topK: number): Promise<RetrievedChunk[]> {
    const [vectorHits, textHits] = await Promise.all([
      this.vectorSearch(manualId, question),
      this.textSearch(manualId, question),
    ]);
    return reciprocalRankFusion([vectorHits, textHits], (row) => row.id)
      .slice(0, topK)
      .map(({ item, score, ranks }) => ({
        id: item.id,
        pageNumber: item.page_number,
        content: item.content,
        score,
        vectorRank: ranks[0] ?? null,
        textRank: ranks[1] ?? null,
      }));
  }

  private async vectorSearch(manualId: string, question: string): Promise<ChunkRow[]> {
    const embedding = await this.embeddings.embedQuery(question);
    const { rows } = await this.db.query<ChunkRow>(
      `SELECT id, page_number, content
         FROM manual_chunks
        WHERE manual_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT $3`,
      [manualId, toVectorLiteral(embedding), this.candidates],
    );
    return rows;
  }

  private async textSearch(manualId: string, question: string): Promise<ChunkRow[]> {
    // OR entre os termos: perguntas em linguagem natural raramente têm todos os termos no mesmo trecho;
    // ts_rank_cd favorece os trechos que casam mais termos e mais próximos.
    // `tokenize` só devolve letras/dígitos, então a expressão não carrega operadores do usuário.
    const terms = [...new Set(tokenize(question))];
    if (terms.length === 0) return [];
    const { rows } = await this.db.query<ChunkRow>(
      `SELECT id, page_number, content
         FROM manual_chunks, to_tsquery('pt_unaccent', $2) AS query
        WHERE manual_id = $1 AND tsv @@ query
        ORDER BY ts_rank_cd(tsv, query) DESC
        LIMIT $3`,
      [manualId, terms.join(" | "), this.candidates],
    );
    return rows;
  }
}
