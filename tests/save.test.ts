import { describe, expect, it } from "vitest";
import { CITIES } from "../src/data/route";
import { newProgress } from "../src/lib/quiz";
import { emptySave, migrate, sanitizeProgress, SAVE_VERSION } from "../src/lib/save";

describe("save", () => {
  it("現在の版はそのまま読める", () => {
    const data = { ...emptySave(), bag: ["eiken2/refund"], enabledSets: ["pre1"], history: { "b1/yoga": { last: "failed" as const, at: 5, correct: 1, failed: 2 } } };
    data.progress.leg = 3;
    expect(migrate(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("版 1 の保存データは進み具合を残したまま今の版にする（記録は空から）", () => {
    const v1 = { version: 1, progress: { ...newProgress(), leg: 0, laps: 2, name: "a" }, bag: ["b1/yoga"], enabledSets: ["b1"] };
    expect(migrate(v1)).toEqual({ ...emptySave(), progress: v1.progress, bag: ["b1/yoga"], enabledSets: ["b1"] });
  });
  it("版 2 までの今いる都市は、名前で新しいルートの位置に置き換える", () => {
    const v2 = { version: 2, progress: { ...newProgress(), leg: 1, laps: 1 }, bag: [], enabledSets: null, history: {} };
    const m = migrate(v2);
    expect(CITIES[m.progress.leg].name).toBe("Sydney");
    expect(m.progress.laps).toBe(1);
  });
  it("ルートより先の地点は出発地に戻す", () => {
    expect(migrate({ ...emptySave(), progress: { ...newProgress(), leg: CITIES.length + 3 } }).progress.leg).toBe(0);
  });
  it("壊れた記録は捨てる", () => {
    const raw = { ...emptySave(), history: { a: { last: "correct", at: 1, correct: 1, failed: 0 }, b: { last: "maybe", at: 1 }, c: null } };
    expect(migrate(raw).history).toEqual({ a: { last: "correct", at: 1, correct: 1, failed: 0 } });
  });
  it("知らない版や壊れた値は初期状態にする", () => {
    expect(migrate({ version: SAVE_VERSION + 1 })).toEqual(emptySave());
    expect(migrate("garbage")).toEqual(emptySave());
  });
  it("以前の既定の名前「あなた」は名前なしに戻す（名前を入れ直せるように）", () => {
    expect(sanitizeProgress({ name: "あなた" }).name).toBe("");
    expect(sanitizeProgress({ name: "Ken" }).name).toBe("Ken");
  });
  it("progress の不正な値は初期値で埋める", () => {
    expect(sanitizeProgress({ name: "a", leg: -1, laps: 2 })).toMatchObject({ name: "a", leg: 0, laps: 2 });
  });
  it("以前の形式の区間途中の進み（legDone / totalKm）は捨てる", () => {
    expect(sanitizeProgress({ leg: 3, legDone: 7, totalKm: 9999 })).toEqual({ ...newProgress(), leg: 3 });
  });
});
