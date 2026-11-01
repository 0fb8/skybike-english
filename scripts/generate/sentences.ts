// Claude API で例文を作り、レベルの基準（config.yaml の levels）で検証して、合格したものだけを問題集に追記する。
//   npm run content:generate -- --level b1              … 問題集が 100 問になるまで作る（Claude API の料金がかかる）
//   npm run content:generate -- --level b1 --count 20   … 20 問になるまで
//   npm run content:generate -- --level b1 --dry-run    … API を呼ばず、指示文と候補の数だけ表示する
// 出力先は content/questions/<level>.yaml（無ければ作る）。config.yaml の questionSets に入れるまでは出題されないので、
// 中身を確認してから入れる。認証は ANTHROPIC_API_KEY か `ant auth login` のプロファイル。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { parseDocument, YAMLSeq } from "yaml";
import { z } from "zod";
import type { Question } from "../../src/content/schema";
import { loadContent } from "../content";
import { americanIssues, loadSpellingTable } from "../levels/american";
import { lookup } from "../levels/analyze";
import { loadWordList } from "../levels/wordlist";
import { candidateHeadwords, requestPrompt, retryPrompt, systemPrompt, usedHeadwords, validateItem, type DraftItem } from "./draft";

const MODEL = "claude-opus-5-5";
/** 料金の目安（$ / 100 万トークン）。https://www.anthropic.com/pricing */
const PRICE = { input: 4, output: 20 };
const PER_REQUEST = 10; // 1 回で作る文の数
const OFFER = 3; // 1 文あたり何語の候補から選ばせるか
const RETRIES = 2; // 不合格の文を直させる回数

const root = resolve(import.meta.dirname, "..", "..");
const argv = process.argv.slice(2);
const arg = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const levelId = arg("--level");
const target = Number(arg("--count") ?? 100);
const dryRun = argv.includes("--dry-run");

const { config, sets, errors } = loadContent(join(root, "content"));
if (errors.length || !config) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}
const criteria = levelId ? config.levels[levelId] : undefined;
if (!levelId || !criteria) {
  console.error(`--level に config.yaml の levels のどれかを指定してください: ${Object.keys(config.levels).join(", ")}`);
  process.exit(1);
}

const list = loadWordList(join(root, "content", "wordlists"));
const spelling = loadSpellingTable(join(root, "content", "wordlists"));
const outPath = join(root, "content", "questions", `${levelId}.yaml`);
const existing = sets.find((s) => s.id === levelId);
const have = existing?.questions.length ?? 0;
const need = Math.max(0, target - have);
const taken = usedHeadwords(sets, list);
// イギリス式の綴り（organise）やイギリス英語の語（parcel）は答えの候補にしない
const pool = candidateHeadwords(list, criteria, taken, Date.now() & 0xffff).filter((w) => !americanIssues(w, spelling).length);
console.log(`${levelId}（${criteria.title}）: いま ${have} 問、あと ${need} 問作ります。答えの候補 ${pool.length} 語（${criteria.answer.join("・")}、未使用）`);

if (dryRun) {
  console.log("\n--- system ---\n" + systemPrompt(criteria));
  console.log("\n--- user（1 回目の例）---\n" + requestPrompt(pool.slice(0, PER_REQUEST * OFFER), PER_REQUEST));
  process.exit(0);
}
if (!need) process.exit(0);

const Items = z.object({
  items: z.array(z.object({ headword: z.string(), answer: z.string(), sentence: z.string(), meaning: z.string(), translation: z.string() })),
});
const client = new Anthropic();
const usage = { input: 0, output: 0 };

async function ask(messages: Anthropic.Beta.BetaMessageParam[]): Promise<{ items: DraftItem[]; reply: Anthropic.Beta.BetaContentBlock[] }> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // 安全のための判定で断られたら、サーバー側で別のモデルが引き継ぐ
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(Items) },
    system: systemPrompt(criteria!),
    messages,
  });
  usage.input += res.usage.input_tokens;
  usage.output += res.usage.output_tokens;
  if (res.stop_reason === "refusal") throw new Error(`断られました: ${res.stop_details?.explanation ?? ""}`);
  if (res.stop_reason === "max_tokens") throw new Error("出力が長すぎて途中で切れました");
  return { items: res.parsed_output?.items ?? [], reply: res.content };
}

const accepted: { question: Question; headword: string }[] = [];
let rejected = 0;
while (accepted.length < need && pool.length) {
  const n = Math.min(PER_REQUEST, need - accepted.length);
  const offered = new Set(pool.splice(0, n * OFFER));
  const ctx = { list, spelling, criteria, offered, taken };
  // 同じ場面を繰り返さないよう、問題集にある文（今回作った分も）を見せる
  const existingSentences = [...(existing?.questions ?? []), ...accepted.map((a) => a.question)].map((q) => q.sentence);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: requestPrompt([...offered], n, existingSentences) }];

  let failed: { item: DraftItem; issues: string[] }[] = [];
  for (let round = 0; round <= RETRIES; round++) {
    const { items, reply } = await ask(messages);
    failed = [];
    for (const item of items) {
      const r = validateItem(item, ctx);
      if ("question" in r) {
        accepted.push({ question: r.question, headword: item.headword });
        taken.add(item.headword);
      } else failed.push({ item, issues: r.issues });
    }
    console.log(`  ${round ? `直し ${round} 回目` : "作成"}: ${items.length - failed.length} / ${items.length} 文が合格（計 ${accepted.length} / ${need}）`);
    if (!failed.length || round === RETRIES) break;
    // 同じ会話で直させる（どこがだめだったかを伝える）
    messages.push({ role: "assistant", content: reply }, { role: "user", content: retryPrompt(failed) });
  }
  rejected += failed.length;
}

// 問題集に追記する（無ければ作る）
const doc = existsSync(outPath)
  ? parseDocument(readFileSync(outPath, "utf8"))
  : parseDocument(`# 問題集: ${criteria.title}\n# npm run content:generate で作成。書式は docs/CONTENT.md を参照\nid: ${levelId}\ntitle: ${criteria.title}\nlevel: ${levelId}\nquestions: []\n`);
const seq = doc.get("questions") as YAMLSeq;
seq.flow = false;
const today = new Date().toISOString().slice(0, 10);
for (const { question, headword } of accepted) {
  seq.add(doc.createNode({ ...question, note: `自動生成 ${today} ${MODEL}: ${headword} [${lookup(headword, list).level}]` }));
}
writeFileSync(outPath, String(doc));

const cost = (usage.input * PRICE.input + usage.output * PRICE.output) / 1e6;
console.log(`✔ ${relative(process.cwd(), outPath)} に ${accepted.length} 問を追記しました（不合格で捨てた文 ${rejected}）`);
console.log(`  トークン: 入力 ${usage.input.toLocaleString()}・出力 ${usage.output.toLocaleString()}（約 $${cost.toFixed(2)}）`);
if (!config.questionSets.some((s) => s.id === levelId)) {
  console.log(`  確認したら config.yaml の questionSets に { id: ${levelId} } を入れると出題されます`);
}
