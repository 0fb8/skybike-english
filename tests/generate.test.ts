import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { candidateHeadwords, usedHeadwords, validateItem } from "../scripts/generate/draft";
import { loadSpellingTable } from "../scripts/levels/american";
import { loadWordList } from "../scripts/levels/wordlist";
import type { LevelCriteria } from "../src/content/schema";

const list = loadWordList(join(import.meta.dirname, "..", "content", "wordlists"));
const spelling = loadSpellingTable(join(import.meta.dirname, "..", "content", "wordlists"));
const criteria: LevelCriteria = { title: "t", answer: ["B1"], othersMax: "B1", othersAbove: 1, words: [5, 12] };

describe("candidateHeadwords", () => {
  it("基準のレベルで、a-z だけの、未使用の語。seed が同じなら同じ順", () => {
    const used = new Set(["postpone"]);
    const a = candidateHeadwords(list, criteria, used, 1);
    expect(a.every((w) => list.get(w) === "B1" && /^[a-z]+$/.test(w))).toBe(true);
    expect(a).not.toContain("postpone");
    expect(candidateHeadwords(list, criteria, used, 1)).toEqual(a);
    expect(candidateHeadwords(list, criteria, used, 2)).not.toEqual(a);
  });
  it("既存の問題の答えは原形で数える", () => {
    expect(usedHeadwords([{ id: "s", title: "s", questions: [{ answer: "increased", sentence: "Sales increased.", meaning: "m", translation: "t" }] }], list)).toEqual(new Set(["increase"]));
  });
});

describe("validateItem", () => {
  const ctx = () => ({ list, spelling, criteria, offered: new Set(["launch", "steady"]), taken: new Set<string>() });
  const item = { headword: "launch", answer: "launched", sentence: "They launched the new app last week.", meaning: "公開する", translation: "彼らは先週新しいアプリを公開した。" };

  it("合格すれば問題データになる", () => {
    expect(validateItem(item, ctx())).toEqual({ question: { answer: "launched", sentence: item.sentence, meaning: "公開する", translation: item.translation } });
  });
  it("候補に無い語・別の語の変化形・使用済みは不合格", () => {
    expect(validateItem({ ...item, headword: "start" }, ctx())).toHaveProperty("issues");
    expect(validateItem({ ...item, answer: "app" }, ctx())).toHaveProperty("issues");
    const c = ctx();
    c.taken.add("launch");
    expect(validateItem(item, c)).toHaveProperty("issues");
  });
  it("イギリス式の綴りは不合格", () => {
    const r = validateItem({ ...item, sentence: "They launched the app at the new sports centre." }, ctx());
    expect("issues" in r && r.issues.join()).toContain("centre");
  });
  it("書式とレベルの基準も確かめる", () => {
    const digits = validateItem({ ...item, sentence: "They launched 2 apps last week." }, ctx());
    expect("issues" in digits && digits.issues.join()).toContain("数字");
    const hard = validateItem({ ...item, sentence: "They launched the app despite unanimous skepticism from investors." }, ctx());
    expect("issues" in hard && hard.issues.join()).toMatch(/B1 を超える単語が/);
  });
});
