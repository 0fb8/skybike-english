// 出題された問題の記録（復習画面用）。問題ごとに、最後の結果と回数を持つ（DOM に依存しない。テスト対象）。
// 結果は「正解」と「答えられなかった（墜落・パス）」の 2 つだけ。途中で打ち間違えても、最後まで書ければ正解とする
// （分かっていてタイプミスしただけ、という場合を失敗扱いにしないため）。

export type Outcome = "correct" | "failed";

export interface HistoryEntry {
  /** 最後の結果 */
  last: Outcome;
  /** 最後に出題された時刻（ミリ秒） */
  at: number;
  correct: number;
  failed: number;
}

/** 問題のキー（PlayQuestion.key）→ 記録 */
export type History = Record<string, HistoryEntry>;

/** 記録しておく問題数の上限（古いものから捨てる。localStorage の容量を食いつぶさないため） */
export const HISTORY_LIMIT = 3000;

export function recordOutcome(history: History, key: string, outcome: Outcome, now: number): History {
  const prev = history[key];
  const next: History = {
    ...history,
    [key]: {
      last: outcome,
      at: now,
      correct: (prev?.correct ?? 0) + (outcome === "correct" ? 1 : 0),
      failed: (prev?.failed ?? 0) + (outcome === "failed" ? 1 : 0),
    },
  };
  const keys = Object.keys(next);
  if (keys.length <= HISTORY_LIMIT) return next;
  const keep = keys.sort((a, b) => next[b].at - next[a].at).slice(0, HISTORY_LIMIT);
  return Object.fromEntries(keep.map((k) => [k, next[k]]));
}

/** 新しい順の一覧 */
export function historyList(history: History, filter: "all" | Outcome = "all"): (HistoryEntry & { key: string })[] {
  return Object.entries(history)
    .filter(([, e]) => filter === "all" || e.last === filter)
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.at - a.at);
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 壊れた記録は捨てる（保存データが原因で起動しなくなることを防ぐ） */
export function sanitizeHistory(v: unknown): History {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: History = {};
  for (const [key, e] of Object.entries(v as Record<string, unknown>)) {
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    if ((r.last !== "correct" && r.last !== "failed") || typeof r.at !== "number" || !Number.isFinite(r.at)) continue;
    out[key] = { last: r.last, at: r.at, correct: count(r.correct), failed: count(r.failed) };
  }
  return out;
}
