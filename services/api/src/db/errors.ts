/** Código SQLSTATE de violação de chave estrangeira. */
export const isForeignKeyViolation = (error: unknown) => (error as { code?: string } | null)?.code === "23503";

/** Código SQLSTATE de violação de unicidade. */
export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "23505";
