import {
  AskInputSchema,
  AskResponseSchema,
  ErrorResponseSchema,
  IdSchema,
  PaginationQuerySchema,
  paginated,
  QueryHistoryItemSchema,
  SuggestionSchema,
} from "@torquespec/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { RagService } from "./rag.service.js";
import { SUGGESTIONS } from "./suggestions.js";

const security = [{ bearerAuth: [] }];

export const ragRoutes: FastifyPluginAsyncZod<{ rag: RagService; askRateLimitPerMinute: number }> = async (
  app,
  { rag, askRateLimitPerMinute },
) => {
  app.post(
    "/manuals/:id/ask",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: askRateLimitPerMinute, timeWindow: "1 minute" } },
      schema: {
        tags: ["rag"],
        summary: "Pergunta em linguagem natural sobre um manual; responde citando as páginas",
        security,
        params: z.object({ id: IdSchema }),
        body: AskInputSchema,
        response: { 200: AskResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema },
      },
    },
    (request) => rag.ask(request.user.sub, request.params.id, request.body.question),
  );

  app.get(
    "/queries",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["rag"],
        summary: "Histórico de perguntas do usuário autenticado",
        security,
        querystring: PaginationQuerySchema.extend({ manualId: IdSchema.optional() }),
        response: { 200: paginated(QueryHistoryItemSchema) },
      },
    },
    (request) => rag.history(request.user.sub, request.query.page, request.query.pageSize, request.query.manualId),
  );

  app.get(
    "/suggestions",
    {
      schema: {
        tags: ["rag"],
        summary: "Sugestões rápidas (chips) para o app",
        response: { 200: z.array(SuggestionSchema) },
      },
    },
    () => SUGGESTIONS,
  );
};
