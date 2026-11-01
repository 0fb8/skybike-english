// content/*.yaml を検証して、ゲームから `import { config, sets } from "virtual:content"` で読めるようにする。
// - 問題集ごとに別チャンクになり、使うときに読み込まれる（問題集が増えても初回の読み込みは軽いまま）
// - 生成済みの音声（audio/、npm run tts）があれば問題に URL を付ける。無い問題はブラウザの声で読む
// - 開発中は YAML の保存や音声の生成でページが再読み込みされ、エラーは画面に表示される
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { questionKey, type PlayQuestion } from "../src/content/schema";
import { loadContent, type ContentResult } from "./content";
import { AUDIO_DIR, audioJobs, type AudioJob } from "./tts/jobs";

const MAIN_ID = "virtual:content";
const SET_ID = "virtual:content/set/";
const RESOLVED = "\0" + MAIN_ID;

export function contentPlugin(opts: { root?: string; contentDir?: string; audioDir?: string } = {}): Plugin {
  const root = resolve(opts.root ?? ".");
  const contentDir = resolve(root, opts.contentDir ?? "content");
  const audioDir = resolve(root, opts.audioDir ?? AUDIO_DIR);
  let cache: (ContentResult & { audio: AudioJob[] }) | undefined;

  const content = () => {
    if (!cache) {
      const r = loadContent(contentDir);
      // 生成済みの音声だけを使う
      const audio = r.config ? audioJobs(r.config, r.sets).filter((j) => existsSync(join(audioDir, `${j.hash}.mp3`))) : [];
      cache = { ...r, audio };
    }
    if (cache.errors.length || !cache.config) {
      throw new Error(`問題データに ${cache.errors.length} 件のエラーがあります:\n` + cache.errors.join("\n"));
    }
    return { ...cache, config: cache.config };
  };

  /** 問題集のモジュール。音声は import してビルドに含める（ファイル名にハッシュが付き、長期キャッシュできる） */
  const setModule = (setId: string) => {
    const { sets, audio } = content();
    const s = sets.find((x) => x.id === setId);
    if (!s) throw new Error(`問題集 "${setId}" がありません`);

    const imports = new Map<string, string>(); // hash → 変数名
    const ref = (hash: string) => {
      if (!imports.has(hash)) imports.set(hash, `a${imports.size}`);
      return imports.get(hash)!;
    };
    const items = s.questions.map(({ id, note: _note, ...q }) => {
      const key = `${setId}/${questionKey({ id, answer: q.answer })}`;
      const question: PlayQuestion = { ...q, setId, key };
      const mine = audio.filter((j) => j.key === key);
      const entries = (kind: AudioJob["kind"]) =>
        mine.filter((j) => j.kind === kind).map((j) => `${JSON.stringify(j.slot)}: ${ref(j.hash)}`);
      const speakers = entries("speaker"), accents = entries("accent");
      if (!speakers.length && !accents.length) return JSON.stringify(question);
      return `{ ...${JSON.stringify(question)}, audio: { speakers: { ${speakers.join(", ")} }, accents: { ${accents.join(", ")} } } }`;
    });
    // ?no-inline: 短い音声も data URL にせず別ファイルにする
    const head = [...imports].map(([hash, v]) => `import ${v} from ${JSON.stringify(`/${AUDIO_DIR}/${hash}.mp3?no-inline`)};`);
    return `${head.join("\n")}\nexport default [\n${items.join(",\n")}\n];\n`;
  };

  return {
    name: "skybike-content",

    resolveId(id) {
      if (id === MAIN_ID || id.startsWith(SET_ID)) return "\0" + id;
    },

    load(id) {
      if (!id.startsWith(RESOLVED)) return;
      if (id !== RESOLVED) return setModule(id.slice(("\0" + SET_ID).length));

      const { config, sets } = content();
      const entries = config.questionSets.map(({ id: setId, enabled }) => {
        const s = sets.find((x) => x.id === setId)!;
        const meta = { id: setId, title: s.title, description: s.description, count: s.questions.length, enabled };
        return `{ ...${JSON.stringify(meta)}, load: () => import(${JSON.stringify(SET_ID + setId)}).then((m) => m.default) }`;
      });
      return `export const config = ${JSON.stringify(config)};\nexport const sets = [\n${entries.join(",\n")}\n];\n`;
    },

    configureServer(server: ViteDevServer) {
      const watched = [contentDir, audioDir];
      server.watcher.add(watched);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onChange = (file: string) => {
        if (!watched.some((d) => file === d || file.startsWith(d + sep))) return;
        cache = undefined;
        // 音声の生成中は大量に変更が来るのでまとめて 1 回だけ再読み込みする
        clearTimeout(timer);
        timer = setTimeout(() => {
          for (const [id, mod] of server.moduleGraph.idToModuleMap) {
            if (id.startsWith(RESOLVED)) server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: "full-reload" });
        }, 300);
      };
      server.watcher.on("add", onChange).on("change", onChange).on("unlink", onChange);
    },
  };
}
