import { describe, expect, it } from "vitest";
import { QuestionSchema, QuestionSetSchema } from "../src/content/schema";
import { currentWord, letterTarget, maskLetters, revealSentence, splitAtAnswer } from "../src/content/text";

const base = { answer: "postpone", sentence: "We had to postpone the meeting.", meaning: "延期する", translation: "会議を延期しなければならなかった。" };

describe("QuestionSchema", () => {
  it("正しい問題を通す", () => {
    expect(QuestionSchema.safeParse(base).success).toBe(true);
  });
  it("例文に答えが含まれないと弾く", () => {
    expect(QuestionSchema.safeParse({ ...base, answer: "cancel" }).success).toBe(false);
  });
  it("単語の一部だけの一致は弾く", () => {
    expect(QuestionSchema.safeParse({ ...base, answer: "post" }).success).toBe(false);
  });
  it("大文字や記号を含む答えは弾く", () => {
    expect(QuestionSchema.safeParse({ ...base, answer: "Postpone" }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...base, answer: "post-pone", sentence: "post-pone" }).success).toBe(false);
  });
  it("入力できない文字（数字など）を含む例文は弾く", () => {
    expect(QuestionSchema.safeParse({ ...base, sentence: "We had to postpone it until 7." }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...base, sentence: "Let's postpone the café meeting." }).success).toBe(false);
  });
  it("未知の項目は弾く（綴りミスの検出）", () => {
    expect(QuestionSchema.safeParse({ ...base, meening: "x" }).success).toBe(false);
  });
});

describe("QuestionSetSchema", () => {
  const set = (questions: object[]) => ({ id: "s", title: "t", questions });
  it("同じ answer が2つあると弾く", () => {
    expect(QuestionSetSchema.safeParse(set([base, { ...base, sentence: "Let's postpone it." }])).success).toBe(false);
  });
  it("id を付ければ同じ answer を使える", () => {
    expect(QuestionSetSchema.safeParse(set([base, { ...base, id: "postpone-2", sentence: "Let's postpone it." }])).success).toBe(true);
  });
});

describe("splitAtAnswer", () => {
  it("文頭の大文字でも見つける", () => {
    expect(splitAtAnswer("However, it is late.", "however")).toEqual({ before: "", match: "However", after: ", it is late." });
  });
});

describe("例文の書き取り", () => {
  const s = "Let's go, Tom.";
  it("英字だけを小文字で書き取る", () => {
    expect(letterTarget(s)).toBe("letsgotom");
  });
  it("書けた文字と、その直後の記号・空白まで見せる", () => {
    expect(revealSentence(s, 0)).toEqual({ done: "", rest: s });
    expect(revealSentence(s, 3)).toEqual({ done: "Let'", rest: "s go, Tom." });
    expect(revealSentence(s, 6)).toEqual({ done: "Let's go, ", rest: "Tom." });
    expect(revealSentence(s, 9)).toEqual({ done: s, rest: "" });
  });
  it("残りは英字だけ伏せる", () => {
    expect(maskLetters("s go, Tom.")).toBe("_ __, ___.");
  });
  it("入力中の単語", () => {
    expect(currentWord(s, 3)).toEqual({ done: "Let'", restLetters: 1 });
    expect(currentWord(s, 4)).toEqual({ done: "", restLetters: 2 });
    expect(currentWord(s, 9)).toEqual({ done: "Tom.", restLetters: 0 });
  });
});
