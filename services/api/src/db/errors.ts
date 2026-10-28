/** Código SQLSTATE de violação de unicidade. */
export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "23505";
