// CEFR の単語表（content/wordlists/）を読み込み、単語 → レベル の表にする。
// - 品詞は見分けられないので、同じ単語が複数の品詞で載っていれば一番易しいレベルにする
// - "analyze/analyse" のような綴りの違いはそれぞれ登録する
// - "according to" のような 2 語以上の見出しは今は使わない（1 語ずつ判定する）
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CEFR_LEVELS, type Cefr } from "../../src/content/schema";

export const WORDLIST_FILES = ["cefrj-vocabulary-profile-1.5.csv", "octanove-vocabulary-profile-c1c2-1.0.csv"];

export type WordList = Map<string, Cefr>;

export const levelRank = (l: Cefr) => CEFR_LEVELS.indexOf(l);

export function loadWordList(dir: string): WordList {
  const list: WordList = new Map();
  for (const f of WORDLIST_FILES) {
    const [header, ...rows] = parseCsv(readFileSync(join(dir, f), "utf8").replace(/^﻿/, ""));
    const hi = header.indexOf("headword"), li = header.indexOf("CEFR");
    for (const r of rows) {
      const level = r[li]?.trim() as Cefr;
      if (!CEFR_LEVELS.includes(level)) continue;
      for (const variant of (r[hi] ?? "").split("/")) {
        const w = variant.trim().toLowerCase().replace(/\.$/, "");
        if (!w || /\s/.test(w)) continue;
        const prev = list.get(w);
        if (!prev || levelRank(level) < levelRank(prev)) list.set(w, level);
      }
    }
  }
  return list;
}

/** 機能語の品詞（冠詞・代名詞・be/do/have 動詞・助動詞など） */
const FUNCTION_POS = new Set(["determiner", "pronoun", "be-verb", "do-verb", "have-verb", "modal auxiliary", "infinitive-to"]);

/** 機能語としてだけ載っている語（the・you・this・can など。名詞や動詞としても載っていれば入れない） */
export function loadFunctionWords(dir: string): Set<string> {
  const pos = new Map<string, Set<string>>();
  for (const f of WORDLIST_FILES) {
    const [header, ...rows] = parseCsv(readFileSync(join(dir, f), "utf8").replace(/^\uFEFF/, ""));
    const hi = header.indexOf("headword"), pi = header.indexOf("pos");
    for (const r of rows) {
      for (const variant of (r[hi] ?? "").split("/")) {
        const w = variant.trim().toLowerCase();
        if (!w || /\s/.test(w)) continue;
        if (!pos.has(w)) pos.set(w, new Set());
        pos.get(w)!.add((r[pi] ?? "").trim());
      }
    }
  }
  return new Set([...pos].filter(([, ps]) => [...ps].every((p) => FUNCTION_POS.has(p))).map(([w]) => w));
}

/** 大文字の略語として載っている語（DVD・TV・DNA など。小文字にして引くと dvd などになる） */
export function loadAbbreviations(dir: string): Set<string> {
  const out = new Set<string>();
  for (const f of WORDLIST_FILES) {
    const [header, ...rows] = parseCsv(readFileSync(join(dir, f), "utf8").replace(/^\uFEFF/, ""));
    const hi = header.indexOf("headword");
    for (const r of rows) for (const v of (r[hi] ?? "").split("/")) if (/^[A-Z0-9]{2,}$/.test(v.trim())) out.add(v.trim().toLowerCase());
  }
  return out;
}

/** 引用符（"..."、"" はエスケープ）に対応した CSV の読み込み */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
