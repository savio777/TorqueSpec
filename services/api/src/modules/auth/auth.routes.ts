import {
  AuthResponseSchema,
  ErrorResponseSchema,
  LoginInputSchema,
  RegisterInputSchema,
  UserSchema,
  type User,
} from "@torquespec/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AuthService } from "./auth.service.js";

export const authRoutes: FastifyPluginAsyncZod<{ auth: AuthService; expiresIn: string }> = async (
  app,
  { auth, expiresIn },
) => {
  const issueToken = (user: User) => ({
    accessToken: app.jwt.sign({ sub: user.id, role: user.role }),
    tokenType: "Bearer" as const,
    expiresIn,
    user,
  });
  const loginRateLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  app.post(
    "/register",
    {
      config: loginRateLimit,
      schema: {
        tags: ["auth"],
        summary: "Cria uma conta de mecânico",
        body: RegisterInputSchema,
        response: { 201: AuthResponseSchema, 409: ErrorResponseSchema },
      },
    },
    async (request, reply) => reply.status(201).send(issueToken(await auth.register(request.body))),
  );

  app.post(
    "/login",
    {
      config: loginRateLimit,
      schema: {
        tags: ["auth"],
        summary: "Autentica e devolve um JWT",
        body: LoginInputSchema,
        response: { 200: AuthResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => issueToken(await auth.authenticate(request.body.email, request.body.password)),
  );

  app.get(
    "/me",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Usuário autenticado",
        security: [{ bearerAuth: [] }],
        response: { 200: UserSchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => auth.findById(request.user.sub),
  );
};
