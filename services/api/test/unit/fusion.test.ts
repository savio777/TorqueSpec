import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../../src/modules/rag/fusion.js";

describe("reciprocalRankFusion", () => {
  it("prioriza itens bem colocados nas duas listas", () => {
    const vector = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const text = [{ id: 2 }, { id: 4 }, { id: 1 }];
    const fused = reciprocalRankFusion([vector, text], (item) => item.id);

    expect(fused.map((entry) => entry.item.id)).toEqual([2, 1, 4, 3]);
    expect(fused[0]!.ranks).toEqual([2, 1]);
    expect(fused.find((entry) => entry.item.id === 3)!.ranks).toEqual([3, null]);
  });

  it("usa a fórmula 1/(k + rank)", () => {
    const [only] = reciprocalRankFusion([[{ id: "a" }], [{ id: "a" }]], (item) => item.id, 10);
    expect(only!.score).toBeCloseTo(2 / 11);
  });

  it("lida com listas vazias", () => {
    expect(reciprocalRankFusion([[], []], (item: { id: number }) => item.id)).toEqual([]);
  });
});
