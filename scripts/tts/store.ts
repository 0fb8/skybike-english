// 生成した音声の置き場所。config.yaml の speech.tts.storage があれば S3、無ければリポジトリ直下の audio/。
// どちらもファイル名は "<ハッシュ>.mp3" / "<ハッシュ>.marks.jsonl" で、置き場所の中で同じ名前の中身は変わらない。
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TtsConfig } from "../../src/content/schema";
import { AUDIO_DIR } from "./jobs";

export interface AudioStore {
  /** 人に見せる置き場所の名前 */
  readonly label: string;
  /** 置いてあるファイル名 → バイト数 */
  list(): Promise<Map<string, number>>;
  put(name: string, body: Uint8Array | string): Promise<void>;
  remove(names: string[]): Promise<void>;
}

export async function createStore(tts: TtsConfig, root: string): Promise<AudioStore> {
  if (tts.storage) {
    const { S3Store } = await import("./s3");
    return new S3Store(tts.region, tts.storage.bucket, AUDIO_DIR);
  }
  return new LocalStore(join(root, AUDIO_DIR));
}

export class LocalStore implements AudioStore {
  readonly label: string;
  constructor(private dir: string) {
    this.label = `${AUDIO_DIR}/`;
  }

  async list() {
    const r = new Map<string, number>();
    if (!existsSync(this.dir)) return r;
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".tmp")) r.set(f, statSync(join(this.dir, f)).size);
    }
    return r;
  }

  async put(name: string, body: Uint8Array | string) {
    mkdirSync(this.dir, { recursive: true });
    // 書きかけのファイルを「生成済み」と誤認しないよう、書き終えてから名前を付ける
    const tmp = join(this.dir, `${name}.tmp`);
    writeFileSync(tmp, body);
    renameSync(tmp, join(this.dir, name));
  }

  async remove(names: string[]) {
    for (const n of names) rmSync(join(this.dir, n), { force: true });
  }
}
