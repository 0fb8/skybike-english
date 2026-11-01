import { describe, expect, it } from "vitest";
import type { Config, PlayQuestion } from "../src/content/schema";
import { CRASH_MS, Game, type GameEvent } from "../src/game/game";
import { newProgress } from "../src/lib/quiz";

const config: Config = {
  questionSets: [{ id: "t", enabled: true }],
  questionsPerLeg: 2,
  order: "sequential",
  display: { sentence: "blank", showLetterCount: true, showMeaning: true, showReview: true, reviewMs: 1000 },
  speech: { rate: 1, airshipRate: 1, voice: ["en-US"] },
  altitude: { start: 50, decayPerSec: 10, decayIncreasePerLap: 0, gainMax: 20, gainMin: 5, gainFalloffPerSec: 1, wrongPenalty: 5, passPenalty: 12, crashSetback: 0.5 },
  airship: { probability: 0, boostSeconds: 10, multiplier: 2, showMeaning: false },
};
const q = (answer: string): PlayQuestion => ({ key: `t/${answer}`, setId: "t", answer, sentence: `I ${answer} it.`, meaning: "m", translation: "t" });

function setup(opts: { random?: number; questions?: PlayQuestion[]; config?: Config } = {}) {
  const events: GameEvent[] = [];
  const queue = [...(opts.questions ?? [q("ab"), q("cd"), q("ef")])];
  const game = new Game({
    config: opts.config ?? config, legs: [1000, 1000], progress: newProgress(),
    draw: () => queue.shift(), emit: (e) => events.push(e), random: () => opts.random ?? 0.99,
  });
  const type = (word: string, now: number) => { for (const ch of word) game.letter(ch, now); };
  const endSpeech = (now: number) => game.speechEnded(game.state.turn, now);
  return { game, events, type, endSpeech };
}

describe("Game", () => {
  it("スタートすると出題して読み上げを頼む", () => {
    const { game, events } = setup();
    game.start(0);
    expect(game.state.mode).toBe("play");
    expect(game.state.question?.answer).toBe("ab");
    expect(events).toContainEqual(expect.objectContaining({ type: "speak", first: true, turn: 1 }));
  });

  it("読み上げ中は高度が下がらず、終わってから下がる", () => {
    const { game, endSpeech } = setup();
    game.start(0);
    game.tick(1000, 1);
    expect(game.state.altitude).toBe(50);
    endSpeech(1000);
    game.tick(2000, 1);
    expect(game.state.altitude).toBe(40);
  });

  it("前の問題の読み上げ終了通知は無視する", () => {
    const { game, type } = setup();
    game.start(0);
    type("ab", 0);
    game.tick(5000, 0.01); // review 終了 → 次の問題
    game.speechEnded(1, 5000);
    expect(game.state.speaking).toBe(true);
  });

  it("間違えた文字は入らず、高度が下がる", () => {
    const { game, events, endSpeech } = setup();
    game.start(0); endSpeech(0);
    game.letter("x", 0);
    expect(game.state.typed).toBe("");
    expect(game.state.altitude).toBe(45);
    expect(events).toContainEqual({ type: "wrongLetter", letter: "x" });
  });

  it("正解すると高度が上がり、review を経て次の問題へ", () => {
    const { game, type, endSpeech } = setup();
    game.start(0); endSpeech(0);
    type("ab", 0);
    expect(game.state.mode).toBe("review");
    expect(game.state.altitude).toBe(70);
    expect(game.state.progress).toMatchObject({ answered: 1, correctFirst: 1, legDone: 1 });
    game.tick(999, 0);
    expect(game.state.mode).toBe("review");
    game.tick(1000, 0);
    expect(game.state.question?.answer).toBe("cd");
  });

  it("区間の問題数を解くと到着する", () => {
    const { game, type } = setup();
    game.start(0);
    type("ab", 0); game.tick(1000, 0);
    type("cd", 1000); game.tick(2000, 0);
    expect(game.state.mode).toBe("arrived");
    expect(game.state.progress.leg).toBe(1);
  });

  it("高度 0 で墜落し、進みが戻されてから再開する", () => {
    const { game, type, endSpeech } = setup();
    game.start(0);
    type("ab", 0); game.tick(1000, 0); // legDone 1
    endSpeech(1000);
    game.tick(1100, 10);
    expect(game.state.mode).toBe("crash");
    expect(game.state.progress.legDone).toBe(0);
    expect(game.state.result?.question.answer).toBe("cd");
    game.tick(1100 + CRASH_MS, 0);
    expect(game.state.mode).toBe("play");
    expect(game.state.altitude).toBe(50);
  });

  it("飛行船を正解するとスピードが倍になる", () => {
    const { game, type } = setup({ random: 0, config: { ...config, questionsPerLeg: 5, airship: { ...config.airship, probability: 1 } } });
    game.start(0);
    expect(game.state.isAirship).toBe(true);
    type("ab", 0);
    expect(game.isBoosting(5000)).toBe(true);
    game.tick(1000, 0);
    expect(game.state.isAirship).toBe(false); // ブースト中は飛行船が出ない
    type("cd", 1000);
    expect(game.state.progress.legDone).toBe(3);
  });

  it("パスすると答えを見せて高度が下がる", () => {
    const { game } = setup();
    game.start(0);
    game.pass(0);
    expect(game.state.result).toMatchObject({ ok: false });
    expect(game.state.altitude).toBe(38);
    expect(game.state.progress.answered).toBe(1);
  });

  it("問題が尽きたらメニューに戻る", () => {
    const { game, events } = setup({ questions: [] });
    game.start(0);
    expect(game.state.mode).toBe("idle");
    expect(events).toContainEqual({ type: "noQuestions" });
  });
});
