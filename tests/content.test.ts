// content/ の実データが検証を通ることを確認する（問題を追加・修正したら自動でチェックされる）
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent } from "../scripts/content";

describe("content/", () => {
  const result = loadContent(join(import.meta.dirname, "..", "content"));

  it("エラーがない", () => {
    expect(result.errors).toEqual([]);
  });

  it("設定で有効な問題集がすべて存在する", () => {
    const ids = result.sets.map((s) => s.id);
    for (const s of result.config!.questionSets) expect(ids).toContain(s.id);
  });

  it("1区間ぶんの問題数以上の問題がある", () => {
    const total = result.sets.reduce((n, s) => n + s.questions.length, 0);
    expect(total).toBeGreaterThanOrEqual(result.config!.questionsPerLeg);
  });
});
