// Amazon Polly。認証情報は AWS SDK の標準の探し方に従う（環境変数・~/.aws・CI の OIDC ロールなど）。
import { PollyClient, SynthesizeSpeechCommand, type Engine, type LanguageCode, type VoiceId } from "@aws-sdk/client-polly";
import type { TtsVoice } from "../../src/content/schema";
import type { TtsProvider, TtsResult } from "./provider";

export class PollyProvider implements TtsProvider {
  private client: PollyClient;

  constructor(region: string) {
    // 応答が返らないまま止まらないよう待ち時間に上限を付け、一時的な失敗（接続の切断など）は SDK に再試行させる。
    // Polly の SDK は HTTP/2 を使い、既定では 1 本の接続に 1 リクエストだけ流す（disableConcurrentStreams）。
    // requestHandler を指定すると既定の設定が置き換わるので、これも書く（書かないと 1 本の接続に複数のリクエストが乗り、
    // その接続が切れたときにまとめて失敗する）
    this.client = new PollyClient({
      region,
      maxAttempts: 5,
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000, disableConcurrentStreams: true },
    });
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
