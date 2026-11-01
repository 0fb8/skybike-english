import { describe, expect, it } from "vitest";
import type { Config, PlayQuestion } from "../src/content/schema";
import { CRASH_MS, Game, type GameEvent } from "../src/game/game";
import { newProgress } from "../src/lib/quiz";

const config: Config = {
  questionSets: [{ id: "t", enabled: true }],
  questionsPerLeg: 2,
  order: "sequential",
  display: { showLetterCount: true, showReview: true, reviewMs: 1000 },
  speech: { rate: 1, airshipRate: 1, voice: ["en-US"] },
  altitude: { start: 50, decayPerSec: 10, decayIncreasePerLap: 0, gainPerLetter: 2 },
  airship: { probability: 0, boostSeconds: 10, multiplier: 2 },
  levels: {},
};
const q = (sentence: string): PlayQuestion => ({ key: `t/${sentence}`, setId: "t", answer: "a", sentence, meaning: "m", translation: "t" });

function setup(opts: { random?: number; questions?: PlayQuestion[]; config?: Config; legs?: number[] } = {}) {
  const events: GameEvent[] = [];
  const queue = [...(opts.questions ?? [q("I'm ok."), q("Go now!"), q("Yes, sir.")])];
  const game = new Game({
    config: opts.config ?? config, legs: opts.legs ?? [1000, 1000], progress: newProgress(),
    draw: () => queue.shift(), emit: (e) => events.push(e), random: () => opts.random ?? 0.99,
  });
  const type = (letters: string, now = 0) => { for (const ch of letters) game.letter(ch, now); };
  const endSpeech = () => game.speechEnded(game.state.turn);
  return { game, events, type, endSpeech };
}

describe("Game", () => {
  it("スタートすると出題して読み上げを頼む", () => {
    const { game, events } = setup();
    game.start(0);
    expect(game.state.mode).toBe("play");
    expect(game.state.target).toBe("imok");
    expect(events).toContainEqual(expect.objectContaining({ type: "speak", first: true, turn: 1 }));
  });

  it("例文の英字だけを書けば正解（大文字小文字・空白・記号は問わない）", () => {
    const { game, type } = setup();
    game.start(0);
    type("IMOK");
    expect(game.state.mode).toBe("review");
    expect(game.state.result?.ok).toBe(true);
  });

  it("正しい文字ごとに高度が上がる", () => {
    const { game, type } = setup();
    game.start(0);
    type("im");
    expect(game.state.altitude).toBe(54);
  });

  it("打ち間違えても高度は下がらず、文字も進まない", () => {
    const { game, events } = setup();
    game.start(0);
    game.letter("x", 0);
    expect(game.state.altitude).toBe(50);
    expect(game.state.typed).toBe(0);
    expect(events).toContainEqual({ type: "wrongLetter", letter: "x" });
  });

  it("読み上げ中は高度が下がらず、終わってから時間とともに下がる", () => {
    const { game, endSpeech } = setup();
    game.start(0);
    game.tick(1000, 1);
    expect(game.state.altitude).toBe(50);
    endSpeech();
    game.tick(2000, 1);
    expect(game.state.altitude).toBe(40);
  });

  it("前の問題の読み上げ終了通知は無視する", () => {
    const { game, type } = setup();
    game.start(0);
    type("imok");
    game.tick(1000, 0); // 次の問題
    game.speechEnded(1);
    expect(game.state.speaking).toBe(true);
  });

  it("ミスがあった正解はノーミス数に数えない", () => {
    const { game, type } = setup();
    game.start(0);
    type("ixmok");
    expect(game.state.progress).toMatchObject({ answered: 1, correctFirst: 0 });
  });

  it("区間の問題数を解くと到着し、次の都市が出発地になる", () => {
    const { game, type } = setup();
    game.start(0);
    type("imok"); game.tick(1000, 0);
    expect(game.state.legDone).toBe(1);
    type("gonow"); game.tick(2000, 0);
    expect(game.state.mode).toBe("arrived");
    expect(game.state.progress.leg).toBe(1);
  });

  it("最後の区間を終えると周回数が増える", () => {
    const { game, type } = setup({ legs: [1000] });
    game.start(0);
    type("imok"); game.tick(1000, 0);
    type("gonow"); game.tick(2000, 0);
    expect(game.state.progress).toMatchObject({ leg: 0, laps: 1 });
  });

  it("墜落するとその渡航は失敗してメニューに戻り、出発地は変わらない", () => {
    const { game, type, endSpeech } = setup();
    game.start(0);
    type("imok"); game.tick(1000, 0);
    endSpeech();
    game.tick(1100, 10);
    expect(game.state.mode).toBe("crash");
    expect(game.state.legDone).toBe(0);
    game.tick(1100 + CRASH_MS, 0);
    expect(game.state.mode).toBe("idle");
    expect(game.state.lastFlightFailed).toBe(true);
    expect(game.state.progress.leg).toBe(0);
    game.start(5000);
    expect(game.state).toMatchObject({ mode: "play", legDone: 0, altitude: 50, lastFlightFailed: false });
  });

  it("やめると途中の進みは失われる", () => {
    const { game, type } = setup();
    game.start(0);
    type("imok"); game.tick(1000, 0);
    game.quit();
    expect(game.state).toMatchObject({ mode: "idle", legDone: 0 });
  });

  it("飛行船を正解するとスピードが倍になる", () => {
    const { game, type } = setup({ random: 0, config: { ...config, questionsPerLeg: 5, airship: { ...config.airship, probability: 1 } } });
    game.start(0);
    expect(game.state.isAirship).toBe(true);
    type("imok");
    expect(game.isBoosting(5000)).toBe(true);
    game.tick(1000, 0);
    expect(game.state.isAirship).toBe(false); // ブースト中は飛行船が出ない
    type("gonow", 1000);
    expect(game.state.legDone).toBe(3);
  });

  it("パスすると答えを見せ、高度は変わらず進みもしない", () => {
    const { game } = setup();
    game.start(0);
    game.pass(0);
    expect(game.state.result).toMatchObject({ ok: false });
    expect(game.state.altitude).toBe(50);
    expect(game.state.legDone).toBe(0);
    expect(game.state.progress.answered).toBe(1);
  });

  it("問題が尽きたらメニューに戻る", () => {
    const { game, events } = setup({ questions: [] });
    game.start(0);
    expect(game.state.mode).toBe("idle");
    expect(events).toContainEqual({ type: "noQuestions" });
  });
});
