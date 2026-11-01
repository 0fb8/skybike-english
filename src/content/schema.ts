// 問題データと設定の「型」と「検証ルール」。
// ビルドスクリプト（scripts/build-content.ts）とゲーム本体の両方がこれを使う。
import { z } from "zod";
import { containsWord } from "./text";

/** キーボードで入力できる文字。入力方法を増やすときはここを広げる。 */
export const ANSWER_PATTERN = /^[a-z]+$/;

export const QuestionSchema = z
  .object({
    /** 書き取る綴り。例文に出てくる形のまま（例: postponed） */
    answer: z.string().regex(ANSWER_PATTERN, "answer は小文字 a-z のみ"),
    /** 読み上げる例文。answer を単語として含むこと */
    sentence: z.string().min(1),
    /** answer の意味（日本語） */
    meaning: z.string().min(1),
    /** 例文の和訳 */
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
    id: z.string().regex(/^[a-z0-9-]+$/, "id は小文字英数字とハイフンのみ"),
    title: z.string().min(1),
    description: z.string().optional(),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict();

export const ConfigSchema = z
  .object({
    questionSets: z.array(z.object({ id: z.string(), enabled: z.boolean().default(true) }).strict()).min(1),
    questionsPerLeg: z.number().int().min(1).max(200),
    order: z.enum(["shuffle", "sequential"]),
    display: z
      .object({
        sentence: z.enum(["blank", "hidden"]),
        showLetterCount: z.boolean(),
        showMeaning: z.boolean(),
        showReview: z.boolean(),
        reviewMs: z.number().int().min(0),
      })
      .strict(),
    speech: z
      .object({
        rate: z.number().min(0.3).max(2),
        airshipRate: z.number().min(0.3).max(2),
        voice: z.array(z.string()).min(1),
      })
      .strict(),
    altitude: z
      .object({
        start: z.number().min(1).max(100),
        decayPerSec: z.number().min(0),
        decayIncreasePerLap: z.number().min(0),
        gainMax: z.number().min(0),
        gainMin: z.number().min(0),
        gainFalloffPerSec: z.number().min(0),
        wrongPenalty: z.number().min(0),
        passPenalty: z.number().min(0),
        crashSetback: z.number().min(0).max(1),
      })
      .strict(),
    airship: z
      .object({
        probability: z.number().min(0).max(1),
        boostSeconds: z.number().min(0),
        multiplier: z.number().int().min(1),
        showMeaning: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionSet = z.infer<typeof QuestionSetSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/** ビルド後にブラウザへ配る形 */
export interface Manifest {
  config: Config;
  sets: { id: string; title: string; description?: string; count: number; file: string; enabled: boolean }[];
}

