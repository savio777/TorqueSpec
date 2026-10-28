import fastifyJwt from "@fastify/jwt";
import type { UserRole } from "@torquespec/shared-types";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { forbidden, unauthorized } from "../lib/errors.js";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler: exige um JWT válido. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: exige JWT válido com um dos papéis informados. */
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp<{ secret: string; expiresIn: string }>(
  async (app, options) => {
    await app.register(fastifyJwt, { secret: options.secret, sign: { expiresIn: options.expiresIn } });

    const authenticate = async (request: FastifyRequest) => {
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized("Token ausente, inválido ou expirado");
      }
    };

    app.decorate("authenticate", authenticate);
    app.decorate("requireRole", (...roles: UserRole[]) => async (request: FastifyRequest) => {
      await authenticate(request);
      if (!roles.includes(request.user.role)) throw forbidden();
    });
  },
  { name: "auth" },
);
