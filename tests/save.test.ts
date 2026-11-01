import { describe, expect, it } from "vitest";
import { emptySave, migrate, sanitizeProgress, SAVE_VERSION } from "../src/lib/save";

describe("save", () => {
  it("現在の版はそのまま読める", () => {
    const data = { ...emptySave(), bag: ["eiken2/refund"], enabledSets: ["pre1"] };
    data.progress.totalKm = 1234;
    expect(migrate(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("知らない版や壊れた値は初期状態にする", () => {
    expect(migrate({ version: SAVE_VERSION + 1 })).toEqual(emptySave());
    expect(migrate("garbage")).toEqual(emptySave());
  });
  it("progress の不正な値は初期値で埋める", () => {
    expect(sanitizeProgress({ name: "a", leg: -1, totalKm: "x", laps: 2 })).toMatchObject({ name: "a", leg: 0, totalKm: 0, laps: 2 });
  });
});
