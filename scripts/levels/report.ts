// 例文のレベルを判定して一覧にする。
//   npm run content:levels                   … 問題集ごとの集計と、基準外の例文
//   npm run content:levels -- --all          … 基準に合う例文も含めて全部出す
//   npm run content:levels -- --set eiken2   … 1 つの問題集だけ
import { join, resolve } from "node:path";
import { CEFR_LEVELS } from "../../src/content/schema";
import { loadContent } from "../content";
import { americanIssues, loadSpellingTable } from "./american";
import { checkLevel, fmt, profileSentence, UNLISTED, type WordLevel } from "./analyze";
import { loadWordList } from "./wordlist";

const root = resolve(import.meta.dirname, "..", "..");
const argv = process.argv.slice(2);
const showAll = argv.includes("--all");
const only = argv.includes("--set") ? argv[argv.indexOf("--set") + 1] : undefined;

const { config, sets, errors } = loadContent(join(root, "content"));
if (errors.length || !config) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}
const list = loadWordList(join(root, "content", "wordlists"));
const spelling = loadSpellingTable(join(root, "content", "wordlists"));
const ORDER: WordLevel[] = [...CEFR_LEVELS, UNLISTED];
const dist = (levels: WordLevel[]) =>
  ORDER.map((l) => [l, levels.filter((x) => x === l).length] as const).filter(([, n]) => n).map(([l, n]) => `${l}:${n}`).join(" ");

for (const set of sets) {
  if (only && set.id !== only) continue;
  const criteria = set.level ? config.levels[set.level] : undefined;
  const rows = set.questions.map((q) => ({ q, p: profileSentence(q, list) }));
  // レベルの基準（level があるとき）と、アメリカ英語か（すべての問題集）
  const checked = rows.map((r) => ({ ...r, issues: [...(criteria ? checkLevel(r.p, criteria) : []), ...americanIssues(r.q.sentence, spelling)] }));
  const wc = rows.map((r) => r.p.wordCount).sort((a, b) => a - b);
  const maxOther = rows.map((r) => ORDER[Math.max(0, ...r.p.others.map((w) => ORDER.indexOf(w.level)))]);

  console.log(`\n■ ${set.id}（${set.title}）${criteria ? ` 基準: ${set.level}（${criteria.title}）` : " 基準なし（問題集に level を書くと判定します）"}`);
  console.log(`  答えのレベル:         ${dist(rows.map((r) => r.p.answer.level))}`);
  console.log(`  答え以外で一番難しい語: ${dist(maxOther)}`);
  console.log(`  語数: 最小 ${wc[0]}・中央 ${wc[Math.floor(wc.length / 2)]}・最大 ${wc.at(-1)}`);
  const ng = checked.filter((r) => r.issues.length).length;
  console.log(`  ${criteria ? "基準に合う" : "アメリカ英語の"}例文: ${rows.length - ng} / ${rows.length}`);
  for (const { q, p, issues } of checked) {
    if (!showAll && !issues.length) continue;
    console.log(`  ${issues.length ? "⚠" : "✔"} ${q.id ?? q.answer}: ${q.sentence}`);
    for (const i of issues) console.log(`      - ${i}`);
    if (showAll) {
      const hard = p.others.filter((w) => ORDER.indexOf(w.level) >= ORDER.indexOf("B1")).map(fmt);
      console.log(`      答え ${fmt(p.answer)}${hard.length ? `、B1 以上: ${hard.join(", ")}` : ""}${p.proper.length ? `、固有名詞: ${p.proper.join(", ")}` : ""}`);
    }
  }
}
