/** Utilitários de texto em português usados pelo chunker, busca lexical e provedores offline. */

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de da do das dos em na no nas nos por para com sem sob sobre " +
    "e ou que qual quais quanto quanta como onde quando se ao aos à às é ser sao são foi ter tem " +
    "meu minha seu sua isso esse essa este esta pelo pela pelos pelas mais menos muito qual"
  )
    .split(/\s+/)
    .map((word) => stripAccents(word)),
);

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Palavras normalizadas (minúsculas, sem acento), sem stopwords. */
export function tokenize(value: string): string[] {
  return (stripAccents(value.toLowerCase()).match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    // Dígitos isolados importam ("2 pessoas", "5 marchas"); letras isoladas não.
    (token) => (token.length > 1 || /\d/.test(token)) && !STOPWORDS.has(token),
  );
}

/**
 * "Radical" grosseiro por prefixo: aproxima flexões ("traseiro"/"traseira",
 * "válvula"/"válvulas") sem depender de um stemmer completo.
 */
export const roughStem = (token: string) => token.slice(0, 5);

/** Estimativa barata de tokens (≈ 4 caracteres por token). */
export const estimateTokens = (value: string) => Math.ceil(value.length / 4);
