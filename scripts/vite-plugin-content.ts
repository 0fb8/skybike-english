// content/*.yaml を検証して、ゲームから `import { config, sets } from "virtual:content"` で読めるようにする。
// - 問題集ごとに別チャンクになり、使うときに読み込まれる（問題集が増えても初回の読み込みは軽いまま）
// - 音声（npm run tts）の URL を問題に付ける。無い問題はブラウザの声で読む
//   - speech.tts.storage（S3）があれば、全部の音声に配信元の URL を付ける（CI が公開前に生成するので、
//     ここでは S3 を見に行かない。万一無くても再生に失敗してブラウザの声に切り替わる）
//   - 無ければ audio/ にある生成済みの音声だけを import してビルドに含める
// - 開発中は YAML の保存や音声の生成でページが再読み込みされ、エラーは画面に表示される
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { questionKey, type Config, type PlayQuestion } from "../src/content/schema";
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
      const remote = r.config?.speech.tts?.storage !== undefined;
      const all = r.config ? audioJobs(r.config, r.sets) : [];
      const audio = remote ? all : all.filter((j) => existsSync(join(audioDir, `${j.hash}.mp3`)));
      cache = { ...r, audio };
    }
    if (cache.errors.length || !cache.config) {
      throw new Error(`問題データに ${cache.errors.length} 件のエラーがあります:\n` + cache.errors.join("\n"));
    }
    return { ...cache, config: cache.config };
  };

  /**
   * 問題集のモジュール。音声の URL は、S3 なら配信元の URL をそのまま、audio/ なら import してビルドに含める
   * （どちらもファイル名にハッシュが入っていて、長期キャッシュできる）
   */
  const setModule = (setId: string) => {
    const { config, sets, audio } = content();
    const s = sets.find((x) => x.id === setId);
    if (!s) throw new Error(`問題集 "${setId}" がありません`);

    const baseUrl = config.speech.tts?.storage?.baseUrl;
    const imports = new Map<string, string>(); // hash → 変数名
    const ref = (hash: string) => {
      if (baseUrl) return JSON.stringify(`${baseUrl}/${AUDIO_DIR}/${hash}.mp3`);
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
      return `export const config = ${JSON.stringify(clientConfig(config))};\nexport const sets = [\n${entries.join(",\n")}\n];\n`;
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

/** ブラウザへ配る設定。音声の置き場所（バケット名）はゲームには要らないので含めない（配信 URL は問題の音声に付く） */
function clientConfig(config: Config): Config {
  const tts = config.speech.tts;
  if (!tts?.storage) return config;
  const { storage: _storage, ...rest } = tts;
  return { ...config, speech: { ...config.speech, tts: rest } };
}
