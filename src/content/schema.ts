// 問題データと設定の「型」と「検証ルール」。
// ビルドスクリプト（scripts/build-content.ts）とゲーム本体の両方がこれを使う。
import { z } from "zod";
import { containsWord } from "./text";

/** キーボードで入力できる文字。入力方法を増やすときはここを広げる。 */
export const ANSWER_PATTERN = /^[a-z]+$/;
/** 例文に使える文字。英字は入力し、空白と記号は自動で埋まる（数字などは入力できないので使わない） */
export const SENTENCE_PATTERN = /^[A-Za-z .,?!;:'"-]+$/;

/** 問題集 id・問題 id に使える文字 */
const ID_PATTERN = /^[a-z0-9-]+$/;

export const QuestionSchema = z
  .object({
    /**
     * 任意: 問題の識別子。省略すると answer が識別子になる。
     * 進行状況や学習履歴はこの識別子にひもづくので、問題の並べ替えや例文の修正では変わらない。
     * 同じ問題集で同じ answer を別の例文で出したいときだけ付ける。
     */
    id: z.string().regex(ID_PATTERN, "id は小文字英数字とハイフンのみ").optional(),
    /** 例文の中の重要語。例文に出てくる形のまま（例: postponed）。解答後に強調表示する */
    answer: z.string().regex(ANSWER_PATTERN, "answer は小文字 a-z のみ"),
    /** 読み上げて、まるごと書き取らせる例文。answer を単語として含むこと */
    sentence: z.string().regex(SENTENCE_PATTERN, "sentence に使えるのは英字・空白と . , ? ! ; : ' \" - だけです（数字は英語で書く）"),
    /** answer の意味（日本語。正解後に表示） */
    meaning: z.string().min(1),
    /** 例文の和訳（正解後に表示） */
    translation: z.string().min(1),
    /** 任意: 分類用のタグ */
    tags: z.array(z.string()).optional(),
    /** 任意: 自分用メモ（ゲームには表示しない） */
    note: z.string().optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (!containsWord(q.sentence, q.answer)) {
      ctx.addIssue({
        code: "custom",
        message: `sentence に answer "${q.answer}" が単語として含まれていません`,
        path: ["sentence"],
      });
    }
  });

export const QuestionSetSchema = z
  .object({
    id: z.string().regex(ID_PATTERN, "id は小文字英数字とハイフンのみ"),
    title: z.string().min(1),
    description: z.string().optional(),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict()
  .superRefine((set, ctx) => {
    const seen = new Map<string, number>();
    set.questions.forEach((q, i) => {
      const key = questionKey(q);
      const prev = seen.get(key);
      if (prev !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `識別子 "${key}" が questions.${prev} と重複しています（同じ answer を別の例文で使うときは id を付けてください）`,
          path: ["questions", i],
        });
      }
      seen.set(key, i);
    });
  });

/** クラウド TTS の声。値は各サービスの指定そのまま（Polly: VoiceId / Engine / LanguageCode） */
export const TtsVoiceSchema = z
  .object({
    voiceId: z.string().min(1),
    engine: z.enum(["standard", "neural", "long-form", "generative"]).default("neural"),
    languageCode: z.string().optional(),
  })
  .strict();

/** 事前生成する音声の設定（scripts/tts/）。無ければ従来どおりブラウザの音声だけで読み上げる */
export const TtsSchema = z
  .object({
    provider: z.literal("polly"),
    region: z.string().default("us-east-1"),
    /** 通常の出題で読む人物（名前 → 声）。毎問この中からランダムに1人が読む */
    speakers: z
      .record(z.string().regex(ID_PATTERN, "人物の名前は小文字英数字とハイフンのみ"), TtsVoiceSchema)
      .refine((r) => Object.keys(r).length > 0, "speakers には1人以上書いてください"),
    /** 飛行船（なまり）用の声。キーは data/route.ts の accent と同じ言語コード */
    accents: z.record(z.string(), TtsVoiceSchema).default({}),
    /** なまりごとに音声を作る問題数（全問ぶん作ると容量が大きくなるため） */
    accentQuestions: z.number().int().min(0).default(20),
    /**
     * 任意: 音声の置き場所（S3 と、その配信 URL）。値は infra/ の `cdk deploy` の出力を書く。
     * 無ければリポジトリ直下の audio/ に置き、ビルドに含めて配信する。
     */
    storage: z
      .object({
        bucket: z.string().min(1),
        /** 配信元の URL（例: https://xxxx.cloudfront.net）。音声は <baseUrl>/audio/<ハッシュ>.mp3 */
        baseUrl: z.string().regex(/^https:\/\/[^/]+$/, "baseUrl は https://<ドメイン> の形で書いてください（末尾の / やパスは不要）"),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    questionSets: z.array(z.object({ id: z.string(), enabled: z.boolean().default(true) }).strict()).min(1),
    questionsPerLeg: z.number().int().min(1).max(200),
    order: z.enum(["shuffle", "sequential"]),
    display: z
      .object({
        /** 出題中、まだ書いていない部分を "_" で見せる（単語の長さと記号がわかる） */
        showLetterCount: z.boolean(),
        showReview: z.boolean(),
        reviewMs: z.number().int().min(0),
      })
      .strict(),
    speech: z
      .object({
        rate: z.number().min(0.3).max(2),
        airshipRate: z.number().min(0.3).max(2),
        /** ブラウザの音声で読むときの言語（音声ファイルが無いときに使う） */
        voice: z.array(z.string()).min(1),
        tts: TtsSchema.optional(),
      })
      .strict(),
    altitude: z
      .object({
        start: z.number().min(1).max(100),
        decayPerSec: z.number().min(0),
        decayIncreasePerLap: z.number().min(0),
        gainPerLetter: z.number().min(0),
      })
      .strict(),
    airship: z
      .object({
        probability: z.number().min(0).max(1),
        boostSeconds: z.number().min(0),
        multiplier: z.number().int().min(1),
      })
      .strict(),
  })
  .strict();

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionSet = z.infer<typeof QuestionSetSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type TtsConfig = z.infer<typeof TtsSchema>;
export type TtsVoice = z.infer<typeof TtsVoiceSchema>;

/** 問題集の中での問題の識別子 */
export function questionKey(q: Pick<Question, "id" | "answer">): string {
  return q.id ?? q.answer;
}

/** ブラウザへ配る問題。key は全問題集を通して一意（"<問題集id>/<問題の識別子>"） */
export type PlayQuestion = Omit<Question, "id" | "note"> & {
  key: string;
  setId: string;
  /** 事前生成した音声の URL（生成済みのものだけ） */
  audio?: QuestionAudio;
};

export interface QuestionAudio {
  /** 通常の出題で読む人物の名前 → URL */
  speakers?: Record<string, string>;
  /** なまり（言語コード）→ URL */
  accents?: Record<string, string>;
}

/** ブラウザへ配る問題集の一覧。問題本体は load() で必要になったときに読み込む */
export interface SetEntry {
  id: string;
  title: string;
  description?: string;
  count: number;
  /** config.yaml での初期状態 */
  enabled: boolean;
  load: () => Promise<PlayQuestion[]>;
}

