import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "./config/env.js";
import type { Db } from "./db/pool.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import type { IngestionQueue } from "./modules/ingestion/queue.js";
import { manualsRoutes } from "./modules/manuals/manuals.routes.js";
import { ManualsService } from "./modules/manuals/manuals.service.js";
import type { FileStorage } from "./modules/manuals/storage.js";
import { motorcyclesRoutes } from "./modules/motorcycles/motorcycles.routes.js";
import { MotorcyclesService } from "./modules/motorcycles/motorcycles.service.js";
import { ragRoutes } from "./modules/rag/rag.routes.js";
import { RagService } from "./modules/rag/rag.service.js";
import { HybridRetriever } from "./modules/rag/retriever.js";
import authPlugin from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import type { EmbeddingProvider, LlmProvider } from "./providers/types.js";

/** Dependências externas da API — injetadas para que testes possam trocar fila, LLM etc. */
export interface AppDeps {
  env: Env;
  db: Db;
  storage: FileStorage;
  queue: IngestionQueue;
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
}

export async function buildApp(deps: AppDeps, options: Pick<FastifyServerOptions, "logger"> = {}) {
  const { env, db, storage, queue, llm, embeddings } = deps;
  const serverOptions: FastifyServerOptions = { ...options, trustProxy: env.TRUST_PROXY };
  const app = Fastify(serverOptions).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 },
  });
  await app.register(authPlugin, { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });

  if (env.SWAGGER_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "TorqueSpec API",
          version: "0.1.0",
          description: "RAG copilot para manuais técnicos: ingestão de PDFs e respostas com citação de página.",
        },
        components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  const auth = new AuthService(db);
  const motorcycles = new MotorcyclesService(db);
  const manuals = new ManualsService(db, storage, queue);
  const rag = new RagService(db, new HybridRetriever(db, embeddings, env.RAG_CANDIDATES), llm, env.RAG_TOP_K);

  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Liveness + conexão com o banco",
        response: {
          200: z.object({ status: z.literal("ok"), llm: z.string(), embeddings: z.string() }),
        },
      },
    },
    async () => {
      await db.query("SELECT 1");
      return { status: "ok" as const, llm: llm.name, embeddings: embeddings.name };
    },
  );

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth", auth, expiresIn: env.JWT_EXPIRES_IN });
      await v1.register(motorcyclesRoutes, { prefix: "/motorcycles", motorcycles, storage });
      await v1.register(manualsRoutes, { prefix: "/manuals", manuals, storage });
      await v1.register(ragRoutes, { rag, askRateLimitPerMinute: env.ASK_RATE_LIMIT_PER_MINUTE });
      await v1.register(adminRoutes, { prefix: "/admin", db });
    },
    { prefix: "/v1" },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
