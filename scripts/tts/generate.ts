// content/ の例文から音声ファイルを事前生成する（まだ無いものだけ）。
//   npm run tts               … 足りない音声を生成する（クラウド TTS の認証情報が必要）
//   npm run tts -- --dry-run  … 生成せず、作るファイル数と文字数だけ表示する
//   npm run tts -- --prune    … 生成に加えて、もう使われていないファイルを消す
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadContent } from "../content";
import { AUDIO_DIR, audioJobs, type AudioJob } from "./jobs";
import { createProvider } from "./provider";

const CONCURRENCY = 4;
const root = resolve(import.meta.dirname, "..", "..");
const dir = join(root, AUDIO_DIR);
const args = new Set(process.argv.slice(2));

const { config, sets, errors } = loadContent(join(root, "content"));
if (errors.length || !config) {
  for (const e of errors) console.error(`✖ ${e}`);
  console.error("問題データにエラーがあるため音声を生成できません（npm run content:check）");
  process.exit(1);
}
const tts = config.speech.tts;
if (!tts) {
  console.log("config.yaml に speech.tts が無いため、音声は生成しません（ブラウザの声で読み上げます）");
  process.exit(0);
}

const jobs = audioJobs(config, sets);
const unique = jobs.filter((j, i) => jobs.findIndex((x) => x.hash === j.hash) === i);
const missing = unique.filter((j) => !existsSync(join(dir, `${j.hash}.mp3`)));
const chars = missing.reduce((n, j) => n + j.text.length, 0);
console.log(`音声 ${unique.length} 件のうち未生成 ${missing.length} 件（${chars.toLocaleString()} 文字）`);

if (args.has("--dry-run")) {
  const bySlot = new Map<string, number>();
  for (const j of missing) bySlot.set(j.slot, (bySlot.get(j.slot) ?? 0) + 1);
  for (const [slot, n] of bySlot) console.log(`  ${slot}: ${n} 件`);
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
if (missing.length) {
  const provider = await createProvider(tts);
  let done = 0, failed = 0;
  const queue = [...missing];
  const worker = async () => {
    for (let j: AudioJob | undefined; (j = queue.shift()); ) {
      try {
        const r = await provider.synthesize(j.text, j.voice);
        // 書きかけのファイルを「生成済み」と誤認しないよう、書き終えてから名前を付ける
        const tmp = join(dir, `${j.hash}.mp3.tmp`);
        writeFileSync(tmp, r.audio);
        if (r.marks !== undefined) writeFileSync(join(dir, `${j.hash}.marks.jsonl`), r.marks);
        renameSync(tmp, join(dir, `${j.hash}.mp3`));
        done++;
      } catch (e) {
        failed++;
        console.error(`✖ ${j.key} (${j.slot}, ${j.voice.voiceId}): ${(e as Error).message}`);
        if (failed === 1 && /credential|security token|not authorized|AccessDenied/i.test(String(e))) {
          console.error("  → クラウド TTS の認証情報を確認してください（README「音声の生成」）");
          queue.length = 0;
        }
      }
      if ((done + failed) % 20 === 0) console.log(`  … ${done + failed} / ${missing.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`✔ ${done} 件を生成しました${failed ? `（${failed} 件失敗）` : ""}`);
  if (failed) process.exitCode = 1;
}

const keep = new Set(unique.map((j) => j.hash));
let size = 0, files = 0, stale = 0;
for (const f of readdirSync(dir)) {
  const hash = f.split(".")[0];
  if (!keep.has(hash)) {
    stale++;
    if (args.has("--prune")) rmSync(join(dir, f));
    continue;
  }
  if (f.endsWith(".mp3")) { files++; size += statSync(join(dir, f)).size; }
}
console.log(`${AUDIO_DIR}/: 音声 ${files} 件・${(size / 1024 / 1024).toFixed(1)} MB` +
  (stale ? `、使われていないファイル ${stale} 件${args.has("--prune") ? "を削除しました" : "（--prune で削除）"}` : ""));
