// content/*.yaml を検証して public/data/ に JSON を書き出す。
//   npm run content          … 検証して書き出す
//   npm run content -- --check … 検証だけ（CI 用）
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Manifest } from "../src/content/schema";
import { loadContent } from "./content";

const root = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const { config, sets, errors, warnings } = loadContent(join(root, "content"));

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length || !config) {
  for (const e of errors) console.error(`✖ ${e}`);
  console.error(`\n問題データに ${errors.length} 件のエラーがあります。`);
  process.exit(1);
}

const total = sets.reduce((n, s) => n + s.questions.length, 0);
console.log(`✔ 設定と問題集 ${sets.length} 件（計 ${total} 問）を検証しました`);
if (checkOnly) process.exit(0);

const out = join(root, "public", "data");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "questions"), { recursive: true });

const manifest: Manifest = {
  config,
  sets: config.questionSets.map(({ id, enabled }) => {
    const s = sets.find((x) => x.id === id)!;
    return { id, title: s.title, description: s.description, count: s.questions.length, file: `data/questions/${id}.json`, enabled };
  }),
};
for (const s of sets) {
  const questions = s.questions.map(({ note: _note, ...q }) => q); // メモは配信しない
  writeFileSync(join(out, "questions", `${s.id}.json`), JSON.stringify(questions));
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`→ public/data/ に書き出しました`);
