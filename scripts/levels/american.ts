// 例文をアメリカ英語にそろえるための検査（通常の出題の声がアメリカ英語のため。飛行船の訛りは発音だけで、文は同じ）。
// - 綴り: 単語表の "color/colour" のような見出し（先がアメリカ式）から、イギリス式 → アメリカ式 の表を作る。
//   変化形（organised、colours）も原形に戻して調べる。travelled のように l を重ねる形も見る
// - 語彙: 綴りでは分からない、イギリスで主に使う語（takeaway など）は下の表で見る
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { words } from "./analyze";
import { baseCandidates } from "./lemma";
import { parseCsv, WORDLIST_FILES } from "./wordlist";

/** 見出しに並んでいても、アメリカでも普通に使うので指摘しない方 */
const BOTH = new Set(["backwards", "towards", "okay", "savings", "shorts", "mamma", "mommie", "internet", "whisky", "axe", "archeologist", "advisor", "dialogue", "catalogue", "omelette", "disc"]);

/** l を重ねるのがアメリカでも普通の動詞（最後の音節に強勢がある） */
const DOUBLE_L_OK = new Set(["control", "compel", "expel", "propel", "repel", "dispel", "impel", "rebel", "excel", "patrol", "enrol", "distil", "fulfil", "instil", "instal", "appal", "annul"]);

/** 主にイギリスで使う語 → アメリカでの言い方 */
const BRITISH_WORDS: Record<string, string> = {
  takeaway: "takeout",
  parcel: "package",
  lorry: "truck",
  petrol: "gas",
  crisps: "chips",
  motorway: "highway",
  pavement: "sidewalk",
  rubbish: "trash / garbage",
  queue: "line",
  nappy: "diaper",
  postcode: "zip code",
  fortnight: "two weeks",
  aubergine: "eggplant",
  courgette: "zucchini",
  dustbin: "trash can",
  biscuit: "cookie",
  cinema: "movie theater / the movies",
  mum: "mom",
  loo: "bathroom",
  quid: "dollars",
};

export interface SpellingTable {
  /** イギリス式の綴り → アメリカ式 */
  british: Map<string, string>;
  /** アメリカ式の綴り（british の値） */
  american: Set<string>;
  /** 単語表にある語（l を重ねる形の判定用） */
  known: Set<string>;
}

export function loadSpellingTable(dir: string): SpellingTable {
  const british = new Map<string, string>();
  const known = new Set<string>();
  for (const f of WORDLIST_FILES) {
    const [header, ...rows] = parseCsv(readFileSync(join(dir, f), "utf8").replace(/^﻿/, ""));
    const hi = header.indexOf("headword");
    for (const r of rows) {
      const variants = (r[hi] ?? "").split("/").map((v) => v.trim().toLowerCase());
      variants.forEach((v) => known.add(v));
      const [us, ...others] = variants;
      if (!/^[a-z]+$/.test(us)) continue;
      for (const o of others) if (/^[a-z]+$/.test(o) && o !== us && !BOTH.has(o)) british.set(o, us);
    }
  }
  return { british, american: new Set(british.values()), known };
}

/** アメリカ英語でない語の指摘（日本語）。無ければ空 */
export function americanIssues(sentence: string, table: SpellingTable): string[] {
  const issues: string[] = [];
  for (const { text } of words(sentence)) {
    const w = text.toLowerCase();
    const cands = baseCandidates(w);
    // 原形の候補にアメリカ式があればそちら（installed → install。instal ではない）
    const spelled = cands.some((c) => table.american.has(c)) ? undefined : cands.find((c) => table.british.has(c));
    if (spelled) {
      issues.push(`イギリス式の綴り ${text}（アメリカ式は ${table.british.get(spelled)}${spelled !== w ? " の変化形" : ""}）`);
      continue;
    }
    const m = /^(.+[^l]l)l(ed|ing|er|ers)$/.exec(w);
    if (m && table.known.has(m[1]) && !DOUBLE_L_OK.has(m[1])) {
      issues.push(`イギリス式の綴り ${text}（アメリカ式は ${m[1]}${m[2]}）`);
      continue;
    }
    const word = cands.find((c) => c in BRITISH_WORDS);
    if (word) issues.push(`イギリス英語の語 ${text}（アメリカでは ${BRITISH_WORDS[word]}）`);
  }
  return issues;
}
