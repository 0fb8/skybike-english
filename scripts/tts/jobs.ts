// どの問題をどの声で読むか（＝生成する音声ファイルの一覧）を決める。
// 生成スクリプトと vite のプラグインの両方が使うので、同じ入力からは必ず同じ結果になること。
import { createHash } from "node:crypto";
import { questionKey, type Config, type QuestionSet, type TtsConfig, type TtsVoice } from "../../src/content/schema";

/** 生成した音声の置き場所（リポジトリ直下。git には含めない） */
export const AUDIO_DIR = "audio";
const FORMAT = { outputFormat: "mp3", sampleRate: "24000" } as const;

export interface AudioJob {
  /** PlayQuestion.key */
  key: string;
  /** "default" かなまりの言語コード */
  slot: string;
  text: string;
  voice: TtsVoice;
  /** ファイル名（文・声・形式から決まる。どれかが変われば別ファイル） */
  hash: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function audioHash(text: string, voice: TtsVoice, provider: TtsConfig["provider"]): string {
  return sha(JSON.stringify({ provider, text, voice, ...FORMAT })).slice(0, 20);
}

export function audioJobs(config: Config, sets: QuestionSet[]): AudioJob[] {
  const tts = config.speech.tts;
  if (!tts) return [];
  const questions = config.questionSets.flatMap(({ id }) =>
    (sets.find((s) => s.id === id)?.questions ?? []).map((q) => ({ key: `${id}/${questionKey(q)}`, text: q.sentence })),
  );
  const job = (q: { key: string; text: string }, slot: string, voice: TtsVoice): AudioJob =>
    ({ key: q.key, slot, text: q.text, voice, hash: audioHash(q.text, voice, tts.provider) });

  const jobs = questions.map((q) => job(q, "default", tts.default));
  for (const [locale, voice] of Object.entries(tts.accents)) {
    // 通常の声と同じなら追加のファイルは要らないので全問を対象にする
    const same = audioHash("", voice, tts.provider) === audioHash("", tts.default, tts.provider);
    const picked = same ? questions : pickForAccent(questions, locale, tts.accentQuestions);
    jobs.push(...picked.map((q) => job(q, locale, voice)));
  }
  return jobs;
}

/**
 * なまり用の問題を選ぶ。問題の識別子とのハッシュ順で選ぶので、問題を追加・削除しても
 * 他の問題の当落はほとんど変わらない（作り直すファイルが少なくて済む）。
 */
export function pickForAccent<T extends { key: string }>(questions: T[], locale: string, n: number): T[] {
  return questions
    .map((q) => ({ q, rank: sha(`${locale}\0${q.key}`) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : 1))
    .slice(0, n)
    .map((x) => x.q);
}
