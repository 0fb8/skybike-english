// どの声で読むかを決める（DOM に依存しない。テスト対象）
import type { Config, PlayQuestion } from "../content/schema";

/** 都市のなまり（優先順）のうち、事前生成の声が設定されている最初のもの */
export function ttsAccent(cityAccents: string[], config: Config): string | undefined {
  const accents = config.speech.tts?.accents ?? {};
  return cityAccents.find((l) => l in accents);
}

/** 通常の出題で読む人物を、その問題で音声を作ってある人物からランダムに選ぶ。無ければ undefined */
export function pickSpeaker(q: PlayQuestion, random: () => number = Math.random): string | undefined {
  const names = Object.keys(q.audio?.speakers ?? {});
  return names.length ? names[Math.floor(random() * names.length)] : undefined;
}

/**
 * 再生する音声ファイル。無ければ undefined（ブラウザの声で読む）。
 * 通常は speaker の声、飛行船ではなまりの声（なまりの音声が無ければブラウザの声でなまりを試みる）。
 */
export function audioUrl(q: PlayQuestion, airship: boolean, accent: string | undefined, speaker: string | undefined): string | undefined {
  if (!airship) return speaker ? q.audio?.speakers?.[speaker] : undefined;
  return accent ? q.audio?.accents?.[accent] : undefined;
}

/** 飛行船で出せる問題（そのなまりの音声がある問題）を選ぶ。無ければ undefined */
export function pickAccentQuestion(pool: Iterable<PlayQuestion>, accent: string | undefined, random: () => number = Math.random): PlayQuestion | undefined {
  if (!accent) return undefined;
  const candidates = [...pool].filter((q) => q.audio?.accents?.[accent]);
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : undefined;
}
