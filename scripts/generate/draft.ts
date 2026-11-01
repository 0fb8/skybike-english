// 例文の自動生成（scripts/generate/sentences.ts）のうち、API を呼ばない部分:
// 答えの単語の候補選び、Claude への指示文、返ってきた例文の検証。
import { QuestionSchema, type LevelCriteria, type Question, type QuestionSet } from "../../src/content/schema";
import { americanIssues, type SpellingTable } from "../levels/american";
import { checkLevel, lookup, profileSentence } from "../levels/analyze";
import { baseCandidates } from "../levels/lemma";
import type { WordList } from "../levels/wordlist";

/** 変化形だけの原形の候補（-ly の副詞は別の語として扱う。cultural と culturally はレベルも違う） */
const inflections = (w: string) => baseCandidates(w, { derivations: false });

/**
 * 同じ語の仲間か（片方がもう片方の変化形の候補になっている。tangle と tangled、use と user など）。
 * 単語表では別の見出し語でも、問題としては同じ語を二度出すことになるので避ける
 */
export function sameFamily(a: string, b: string): boolean {
  return a === b || inflections(a).includes(b) || inflections(b).includes(a);
}

/** 和訳・意味の半角の ? ! を全角にそろえる */
export function normalizeJapanese(text: string): string {
  return text.trim().replace(/\?/g, "？").replace(/!/g, "！");
}

/** Claude が返す 1 文ぶん */
export interface DraftItem {
  /** 単語表の見出し語（候補として渡した語） */
  headword: string;
  /** 例文に出てくる形（小文字） */
  answer: string;
  sentence: string;
  meaning: string;
  translation: string;
}

/** 既存の問題で使っている単語（原形）。同じ語を二度出さないため */
export function usedHeadwords(sets: QuestionSet[], list: WordList): Set<string> {
  const used = new Set<string>();
  for (const s of sets) for (const q of s.questions) used.add(lookup(q.answer, list).base ?? q.answer);
  return used;
}

/** 答えの単語の候補（基準のレベルの単語で、キーボードで打てて、まだ使っていないもの）。seed で順番が決まる */
export function candidateHeadwords(list: WordList, criteria: LevelCriteria, used: Set<string>, seed: number): string[] {
  // 使った語とその変化形の候補（tangle を使っていれば tangled も除く。逆も）
  const family = new Set([...used].flatMap(inflections));
  const words = [...list]
    .filter(([w, l]) => criteria.answer.includes(l) && /^[a-z]{3,}$/.test(w) && !family.has(w) && !inflections(w).some((c) => used.has(c)))
    .map(([w]) => w)
    .sort();
  // 再現できるシャッフル（mulberry32）
  let t = seed >>> 0;
  const random = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
}

export function systemPrompt(criteria: LevelCriteria): string {
  const [min, max] = criteria.words;
  return `You write English example sentences for a Japanese learner's dictation game. The player hears a sentence and types the whole sentence.

Write American English: American spelling (color, favorite, organize, center, traveled) and American vocabulary (apartment, takeout, package, vacation, cell phone, truck, line for a queue). The game's normal voices are American, and the player types exactly what they hear, so British spellings count as typing mistakes. Sentences are checked for British spellings and words automatically.

What the learner wants: English as it is really used. Each sentence should sound like something a native speaker would actually say or write - in conversation, messages, everyday life, work, news, hobbies, travel, and so on. Do not make it sound like a test question, a textbook drill, or business jargon. Vary the topics, the speakers' situations, and the sentence structures across the set.

Level: ${criteria.title}. The levels below come from CEFR word lists (CEFR-J and Octanove C1/C2), and every sentence is checked against those lists automatically.
- The target word must appear in the sentence. You may use an inflected form (for example "postponed" for "postpone"), but keep the same word, not a derived word with a different headword.
- Every other word must be a common word at CEFR ${criteria.othersMax} or below. At most ${criteria.othersAbove} other word may be above ${criteria.othersMax}. When unsure, choose the simpler word.
- The sentence must have ${min} to ${max} words (count contractions such as "don't" as one word).

Format rules (the game's keyboard has only the letters a-z):
- Use only English letters, spaces, and these marks: . , ? ! ; : ' " -
- Write numbers as words ("seven", not "7"). No accented letters, no symbols such as % or &.
- Avoid names of people and places unless they make the sentence more natural.
- Casual, everyday wording is welcome, but avoid vulgar or offensive slang (for example "suck" or swear words).
- Do not reuse the same situation across sentences (for example two sentences about tangled headphones or a grandmother's kitchen).
- "answer" is the target word exactly as it appears in the sentence, in lowercase.
- "meaning" is a short Japanese gloss of the target word as used in this sentence (for example "延期する").
- "translation" is a natural Japanese translation of the whole sentence.`;
}

export function requestPrompt(candidates: string[], n: number, existing: string[] = []): string {
  const already = existing.length
    ? `\n\nSentences already in this set. Do not repeat their situations or ideas:\n${existing.map((x) => `- ${x}`).join("\n")}`
    : "";
  return `From the candidate words below, choose the ${n} words that are most often used in real, everyday English, and write one sentence for each chosen word. Put the chosen word in "headword" exactly as listed.

Candidates: ${candidates.join(", ")}${already}`;
}

export function retryPrompt(failed: { item: DraftItem; issues: string[] }[]): string {
  const lines = failed.map(({ item, issues }) => `- ${item.headword}: "${item.sentence}"\n  problems: ${issues.join(" / ")}`);
  return `These sentences did not pass the automatic check. Write a new sentence for each word that fixes the problems (keep the same headword). Words shown like word[B2] or word[?] are above the allowed level or not in the word list - replace them with simpler words. Problems mentioning イギリス式 or イギリス英語 mean a British spelling or word - use the American one given.

${lines.join("\n")}`;
}

/** 返ってきた 1 文を検証する。問題が無ければ問題データ、あれば理由 */
export function validateItem(
  item: DraftItem,
  ctx: { list: WordList; spelling: SpellingTable; criteria: LevelCriteria; offered: Set<string>; taken: Set<string> },
): { question: Question } | { issues: string[] } {
  const issues: string[] = [];
  const answer = item.answer.trim().toLowerCase();
  if (!ctx.offered.has(item.headword)) issues.push(`"${item.headword}" is not one of the candidate words`);
  const twin = [...ctx.taken].find((t) => sameFamily(t, item.headword));
  if (twin) issues.push(`"${item.headword}" is the same word as "${twin}", which is already used`);
  const base = lookup(answer, ctx.list).base ?? answer;
  if (base !== item.headword) issues.push(`answer "${answer}" is not a form of "${item.headword}"`);

  const parsed = QuestionSchema.safeParse({ answer, sentence: item.sentence.trim(), meaning: normalizeJapanese(item.meaning), translation: normalizeJapanese(item.translation) });
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((i) => i.message));
    return { issues };
  }
  issues.push(...checkLevel(profileSentence(parsed.data, ctx.list), ctx.criteria));
  issues.push(...americanIssues(parsed.data.sentence, ctx.spelling));
  return issues.length ? { issues } : { question: parsed.data };
}
