import { AdminStatsSchema, type AdminStats, type ManualStatus } from "@torquespec/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Queryable } from "../../db/pool.js";

export const adminRoutes: FastifyPluginAsyncZod<{ db: Queryable }> = async (app, { db }) => {
  app.get(
    "/stats",
    {
      preHandler: app.requireRole("admin"),
      schema: {
        tags: ["admin"],
        summary: "Métricas do painel: manuais por status, vetores no pgvector e consumo da LLM",
        security: [{ bearerAuth: [] }],
        response: { 200: AdminStatsSchema },
      },
    },
    async (): Promise<AdminStats> => {
      const [totals, byStatus, usage] = await Promise.all([
        db.query<{ motorcycles: number; vectors: number; queries: number }>(
          `SELECT (SELECT count(*) FROM motorcycles)   AS motorcycles,
                  (SELECT count(*) FROM manual_chunks) AS vectors,
                  (SELECT count(*) FROM queries)       AS queries`,
        ),
        db.query<{ status: ManualStatus; total: number }>(
          "SELECT status, count(*) AS total FROM manuals GROUP BY status",
        ),
        db.query<{ day: string; queries: number; prompt_tokens: number; completion_tokens: number }>(
          `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                  count(q.id)                                AS queries,
                  coalesce(sum(q.prompt_tokens), 0)::int     AS prompt_tokens,
                  coalesce(sum(q.completion_tokens), 0)::int AS completion_tokens
             FROM generate_series(current_date - 29, current_date, interval '1 day') AS d(day)
             LEFT JOIN queries q ON q.created_at >= d.day AND q.created_at < d.day + interval '1 day'
            GROUP BY d.day
            ORDER BY d.day`,
        ),
      ]);

      const manuals: Record<ManualStatus, number> = { pending: 0, processing: 0, indexed: 0, failed: 0 };
      for (const row of byStatus.rows) manuals[row.status] = row.total;
      const total = totals.rows[0]!;

      return {
        motorcycles: total.motorcycles,
        manuals,
        totalVectors: total.vectors,
        totalQueries: total.queries,
        usageLast30Days: usage.rows.map((row) => ({
          day: row.day,
          queries: row.queries,
          promptTokens: row.prompt_tokens,
          completionTokens: row.completion_tokens,
        })),
      };
    },
  );
};
