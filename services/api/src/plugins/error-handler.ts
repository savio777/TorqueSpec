import type { ErrorResponse } from "@torquespec/shared-types";
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors.js";

export interface ErrorHandlerOptions {
  /** Inclui o erro completo (stack, `cause`, contexto da requisição) em `error.debug` nas respostas 500. */
  exposeInternalErrors?: boolean;
}

/** Padroniza todas as respostas de erro no formato `{ error: { code, message, details?, debug? } }`. */
export function registerErrorHandler(app: FastifyInstance, { exposeInternalErrors = false }: ErrorHandlerOptions = {}) {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const send = (status: number, body: ErrorResponse) => reply.status(status).send(body);
    const internalError = (): ErrorResponse => ({
      error: {
        code: "INTERNAL_ERROR",
        message: exposeInternalErrors ? error.message : "Erro interno",
        ...(exposeInternalErrors && { debug: debugInfo(request, error) }),
      },
    });

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
      return send(500, internalError());
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
    return send(500, internalError());
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: `Rota ${request.method} ${request.url} não existe` } });
  });
}

/** Contexto da requisição (o `requestId` é o `reqId` dos logs) + o erro serializado. */
function debugInfo(request: FastifyRequest, error: unknown) {
  return {
    requestId: request.id,
    method: request.method,
    url: request.url,
    error: serializeError(error),
  };
}

/** Converte um Error em JSON: nome, mensagem, stack em linhas, propriedades extras (code, issues…) e `cause`. */
function serializeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return error;
  const { name, message, stack, cause, ...extra } = error as Error & Record<string, unknown>;
  return {
    name,
    message,
    ...extra,
    stack: stack?.split("\n").map((line) => line.trim()),
    ...(cause !== undefined && { cause: depth < 5 ? serializeError(cause, depth + 1) : "[cause omitida]" }),
  };
}
