// Amazon Polly。認証情報は AWS SDK の標準の探し方に従う（環境変数・~/.aws・CI の OIDC ロールなど）。
import { PollyClient, SynthesizeSpeechCommand, type Engine, type LanguageCode, type VoiceId } from "@aws-sdk/client-polly";
import type { TtsVoice } from "../../src/content/schema";
import type { TtsProvider, TtsResult } from "./provider";

export class PollyProvider implements TtsProvider {
  private client: PollyClient;

  constructor(region: string) {
    this.client = new PollyClient({ region });
  }

  async synthesize(text: string, voice: TtsVoice): Promise<TtsResult> {
    const base = {
      Text: text,
      VoiceId: voice.voiceId as VoiceId,
      Engine: voice.engine as Engine,
      LanguageCode: voice.languageCode as LanguageCode | undefined,
    };
    const [audio, marks] = await Promise.all([
      this.client.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "mp3", SampleRate: "24000" })),
      this.client.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "json", SpeechMarkTypes: ["word"] })),
    ]);
    if (!audio.AudioStream) throw new Error("Polly から音声が返りませんでした");
    return {
      audio: await audio.AudioStream.transformToByteArray(),
      marks: marks.AudioStream ? await marks.AudioStream.transformToString() : undefined,
    };
  }
}
