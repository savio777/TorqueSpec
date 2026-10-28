export interface Ranked<T> {
  item: T;
  score: number;
  /** Posição (1-based) em cada lista de origem; `null` quando o item não apareceu nela. */
  ranks: (number | null)[];
}

/**
 * Reciprocal Rank Fusion (Cormack et al., 2009): score = Σ 1 / (k + rank).
 * Combina rankings de naturezas diferentes (cosseno vs. ts_rank) sem precisar
 * normalizar as pontuações originais.
 */
export function reciprocalRankFusion<T>(lists: T[][], key: (item: T) => string | number, k = 60): Ranked<T>[] {
  const fused = new Map<string | number, Ranked<T>>();
  lists.forEach((list, listIndex) => {
    list.forEach((item, position) => {
      const id = key(item);
      let entry = fused.get(id);
      if (!entry) {
        entry = { item, score: 0, ranks: lists.map(() => null) };
        fused.set(id, entry);
      }
      entry.score += 1 / (k + position + 1);
      entry.ranks[listIndex] = position + 1;
    });
  });
  return [...fused.values()].sort((a, b) => b.score - a.score);
}
