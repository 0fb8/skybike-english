import { describe, expect, it } from "vitest";
import { newProgress } from "../src/lib/quiz";
import { emptySave, migrate, sanitizeProgress, SAVE_VERSION } from "../src/lib/save";

describe("save", () => {
  it("現在の版はそのまま読める", () => {
    const data = { ...emptySave(), bag: ["eiken2/refund"], enabledSets: ["pre1"], history: { "b1/yoga": { last: "failed" as const, at: 5, correct: 1, failed: 2 } } };
    data.progress.leg = 3;
    expect(migrate(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("版 1 の保存データは進み具合を残したまま版 2 にする（記録は空から）", () => {
    const v1 = { version: 1, progress: { ...newProgress(), leg: 4, name: "a" }, bag: ["b1/yoga"], enabledSets: ["b1"] };
    expect(migrate(v1)).toEqual({ ...emptySave(), progress: v1.progress, bag: ["b1/yoga"], enabledSets: ["b1"] });
  });
  it("壊れた記録は捨てる", () => {
    const raw = { ...emptySave(), history: { a: { last: "correct", at: 1, correct: 1, failed: 0 }, b: { last: "maybe", at: 1 }, c: null } };
    expect(migrate(raw).history).toEqual({ a: { last: "correct", at: 1, correct: 1, failed: 0 } });
  });
  it("知らない版や壊れた値は初期状態にする", () => {
    expect(migrate({ version: SAVE_VERSION + 1 })).toEqual(emptySave());
    expect(migrate("garbage")).toEqual(emptySave());
  });
  it("progress の不正な値は初期値で埋める", () => {
    expect(sanitizeProgress({ name: "a", leg: -1, laps: 2 })).toMatchObject({ name: "a", leg: 0, laps: 2 });
  });
  it("以前の形式の区間途中の進み（legDone / totalKm）は捨てる", () => {
    expect(sanitizeProgress({ leg: 3, legDone: 7, totalKm: 9999 })).toEqual({ ...newProgress(), leg: 3 });
  });
});
