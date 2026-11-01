// 保存データの形式。形式を変えるときは SAVE_VERSION を上げ、migrate() に古い形からの変換を足す。
import { sanitizeHistory, type History } from "./history";
import { newProgress, type Progress } from "./quiz";
import { loadJSON, removeKey, saveJSON } from "./storage";

export const SAVE_VERSION = 2;
const KEY = "save";

export interface SaveData {
  version: typeof SAVE_VERSION;
  progress: Progress;
  /** 出題待ちの問題のキー（PlayQuestion.key） */
  bag: string[];
  /** プレイヤーが選んだ問題集。null は config.yaml の初期設定に従う */
  enabledSets: string[] | null;
  /** 出題された問題の記録（復習画面用。版 2 で追加） */
  history: History;
}

export const emptySave = (): SaveData => ({ version: SAVE_VERSION, progress: newProgress(), bag: [], enabledSets: null, history: {} });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null);

/** 壊れた値や欠けた項目は初期値で埋める（保存データが原因でゲームが起動しなくなることを防ぐ） */
export function sanitizeProgress(v: unknown): Progress {
  const p = newProgress();
  if (!isObj(v)) return p;
  if (typeof v.name === "string") p.name = v.name.slice(0, 20);
  // 以前の形式にあった legDone / totalKm（区間の途中の進み）は読まない → 出発地からやり直し
  for (const k of ["leg", "laps", "answered", "correctFirst"] as const) {
    const n = v[k];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) p[k] = n;
  }
  p.leg = Math.floor(p.leg);
  p.laps = Math.floor(p.laps);
  return p;
}

/** 保存されていた値（どの版でも）を現在の形にする */
export function migrate(raw: unknown): SaveData {
  // 版 1 → 2: 出題の記録（history）を追加。ほかは同じ
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== SAVE_VERSION)) return emptySave();
  return {
    version: SAVE_VERSION,
    progress: sanitizeProgress(raw.progress),
    bag: strings(raw.bag) ?? [],
    enabledSets: raw.enabledSets === null ? null : strings(raw.enabledSets),
    history: raw.version === 1 ? {} : sanitizeHistory(raw.history),
  };
}

/** 版番号を持つ前の保存形式（progress / sets / bag を別々のキーに保存していた） */
function fromLegacy(): SaveData | null {
  const progress = loadJSON<unknown>("progress", undefined);
  if (progress === undefined) return null;
  const save: SaveData = {
    ...emptySave(),
    progress: sanitizeProgress(progress),
    enabledSets: strings(loadJSON<unknown>("sets", null)),
    // 旧形式の bag は問題の並び順に依存したキーなので引き継がない（次の出題で引き直すだけ）
  };
  for (const k of ["progress", "sets", "bag"]) removeKey(k);
  return save;
}

export function loadSave(): SaveData {
  const raw = loadJSON<unknown>(KEY, undefined);
  if (raw !== undefined) return migrate(raw);
  const legacy = fromLegacy();
  if (legacy) { writeSave(legacy); return legacy; }
  return emptySave();
}

export function writeSave(data: SaveData): void {
  saveJSON(KEY, data);
}
