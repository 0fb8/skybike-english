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
