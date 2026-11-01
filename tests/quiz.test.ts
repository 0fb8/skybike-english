import { describe, expect, it } from "vitest";
import { completeLeg, newProgress, QuestionBag, totalKm } from "../src/lib/quiz";

const legs = [1000, 2000, 3000];

describe("completeLeg", () => {
  it("次の都市へ進む", () => {
    expect(completeLeg(newProgress(), 3)).toMatchObject({ leg: 1, laps: 0 });
  });
  it("最後の区間を終えると周回数が増える", () => {
    expect(completeLeg({ ...newProgress(), leg: 2 }, 3)).toMatchObject({ leg: 0, laps: 1 });
  });
});

describe("totalKm", () => {
  it("到着済みの区間と周回から総距離を出す", () => {
    expect(totalKm({ leg: 0, laps: 0 }, legs)).toBe(0);
    expect(totalKm({ leg: 2, laps: 0 }, legs)).toBe(3000);
    expect(totalKm({ leg: 1, laps: 2 }, legs)).toBe(13000);
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
