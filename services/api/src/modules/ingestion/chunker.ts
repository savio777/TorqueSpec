import { estimateTokens } from "../../lib/text.js";

export interface Chunk {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
}

export interface ChunkOptions {
  /** Tamanho máximo alvo de cada fragmento, em caracteres. */
  chunkSize: number;
  /** Quantos caracteres do fim de um fragmento são repetidos no início do próximo. */
  overlap: number;
}

export function normalizePageText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Quebra em unidades que respeitam linhas e frases; só corta "no meio" quando não há alternativa. */
function splitUnits(text: string, max: number): string[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => (line.length <= max ? [line] : line.split(/(?<=[.!?;])\s+/)))
    .flatMap((piece) => {
      if (piece.length <= max) return [piece];
      const parts: string[] = [];
      for (let i = 0; i < piece.length; i += max) parts.push(piece.slice(i, i + max));
      return parts;
    });
}

/**
 * Fragmenta o texto página a página. Um fragmento nunca atravessa páginas —
 * é isso que garante que cada resposta possa citar uma página exata.
 */
export function chunkPages(pages: string[], { chunkSize, overlap }: ChunkOptions): Chunk[] {
  const chunks: Chunk[] = [];
  const push = (pageNumber: number, units: string[]) => {
    const content = units.join("\n");
    chunks.push({ pageNumber, chunkIndex: chunks.length, content, tokenEstimate: estimateTokens(content) });
  };

  pages.forEach((rawText, index) => {
    const pageNumber = index + 1;
    const text = normalizePageText(rawText);
    if (!text) return;

    let current: string[] = [];
    let length = 0;
    for (const unit of splitUnits(text, chunkSize)) {
      if (current.length > 0 && length + unit.length + 1 > chunkSize) {
        push(pageNumber, current);
        // Carrega as últimas unidades (até `overlap` caracteres) para o próximo fragmento.
        const carried: string[] = [];
        let carriedLength = 0;
        for (let i = current.length - 1; i >= 0; i--) {
          const size = current[i]!.length + 1;
          if (carriedLength + size > overlap) break;
          carried.unshift(current[i]!);
          carriedLength += size;
        }
        const fits = carriedLength + unit.length + 1 <= chunkSize;
        current = fits ? carried : [];
        length = fits ? carriedLength : 0;
      }
      current.push(unit);
      length += unit.length + 1;
    }
    if (current.length > 0) push(pageNumber, current);
  });

  return chunks;
}
