/**
 * Contratos públicos do TorqueSpec.
 *
 * Os schemas Zod são a fonte única da verdade: a API os usa para validar
 * entrada/saída e gerar o OpenAPI, e o painel web e o app mobile os importam
 * para tipar as chamadas.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Comuns
// ---------------------------------------------------------------------------

export const IdSchema = z.uuid();

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const UserRoleSchema = z.enum(["admin", "mechanic"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: IdSchema,
  name: z.string(),
  email: z.email(),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const RegisterInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ---------------------------------------------------------------------------
// Motos (modelos)
// ---------------------------------------------------------------------------

const currentYear = new Date().getFullYear();

export const MotorcycleSchema = z.object({
  id: IdSchema,
  brand: z.string(),
  model: z.string(),
  year: z.number().int(),
  manualCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type Motorcycle = z.infer<typeof MotorcycleSchema>;

export const CreateMotorcycleInputSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(120),
  year: z.number().int().min(1900).max(currentYear + 1),
});
export type CreateMotorcycleInput = z.infer<typeof CreateMotorcycleInputSchema>;

export const UpdateMotorcycleInputSchema = CreateMotorcycleInputSchema.partial();
export type UpdateMotorcycleInput = z.infer<typeof UpdateMotorcycleInputSchema>;

// ---------------------------------------------------------------------------
// Manuais
// ---------------------------------------------------------------------------

export const ManualStatusSchema = z.enum(["pending", "processing", "indexed", "failed"]);
export type ManualStatus = z.infer<typeof ManualStatusSchema>;

export const ManualSchema = z.object({
  id: IdSchema,
  motorcycleId: IdSchema,
  motorcycle: z.object({ brand: z.string(), model: z.string(), year: z.number().int() }),
  title: z.string(),
  originalFilename: z.string(),
  fileSizeBytes: z.number().int(),
  pageCount: z.number().int().nullable(),
  chunkCount: z.number().int(),
  status: ManualStatusSchema,
  progress: z.number().int().min(0).max(100),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  indexedAt: z.iso.datetime().nullable(),
});
export type Manual = z.infer<typeof ManualSchema>;

export const ListManualsQuerySchema = PaginationQuerySchema.extend({
  motorcycleId: IdSchema.optional(),
  status: ManualStatusSchema.optional(),
});
export type ListManualsQuery = z.infer<typeof ListManualsQuerySchema>;

export const ManualChunkSchema = z.object({
  id: z.number().int(),
  pageNumber: z.number().int(),
  chunkIndex: z.number().int(),
  content: z.string(),
  tokenEstimate: z.number().int(),
});
export type ManualChunk = z.infer<typeof ManualChunkSchema>;

export const ListChunksQuerySchema = PaginationQuerySchema.extend({
  pageNumber: z.coerce.number().int().min(1).optional(),
});
export type ListChunksQuery = z.infer<typeof ListChunksQuerySchema>;

// ---------------------------------------------------------------------------
// Perguntas (RAG)
// ---------------------------------------------------------------------------

export const AskInputSchema = z.object({
  question: z.string().trim().min(3).max(1000),
});
export type AskInput = z.infer<typeof AskInputSchema>;

export const CitationSchema = z.object({
  page: z.number().int(),
  chunkId: z.number().int(),
  excerpt: z.string(),
  score: z.number(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const AskResponseSchema = z.object({
  id: IdSchema,
  manualId: IdSchema,
  question: z.string(),
  answer: z.string(),
  /** `false` quando a resposta não cita nenhuma página recuperada (ex.: informação não encontrada). */
  grounded: z.boolean(),
  citations: z.array(CitationSchema),
  model: z.string(),
  usage: z.object({ promptTokens: z.number().int(), completionTokens: z.number().int() }),
  latencyMs: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

export const QueryHistoryItemSchema = AskResponseSchema.omit({ usage: true, latencyMs: true }).extend({
  manualTitle: z.string(),
});
export type QueryHistoryItem = z.infer<typeof QueryHistoryItemSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  question: z.string(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

// ---------------------------------------------------------------------------
// Painel administrativo
// ---------------------------------------------------------------------------

export const AdminStatsSchema = z.object({
  motorcycles: z.number().int(),
  manuals: z.record(ManualStatusSchema, z.number().int()),
  totalVectors: z.number().int(),
  totalQueries: z.number().int(),
  usageLast30Days: z.array(
    z.object({
      day: z.string(),
      queries: z.number().int(),
      promptTokens: z.number().int(),
      completionTokens: z.number().int(),
    }),
  ),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;
