import { describe, expect, it } from "vitest";
import { advance, altitudeGain, crashSetback, newProgress, QuestionBag } from "../src/lib/quiz";

const legs = [1000, 2000, 3000];
const alt = { start: 55, decayPerSec: 2, decayIncreasePerLap: 0.4, gainMax: 28, gainMin: 8, gainFalloffPerSec: 2, wrongPenalty: 5, passPenalty: 12, crashSetback: 0.3 };

describe("advance", () => {
  it("1問ごとに区間距離 / 問題数ずつ進む", () => {
    const { progress, arrived } = advance(newProgress(), 1, 10, legs);
    expect(progress.legDone).toBe(1);
    expect(progress.totalKm).toBeCloseTo(100);
    expect(arrived).toBe(false);
  });
  it("区間の最後で次の都市に到着する", () => {
    const { progress, arrived } = advance({ ...newProgress(), legDone: 9 }, 1, 10, legs);
    expect(arrived).toBe(true);
    expect(progress.leg).toBe(1);
    expect(progress.legDone).toBe(0);
  });
  it("倍速でも区間を飛び越えない", () => {
    const { progress } = advance({ ...newProgress(), legDone: 9 }, 2, 10, legs);
    expect(progress.totalKm).toBeCloseTo(100);
  });
  it("最後の区間を終えると周回数が増える", () => {
    const { progress } = advance({ ...newProgress(), leg: 2, legDone: 9 }, 1, 10, legs);
    expect(progress.leg).toBe(0);
    expect(progress.laps).toBe(1);
  });
});

describe("crashSetback", () => {
  it("割合ぶん戻すが区間の手前までは戻らない", () => {
    expect(crashSetback({ ...newProgress(), legDone: 5, totalKm: 500 }, 0.3, 10, legs).back).toBe(3);
    expect(crashSetback({ ...newProgress(), legDone: 1, totalKm: 100 }, 0.3, 10, legs).progress.legDone).toBe(0);
  });
});

describe("altitudeGain", () => {
  it("速いほど多く、上下限の範囲に収まる", () => {
    expect(altitudeGain(alt, 0)).toBe(28);
    expect(altitudeGain(alt, 5)).toBe(18);
    expect(altitudeGain(alt, 100)).toBe(8);
  });
});

describe("QuestionBag", () => {
  it("全問出し切るまで重複しない", () => {
    const keys = ["a", "b", "c", "d"];
    const bag = new QuestionBag(keys, "shuffle");
    const drawn = keys.map(() => bag.next());
    expect(new Set(drawn).size).toBe(4);
  });
  it("sequential は順番どおり", () => {
    const bag = new QuestionBag(["a", "b", "c"], "sequential");
    expect([bag.next(), bag.next(), bag.next(), bag.next()]).toEqual(["a", "b", "c", "a"]);
  });
  it("保存された残りから再開し、消えた問題は除く", () => {
    const bag = new QuestionBag(["a", "b"], "sequential", ["x", "b"]);
    expect(bag.next()).toBe("b");
  });
});
