import { describe, expect, it } from "vitest";
import { newProgress } from "../src/lib/quiz";
import { emptySave, migrate, sanitizeProgress, SAVE_VERSION } from "../src/lib/save";

describe("save", () => {
  it("現在の版はそのまま読める", () => {
    const data = { ...emptySave(), bag: ["eiken2/refund"], enabledSets: ["pre1"] };
    data.progress.leg = 3;
    expect(migrate(JSON.parse(JSON.stringify(data)))).toEqual(data);
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
