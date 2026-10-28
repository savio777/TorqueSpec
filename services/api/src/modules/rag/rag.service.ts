import type { AskResponse, Citation, QueryHistoryItem } from "@torquespec/shared-types";
import type { Queryable } from "../../db/pool.js";
import { AppError, notFound } from "../../lib/errors.js";
import type { LlmProvider } from "../../providers/types.js";
import { buildUserPrompt, extractCitedPages, NOT_FOUND_ANSWER, SYSTEM_PROMPT } from "./prompt.js";
import type { HybridRetriever, RetrievedChunk } from "./retriever.js";

const EXCERPT_LENGTH = 280;

interface QueryRow {
  id: string;
  manual_id: string;
  manual_title: string;
  question: string;
  answer: string;
  grounded: boolean;
  citations: Citation[];
  model: string;
  created_at: Date;
}

/**
 * Mantém só as citações que a LLM realmente fez E que existem no contexto recuperado.
 * Uma página citada que não veio da busca é tratada como alucinação e descartada.
 */
export function resolveCitations(answer: string, chunks: RetrievedChunk[]): Citation[] {
  return extractCitedPages(answer).flatMap((page) => {
    const best = chunks.filter((chunk) => chunk.pageNumber === page).sort((a, b) => b.score - a.score)[0];
    if (!best) return [];
    const excerpt =
      best.content.length > EXCERPT_LENGTH ? `${best.content.slice(0, EXCERPT_LENGTH).trimEnd()}…` : best.content;
    return [{ page, chunkId: best.id, excerpt, score: Number(best.score.toFixed(6)) }];
  });
}

export class RagService {
  constructor(
    private readonly db: Queryable,
    private readonly retriever: HybridRetriever,
    private readonly llm: LlmProvider,
    private readonly topK: number,
  ) {}

  async ask(userId: string, manualId: string, question: string): Promise<AskResponse> {
    const startedAt = performance.now();
    const { rows } = await this.db.query<{ status: string }>("SELECT status FROM manuals WHERE id = $1", [manualId]);
    if (!rows[0]) throw notFound("Manual");
    if (rows[0].status !== "indexed") {
      throw new AppError(409, "MANUAL_NOT_READY", `O manual ainda não está pronto para consultas (status: ${rows[0].status})`);
    }

    const chunks = await this.retriever.search(manualId, question, this.topK);
    const generation =
      chunks.length > 0
        ? await this.llm.generate({
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: buildUserPrompt(
                  question,
                  chunks.map((chunk) => ({ page: chunk.pageNumber, content: chunk.content })),
                ),
              },
            ],
          })
        : { text: NOT_FOUND_ANSWER, model: this.llm.name, usage: { promptTokens: 0, completionTokens: 0 } };

    const answer = generation.text || NOT_FOUND_ANSWER;
    const citations = resolveCitations(answer, chunks);
    const latencyMs = Math.round(performance.now() - startedAt);

    const inserted = await this.db.query<{ id: string; created_at: Date }>(
      `INSERT INTO queries (user_id, manual_id, question, answer, grounded, citations, model,
                            prompt_tokens, completion_tokens, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, created_at`,
      [
        userId,
        manualId,
        question,
        answer,
        citations.length > 0,
        JSON.stringify(citations),
        generation.model,
        generation.usage.promptTokens,
        generation.usage.completionTokens,
        latencyMs,
      ],
    );

    return {
      id: inserted.rows[0]!.id,
      manualId,
      question,
      answer,
      grounded: citations.length > 0,
      citations,
      model: generation.model,
      usage: generation.usage,
      latencyMs,
      createdAt: inserted.rows[0]!.created_at.toISOString(),
    };
  }

  async history(userId: string, page: number, pageSize: number, manualId?: string) {
    const values: unknown[] = [userId];
    const manualFilter = manualId ? `AND q.manual_id = $${values.push(manualId)}` : "";
    const [{ rows }, count] = await Promise.all([
      this.db.query<QueryRow>(
        `SELECT q.*, m.title AS manual_title
           FROM queries q JOIN manuals m ON m.id = q.manual_id
          WHERE q.user_id = $1 ${manualFilter}
          ORDER BY q.created_at DESC
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ total: number }>(
        `SELECT count(*) AS total FROM queries q WHERE q.user_id = $1 ${manualFilter}`,
        values,
      ),
    ]);
    const items: QueryHistoryItem[] = rows.map((row) => ({
      id: row.id,
      manualId: row.manual_id,
      manualTitle: row.manual_title,
      question: row.question,
      answer: row.answer,
      grounded: row.grounded,
      citations: row.citations,
      model: row.model,
      createdAt: row.created_at.toISOString(),
    }));
    return { items, page, pageSize, total: count.rows[0]!.total };
  }
}
