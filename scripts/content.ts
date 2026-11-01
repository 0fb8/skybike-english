// content/ 以下の YAML を読み込み、検証する（ファイル出力はしない）。
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import YAML from "yaml";
import { ConfigSchema, QuestionSetSchema, type Config, type QuestionSet } from "../src/content/schema";

export interface ContentResult {
  config?: Config;
  sets: QuestionSet[];
  errors: string[];
  warnings: string[];
}

export function loadContent(contentDir: string): ContentResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sets: QuestionSet[] = [];
  const failed = new Set<string>(); // 読み込みに失敗した問題集（存在はする）
  const rel = (p: string) => relative(process.cwd(), p) || p;

  // --- config ---
  let config: Config | undefined;
  const configPath = rel(join(contentDir, "config.yaml"));
  try {
    const parsed = ConfigSchema.safeParse(YAML.parse(readFileSync(configPath, "utf8")));
    if (parsed.success) config = parsed.data;
    else errors.push(...formatIssues(configPath, parsed.error.issues));
  } catch (e) {
    errors.push(`${configPath}: ${(e as Error).message}`);
  }

  // --- question sets ---
  const qDir = join(contentDir, "questions");
  const files = readdirSync(qDir).filter((f) => /\.ya?ml$/.test(f)).sort();
  for (const f of files) {
    const path = rel(join(qDir, f));
    const fileId = basename(f).replace(/\.ya?ml$/, "");
    let raw: unknown;
    try {
      raw = YAML.parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${path}: YAML の書式エラー: ${(e as Error).message}`);
      failed.add(fileId);
      continue;
    }
    const parsed = QuestionSetSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...formatIssues(path, parsed.error.issues));
      failed.add(fileId);
      continue;
    }
    const set = parsed.data;
    if (set.id !== fileId) errors.push(`${path}: id "${set.id}" がファイル名 "${fileId}" と一致しません`);

    sets.push(set);
  }

  // --- cross checks ---
  const ids = new Set(sets.map((s) => s.id));
  if (ids.size !== sets.length) errors.push("問題集の id が重複しています");
  if (config) {
    for (const s of config.questionSets) {
      if (!ids.has(s.id) && !failed.has(s.id)) errors.push(`config.yaml: questionSets の "${s.id}" に対応する content/questions/${s.id}.yaml がありません`);
    }
    for (const id of ids) {
      if (!config.questionSets.some((s) => s.id === id)) warnings.push(`content/questions/${id}.yaml は config.yaml の questionSets に入っていないため出題されません`);
    }
  }
  const byAnswer = new Map<string, string>();
  for (const s of sets) for (const q of s.questions) {
    const prev = byAnswer.get(q.answer);
    if (prev && prev !== s.id) warnings.push(`answer "${q.answer}" が ${prev} と ${s.id} の両方にあります`);
    byAnswer.set(q.answer, s.id);
  }

  return { config, sets, errors, warnings };
}

function formatIssues(path: string, issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((i) => `${path}: ${i.path.length ? i.path.map(String).join(".") + ": " : ""}${i.message}`);
}
