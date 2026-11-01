// content/*.yaml を検証する（CI 用）。ゲームへの取り込みは vite のプラグイン（scripts/vite-plugin-content.ts）が行う。
//   npm run content:check
import { join, resolve } from "node:path";
import { loadContent } from "./content";

const root = resolve(import.meta.dirname, "..");
const { config, sets, errors, warnings } = loadContent(join(root, "content"));

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length || !config) {
  for (const e of errors) console.error(`✖ ${e}`);
  console.error(`\n問題データに ${errors.length} 件のエラーがあります。`);
  process.exit(1);
}

const total = sets.reduce((n, s) => n + s.questions.length, 0);
console.log(`✔ 設定と問題集 ${sets.length} 件（計 ${total} 問）を検証しました`);
