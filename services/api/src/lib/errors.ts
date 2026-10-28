export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (resource: string) => new AppError(404, "NOT_FOUND", `${resource} não encontrado(a)`);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Não autenticado") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Acesso negado") => new AppError(403, "FORBIDDEN", message);
