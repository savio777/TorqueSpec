import type { MultipartFile } from "@fastify/multipart";
import {
  ErrorResponseSchema,
  IdSchema,
  ListChunksQuerySchema,
  ListManualsQuerySchema,
  ManualChunkSchema,
  ManualSchema,
  paginated,
} from "@torquespec/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { isPdf } from "../ingestion/pdf.js";
import type { ManualsService } from "./manuals.service.js";
import type { FileStorage } from "./storage.js";

const params = z.object({ id: IdSchema });
const security = [{ bearerAuth: [] }];

const UploadFieldsSchema = z.object({
  motorcycleId: IdSchema,
  title: z.string().trim().min(1).max(200).optional(),
});

export const manualsRoutes: FastifyPluginAsyncZod<{ manuals: ManualsService; storage: FileStorage }> = async (
  app,
  { manuals, storage },
) => {
  const admin = app.requireRole("admin");

  app.get(
    "/",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["manuals"],
        summary: "Lista manuais (filtros: moto e status)",
        security,
        querystring: ListManualsQuerySchema,
        response: { 200: paginated(ManualSchema) },
      },
    },
    (request) => manuals.list(request.query),
  );

  app.get(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["manuals"],
        summary: "Detalha um manual (inclui status/progresso da indexação)",
        security,
        params,
        response: { 200: ManualSchema, 404: ErrorResponseSchema },
      },
    },
    (request) => manuals.get(request.params.id),
  );

  app.post(
    "/",
    {
      preHandler: admin,
      schema: {
        tags: ["manuals"],
        summary: "Envia um PDF (multipart: file, motorcycleId, title?) e agenda a indexação (admin)",
        description: "Responde 202: a extração, fragmentação e geração de embeddings rodam no worker.",
        security,
        consumes: ["multipart/form-data"],
        response: { 202: ManualSchema, 400: ErrorResponseSchema, 413: ErrorResponseSchema, 415: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const fields: Record<string, string> = {};
      let upload: { key: string; size: number; filename: string } | undefined;
      const discard = () => (upload ? storage.remove(upload.key) : Promise.resolve());

      try {
        for await (const part of request.parts()) {
          if (part.type === "field") {
            if (typeof part.value === "string") fields[part.fieldname] = part.value;
            continue;
          }
          if (part.fieldname !== "file" || upload) {
            part.file.resume(); // descarta arquivos extras
            continue;
          }
          upload = await saveUpload(part, storage);
        }

        if (!upload) throw badRequest('Envie o PDF no campo "file"');
        if (!isPdf(await storage.readHeader(upload.key, 5))) {
          throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "O arquivo enviado não é um PDF válido");
        }
        const parsed = UploadFieldsSchema.safeParse(fields);
        if (!parsed.success) throw badRequest("Campos inválidos", z.treeifyError(parsed.error));
        if (!(await manuals.motorcycleExists(parsed.data.motorcycleId))) throw notFound("Moto");

        const manual = await manuals.create({
          motorcycleId: parsed.data.motorcycleId,
          title: parsed.data.title ?? upload.filename.replace(/\.pdf$/i, ""),
          originalFilename: upload.filename,
          storageKey: upload.key,
          fileSizeBytes: upload.size,
          uploadedBy: request.user.sub,
        });
        return reply.status(202).send(manual);
      } catch (error) {
        await discard();
        throw error;
      }
    },
  );

  app.post(
    "/:id/reindex",
    {
      preHandler: admin,
      schema: {
        tags: ["manuals"],
        summary: "Reprocessa um manual (ex.: após trocar o modelo de embeddings) (admin)",
        security,
        params,
        response: { 202: ManualSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema },
      },
    },
    async (request, reply) => reply.status(202).send(await manuals.reindex(request.params.id)),
  );

  app.delete(
    "/:id",
    {
      preHandler: admin,
      schema: {
        tags: ["manuals"],
        summary: "Remove um manual, seus fragmentos e o PDF (admin)",
        security,
        params,
        response: { 204: z.null(), 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      await manuals.remove(request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/:id/chunks",
    {
      preHandler: admin,
      schema: {
        tags: ["manuals"],
        summary: "Inspeciona os fragmentos indexados de um manual (admin)",
        security,
        params,
        querystring: ListChunksQuerySchema,
        response: { 200: paginated(ManualChunkSchema), 404: ErrorResponseSchema },
      },
    },
    (request) => manuals.listChunks(request.params.id, request.query),
  );
};

async function saveUpload(part: MultipartFile, storage: FileStorage) {
  const filename = part.filename || "manual.pdf";
  if (part.mimetype !== "application/pdf" && !filename.toLowerCase().endsWith(".pdf")) {
    part.file.resume();
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Apenas arquivos PDF são aceitos");
  }
  const saved = await storage.save(part.file, "pdf");
  if (part.file.truncated) {
    await storage.remove(saved.key);
    throw new AppError(413, "FILE_TOO_LARGE", "O PDF excede o tamanho máximo permitido");
  }
  return { ...saved, filename };
}
