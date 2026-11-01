// content/ の例文から音声ファイルを事前生成する（まだ無いものだけ）。
// 置き場所は config.yaml の speech.tts.storage があれば S3、無ければリポジトリ直下の audio/。
//   npm run tts                      … 足りない音声を生成する（クラウド TTS の認証情報が必要。S3 なら S3 の権限も）
//   npm run tts -- --dry-run         … 生成せず、作るファイル数と文字数だけ表示する
//   npm run tts -- --prune           … 生成に加えて、もう使われていないファイルを消す
//   npm run tts -- --storage-only    … storage が設定されていなければ何もしない（CI 用。audio/ に作っても配信されないため）
import { join, resolve } from "node:path";
import { loadContent } from "../content";
import { audioJobs, type AudioJob } from "./jobs";
import { createProvider } from "./provider";
import { createStore } from "./store";

const CONCURRENCY = 4;
const root = resolve(import.meta.dirname, "..", "..");
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
if (args.has("--storage-only") && !tts.storage) {
  console.log("config.yaml に speech.tts.storage が無いため、音声は生成しません（ブラウザの声で読み上げます）");
  process.exit(0);
}

const store = await createStore(tts, root);
let existing: Map<string, number>;
try {
  existing = await store.list();
} catch (e) {
  console.error(`✖ ${store.label} の一覧を取得できませんでした: ${(e as Error).message}`);
  console.error("  → AWS の認証情報と、infra/ で作ったバケット名（config.yaml の speech.tts.storage.bucket）を確認してください");
  process.exit(1);
}

const jobs = audioJobs(config, sets);
const unique = jobs.filter((j, i) => jobs.findIndex((x) => x.hash === j.hash) === i);
const missing = unique.filter((j) => !existing.has(`${j.hash}.mp3`));
const chars = missing.reduce((n, j) => n + j.text.length, 0);
console.log(`${store.label}: 音声 ${unique.length} 件のうち未生成 ${missing.length} 件（${chars.toLocaleString()} 文字）`);

if (args.has("--dry-run")) {
  const bySlot = new Map<string, number>();
  for (const j of missing) bySlot.set(j.slot, (bySlot.get(j.slot) ?? 0) + 1);
  for (const [slot, n] of bySlot) console.log(`  ${slot}: ${n} 件`);
  process.exit(0);
}

if (missing.length) {
  const provider = await createProvider(tts);
  let done = 0, failed = 0;
  const queue = [...missing];
  const worker = async () => {
    for (let j: AudioJob | undefined; (j = queue.shift()); ) {
      try {
        const r = await provider.synthesize(j.text, j.voice);
        // mp3 があれば「生成済み」とみなすので、mp3 は最後に置く
        if (r.marks !== undefined) await store.put(`${j.hash}.marks.jsonl`, r.marks);
        await store.put(`${j.hash}.mp3`, r.audio);
        existing.set(`${j.hash}.mp3`, r.audio.byteLength);
        done++;
      } catch (e) {
        failed++;
        console.error(`✖ ${j.key} (${j.slot}, ${j.voice.voiceId}): ${(e as Error).message}`);
        if (failed === 1 && /credential|security token|not authorized|AccessDenied/i.test(String(e))) {
          console.error("  → AWS の認証情報と権限を確認してください（README「音声の生成」）");
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
let size = 0, files = 0;
const stale: string[] = [];
for (const [f, bytes] of existing) {
  if (!keep.has(f.split(".")[0])) { stale.push(f); continue; }
  if (f.endsWith(".mp3")) { files++; size += bytes; }
}
if (stale.length && args.has("--prune")) await store.remove(stale);
console.log(`${store.label}: 音声 ${files} 件・${(size / 1024 / 1024).toFixed(1)} MB` +
  (stale.length ? `、使われていないファイル ${stale.length} 件${args.has("--prune") ? "を削除しました" : "（--prune で削除）"}` : ""));
