import type { ErrorResponse } from "@torquespec/shared-types";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors.js";

/** Padroniza todas as respostas de erro no formato `{ error: { code, message, details? } }`. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const send = (status: number, body: ErrorResponse) => reply.status(status).send(body);

    if (error instanceof AppError) {
      return send(error.statusCode, { error: { code: error.code, message: error.message, details: error.details } });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return send(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Requisição inválida",
          details: error.validation.map((issue) => ({
            location: error.validationContext,
            path: issue.instancePath,
            message: issue.message,
          })),
        },
      });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause.issues }, "resposta não corresponde ao schema");
      return send(500, { error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
    }
    if (error.statusCode === 429) {
      return send(429, { error: { code: "RATE_LIMITED", message: "Muitas requisições; tente novamente em instantes" } });
    }
    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return send(413, { error: { code: "FILE_TOO_LARGE", message: error.message } });
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return send(error.statusCode, { error: { code: error.code ?? "BAD_REQUEST", message: error.message } });
    }

    request.log.error({ err: error }, "erro não tratado");
    return send(500, { error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: `Rota ${request.method} ${request.url} não existe` } });
  });
}
