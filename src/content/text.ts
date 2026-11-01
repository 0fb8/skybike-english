// 例文と答えの文字列処理（ブラウザとビルドスクリプトの両方で使う。zod に依存しない）

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordRe(word: string, flags = "i"): RegExp {
  return new RegExp(`\\b(${escapeRegExp(word)})\\b`, flags);
}

export function containsWord(sentence: string, word: string): boolean {
  return wordRe(word).test(sentence);
}

/** 最初に出てくる answer を置き換える。前後の文字列と一致部分を返す */
export function splitAtAnswer(sentence: string, answer: string): { before: string; match: string; after: string } | null {
  const m = wordRe(answer).exec(sentence);
  if (!m) return null;
  return { before: sentence.slice(0, m.index), match: m[1], after: sentence.slice(m.index + m[1].length) };
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ---------- 例文の書き取り ----------
// 入力するのは英字だけ（大文字小文字は区別しない）。空白と記号は自動で埋まる。

const isLetter = (c: string) => /[a-zA-Z]/.test(c);

/** 書き取る文字列（例文の英字を小文字にしてつなげたもの） */
export function letterTarget(sentence: string): string {
  return sentence.replace(/[^a-zA-Z]/g, "").toLowerCase();
}

/** 例文の、入力済み n 文字ぶんが見えている部分と、まだの部分 */
export function revealSentence(sentence: string, n: number): { done: string; rest: string } {
  let letters = 0, i = 0;
  // n 文字目までと、その直後の記号・空白（次の英字の手前まで）を見せる
  for (; i < sentence.length; i++) {
    if (isLetter(sentence[i])) { if (letters === n) break; letters++; }
  }
  return { done: sentence.slice(0, i), rest: sentence.slice(i) };
}

/** まだの部分を伏せ字にする（英字 → "_"、空白と記号はそのまま） */
export function maskLetters(s: string, mask = "_"): string {
  return s.replace(/[a-zA-Z]/g, mask);
}
