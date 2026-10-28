import {
  CreateMotorcycleInputSchema,
  ErrorResponseSchema,
  IdSchema,
  MotorcycleSchema,
  UpdateMotorcycleInputSchema,
} from "@torquespec/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { FileStorage } from "../manuals/storage.js";
import type { MotorcyclesService } from "./motorcycles.service.js";

const params = z.object({ id: IdSchema });
const security = [{ bearerAuth: [] }];

export const motorcyclesRoutes: FastifyPluginAsyncZod<{ motorcycles: MotorcyclesService; storage: FileStorage }> = async (
  app,
  { motorcycles, storage },
) => {
  const admin = app.requireRole("admin");

  app.get(
    "/",
    {
      preHandler: app.authenticate,
      schema: { tags: ["motorcycles"], summary: "Lista as motos", security, response: { 200: z.array(MotorcycleSchema) } },
    },
    () => motorcycles.list(),
  );

  app.get(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["motorcycles"],
        summary: "Detalha uma moto",
        security,
        params,
        response: { 200: MotorcycleSchema, 404: ErrorResponseSchema },
      },
    },
    (request) => motorcycles.get(request.params.id),
  );

  app.post(
    "/",
    {
      preHandler: admin,
      schema: {
        tags: ["motorcycles"],
        summary: "Cadastra uma moto (admin)",
        security,
        body: CreateMotorcycleInputSchema,
        response: { 201: MotorcycleSchema, 409: ErrorResponseSchema },
      },
    },
    async (request, reply) => reply.status(201).send(await motorcycles.create(request.body)),
  );

  app.patch(
    "/:id",
    {
      preHandler: admin,
      schema: {
        tags: ["motorcycles"],
        summary: "Atualiza uma moto (admin)",
        security,
        params,
        body: UpdateMotorcycleInputSchema,
        response: { 200: MotorcycleSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema },
      },
    },
    (request) => motorcycles.update(request.params.id, request.body),
  );

  app.delete(
    "/:id",
    {
      preHandler: admin,
      schema: {
        tags: ["motorcycles"],
        summary: "Remove uma moto e seus manuais (admin)",
        security,
        params,
        response: { 204: z.null(), 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const keys = await motorcycles.remove(request.params.id);
      await Promise.all(keys.map((key) => storage.remove(key)));
      return reply.status(204).send(null);
    },
  );
};
