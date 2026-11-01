// 音声合成サービスの差し替え口。サービスを変えるときはここに実装を足し、config.yaml の provider で選ぶ。
import type { TtsConfig, TtsVoice } from "../../src/content/schema";

export interface TtsResult {
  audio: Uint8Array;
  /** 単語ごとの時刻（JSON Lines）。対応していなければ undefined */
  marks?: string;
}

export interface TtsProvider {
  synthesize(text: string, voice: TtsVoice): Promise<TtsResult>;
}

export async function createProvider(tts: TtsConfig): Promise<TtsProvider> {
  switch (tts.provider) {
    case "polly": {
      const { PollyProvider } = await import("./polly");
      return new PollyProvider(tts.region);
    }
  }
}
