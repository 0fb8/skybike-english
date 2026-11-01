// Amazon Polly。認証情報は AWS SDK の標準の探し方に従う（環境変数・~/.aws・CI の OIDC ロールなど）。
import { PollyClient, SynthesizeSpeechCommand, type Engine, type LanguageCode, type VoiceId } from "@aws-sdk/client-polly";
import type { TtsVoice } from "../../src/content/schema";
import type { TtsProvider, TtsResult } from "./provider";

export class PollyProvider implements TtsProvider {
  private client: PollyClient;

  constructor(region: string) {
    // 応答が返らないまま止まらないよう待ち時間に上限を付け、一時的な失敗（接続の切断など）は SDK に再試行させる
    this.client = new PollyClient({ region, maxAttempts: 5, requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000 } });
  }

  async synthesize(text: string, voice: TtsVoice): Promise<TtsResult> {
    const base = {
      Text: text,
      VoiceId: voice.voiceId as VoiceId,
      Engine: voice.engine as Engine,
      LanguageCode: voice.languageCode as LanguageCode | undefined,
    };
    // 生成（generative）エンジンは単語ごとの時刻（speech marks）を出せない
    const wantMarks = voice.engine !== "generative";
    const [audio, marks] = await Promise.all([
      this.client.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "mp3", SampleRate: "24000" })),
      wantMarks ? this.client.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "json", SpeechMarkTypes: ["word"] })) : undefined,
    ]);
    if (!audio.AudioStream) throw new Error("Polly から音声が返りませんでした");
    return {
      audio: await audio.AudioStream.transformToByteArray(),
      marks: marks?.AudioStream ? await marks.AudioStream.transformToString() : undefined,
    };
  }
}
