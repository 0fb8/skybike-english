import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, historyList, recordOutcome, type History } from "../src/lib/history";

describe("history", () => {
  it("問題ごとに最後の結果と回数を持つ", () => {
    let h: History = {};
    h = recordOutcome(h, "b1/yoga", "failed", 1);
    h = recordOutcome(h, "b1/yoga", "correct", 2);
    h = recordOutcome(h, "b1/delete", "failed", 3);
    expect(h["b1/yoga"]).toEqual({ last: "correct", at: 2, correct: 1, failed: 1 });
  });
  it("一覧は新しい順で、最後の結果で絞り込める", () => {
    let h: History = {};
    h = recordOutcome(h, "a", "correct", 1);
    h = recordOutcome(h, "b", "failed", 2);
    h = recordOutcome(h, "c", "correct", 3);
    expect(historyList(h).map((e) => e.key)).toEqual(["c", "b", "a"]);
    expect(historyList(h, "failed").map((e) => e.key)).toEqual(["b"]);
  });
  it("上限を超えたら古いものから捨てる", () => {
    let h: History = {};
    for (let i = 0; i <= HISTORY_LIMIT; i++) h = recordOutcome(h, `k${i}`, "correct", i);
    expect(Object.keys(h)).toHaveLength(HISTORY_LIMIT);
    expect(h.k0).toBeUndefined();
    expect(h[`k${HISTORY_LIMIT}`]).toBeDefined();
  });
});
