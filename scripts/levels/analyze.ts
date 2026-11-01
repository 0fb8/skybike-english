// 例文のレベルを判定する。単語ごとに CEFR のレベルを引き、問題集の基準（config.yaml の levels）と比べる。
import type { Cefr, LevelCriteria, Question } from "../../src/content/schema";
import { baseCandidates } from "./lemma";
import { levelRank, type WordList } from "./wordlist";

/** 単語表に無い単語。どのレベルよりも上として扱う */
export const UNLISTED = "?" as const;
export type WordLevel = Cefr | typeof UNLISTED;

export interface WordInfo {
  /** 例文に出てくる形 */
  text: string;
  level: WordLevel;
  /** 単語表で見つかった見出し語（text と同じなら省略） */
  base?: string;
  /** 文の途中の大文字で始まる語で、単語表に無いもの（人名・地名など）。判定から外す */
  proper?: boolean;
}

export interface SentenceProfile {
  answer: WordInfo;
  /** 答え以外の単語（固有名詞は除く） */
  others: WordInfo[];
  /** 固有名詞とみなして判定から外した単語 */
  proper: string[];
  wordCount: number;
}

const rank = (l: WordLevel) => (l === UNLISTED ? Infinity : levelRank(l));

/** 縮約形（don't, it's, we'll …）から元の単語を取り出す */
function expandContraction(w: string): string[] {
  const lower = w.toLowerCase();
  const special: Record<string, string[]> = { "won't": ["will"], "can't": ["can"], "shan't": ["shall"], "let's": ["let", "us"] };
  if (special[lower]) return special[lower];
  if (lower.endsWith("n't")) return [w.slice(0, -3)];
  const m = /^(.+)'(s|re|ve|ll|d|m)$/i.exec(w);
  return m ? [m[1]] : [w];
}

/**
 * 単語のレベル。単語表にその形があればそのレベル（abandoned は形容詞として B2）。
 * 無ければ変化形の候補のうち、単語表にある一番易しいもの（increased → increase）
 */
export function lookup(word: string, list: WordList): { level: WordLevel; base?: string } {
  const exact = list.get(word.toLowerCase());
  if (exact) return { level: exact };
  let best: { level: Cefr; base: string } | undefined;
  for (const c of baseCandidates(word)) {
    const l = list.get(c);
    if (l && (!best || levelRank(l) < levelRank(best.level))) best = { level: l, base: c };
  }
  if (best) return { level: best.level, base: best.base === word.toLowerCase() ? undefined : best.base };
  // ハイフンでつながった語（well-known など）は、全体が無ければ部分の中で一番難しいもの
  if (word.includes("-")) {
    const parts = word.split("-").filter(Boolean).map((p) => lookup(p, list));
    if (parts.length) return parts.reduce((a, b) => (rank(b.level) > rank(a.level) ? b : a));
  }
  return { level: UNLISTED };
}

/** 例文を単語に分ける（記号を落とし、縮約形は元の単語にする） */
export function words(sentence: string): { text: string; initial: boolean }[] {
  const out: { text: string; initial: boolean }[] = [];
  let initial = true;
  for (const raw of sentence.split(/\s+/)) {
    const t = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (t) for (const w of expandContraction(t)) out.push({ text: w, initial });
    initial = /[.?!:]["']?$/.test(raw) || (initial && !t);
  }
  return out;
}

export function profileSentence(q: Pick<Question, "sentence" | "answer">, list: WordList): SentenceProfile {
  const tokens = words(q.sentence);
  const answer: WordInfo = { text: q.answer, ...lookup(q.answer, list) };
  const others: WordInfo[] = [];
  const proper: string[] = [];
  for (const t of tokens) {
    if (t.text.toLowerCase() === q.answer) continue;
    const info: WordInfo = { text: t.text, ...lookup(t.text, list) };
    if (info.level === UNLISTED && !t.initial && /^[A-Z]/.test(t.text)) { proper.push(t.text); continue; }
    others.push(info);
  }
  return { answer, others, proper, wordCount: tokens.length };
}

/** 基準に合わない点（日本語の説明）。合っていれば空 */
export function checkLevel(p: SentenceProfile, c: LevelCriteria): string[] {
  const issues: string[] = [];
  if (!c.answer.includes(p.answer.level as Cefr)) {
    issues.push(`答え ${fmt(p.answer)} が基準（${c.answer.join("・")}）外`);
  }
  const above = p.others.filter((w) => rank(w.level) > levelRank(c.othersMax));
  if (above.length > c.othersAbove) {
    issues.push(`${c.othersMax} を超える単語が ${above.length} 語（${c.othersAbove} 語まで）: ${above.map(fmt).join(", ")}`);
  }
  const [min, max] = c.words;
  if (p.wordCount < min || p.wordCount > max) issues.push(`${p.wordCount} 語（${min}〜${max} 語）`);
  return issues;
}

export function fmt(w: WordInfo): string {
  return `${w.text}${w.base ? `(${w.base})` : ""}[${w.level}]`;
}
