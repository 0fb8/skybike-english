import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLevel, lookup, profileSentence, words } from "../scripts/levels/analyze";
import { baseCandidates } from "../scripts/levels/lemma";
import { loadWordList, parseCsv } from "../scripts/levels/wordlist";
import type { LevelCriteria } from "../src/content/schema";

const list = loadWordList(join(import.meta.dirname, "..", "content", "wordlists"));

describe("wordlist", () => {
  it("引用符つきの CSV を読める", () => {
    expect(parseCsv('a,"b, c",d\n"x ""y""",,\n')).toEqual([["a", "b, c", "d"], ['x "y"', "", ""]]);
  });
  it("綴りの違いと大文字の見出しも引ける。品詞違いは易しい方", () => {
    expect(list.get("analyse")).toBe(list.get("analyze"));
    expect(list.get("april")).toBe("A1");
    expect(list.has("according to")).toBe(false);
  });
});

describe("lookup", () => {
  it("変化形は原形のレベル", () => {
    expect(lookup("increased", list)).toEqual({ level: "A2", base: "increase" });
    expect(lookup("went", list)).toEqual({ level: "A1", base: "go" });
    expect(lookup("teeth", list).base).toBe("tooth");
    expect(lookup("cancelled", list).base).toBe("cancel");
    expect(lookup("strawberries", list).base).toBe("strawberry");
  });
  it("その形が単語表にあればそれを使う（apply を apple にしない）", () => {
    expect(lookup("apply", list).base).toBeUndefined();
    expect(lookup("abandoned", list)).toEqual({ level: "B2" });
  });
  it("単語表に無い語は ?", () => {
    expect(lookup("reimburse", list).level).toBe("?");
  });
  it("候補は語そのものから始まる", () => {
    expect(baseCandidates("Stopped")).toEqual(expect.arrayContaining(["stopped", "stop"]));
    expect(baseCandidates("Stopped")[0]).toBe("stopped");
  });
});

describe("profileSentence / checkLevel", () => {
  it("記号を落とし、縮約形を元に戻し、文中の大文字の未知語は固有名詞として外す", () => {
    expect(words(`"It's late," she said. Don't go!`).map((w) => w.text)).toEqual(["It", "late", "she", "said", "Do", "go"]);
    const p = profileSentence({ sentence: "We flew to Zanzibar with Kenji yesterday.", answer: "flew" }, list);
    expect(p.answer.base).toBe("fly");
    expect(p.proper).toEqual(["Zanzibar", "Kenji"]);
    expect(p.wordCount).toBe(7);
  });
  const c: LevelCriteria = { title: "t", answer: ["B1"], othersMax: "A2", othersAbove: 0, words: [3, 8] };
  it("基準に合えば何も言わない", () => {
    expect(checkLevel(profileSentence({ sentence: "The train was delayed by snow.", answer: "delayed" }, list), { ...c, answer: ["A2", "B1"] })).toEqual([]);
  });
  it("答えのレベル・難しい語・語数をそれぞれ指摘する", () => {
    const issues = checkLevel(profileSentence({ sentence: "We must reimburse the employees for their travel expenses this month.", answer: "reimburse" }, list), c);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain("reimburse[?]");
    expect(issues[1]).toContain("employees(employee)[B2]");
    expect(issues[2]).toContain("11 語");
  });
});
