// 1回のプレイの進行（DOM・音声・保存に依存しない。テスト対象）。
// 画面は state を読んで描くだけ、入力は Game のメソッドを呼ぶだけにする。
// 時刻はすべて呼び出し側から ms で渡す（テストで時間を進められるように）。
import type { Config, PlayQuestion } from "../content/schema";
import { advance, altitudeGain, crashSetback, type Progress } from "../lib/quiz";

export type Mode =
  | "idle" //    メニュー
  | "play" //    出題中
  | "review" //  解答後、次の問題までの間
  | "crash" //   墜落中
  | "arrived"; // 都市に到着

export interface AnswerResult {
  ok: boolean;
  message: string;
  question: PlayQuestion;
}

export interface GameState {
  mode: Mode;
  progress: Progress;
  /** 0..100。0 で墜落 */
  altitude: number;
  question: PlayQuestion | null;
  typed: string;
  isAirship: boolean;
  /** 出題ごとに増える番号。前の問題の読み上げ終了通知を無視するのに使う */
  turn: number;
  /** 最初の読み上げ中（この間は高度が下がらない） */
  speaking: boolean;
  /** この問題で一度でも打ち間違えたか */
  missed: boolean;
  /** 読み上げが終わった時刻（解答時間の起点） */
  answerStart: number;
  boostUntil: number;
  /** review / crash が終わる時刻 */
  phaseUntil: number;
  arrivedAfterReview: boolean;
  crashT: number;
  /** 打ち間違えたときの画面の赤み 0..1 */
  flash: number;
  /** 直前の解答結果（review / crash 中に表示する） */
  result: AnswerResult | null;
}

export type GameEvent =
  /** first: 出題時の読み上げ（終わったら speechEnded を呼ぶ）。false は聴き直し */
  | { type: "speak"; turn: number; first: boolean; text: string; airship: boolean }
  | { type: "stopSpeaking" }
  | { type: "wrongLetter"; letter: string }
  /** progress が変わった（保存どき） */
  | { type: "progress" }
  | { type: "noQuestions" };

export interface GameOptions {
  config: Config;
  /** 各区間の距離 km */
  legs: number[];
  progress: Progress;
  /** 次の問題を引く。airship のときは飛行船向きの問題（なまりの音声があるもの）を優先してよい。尽きたら undefined */
  draw: (opts: { airship: boolean }) => PlayQuestion | undefined;
  emit: (e: GameEvent) => void;
  random?: () => number;
}

export const CRASH_MS = 2800;
const NO_REVIEW_MS = 450;
const WRONG_EXTRA_MS = 800;

export class Game {
  readonly state: GameState;
  private readonly cfg: Config;
  private readonly random: () => number;

  constructor(private readonly o: GameOptions) {
    this.cfg = o.config;
    this.random = o.random ?? Math.random;
    this.state = {
      mode: "idle", progress: o.progress, altitude: o.config.altitude.start,
      question: null, typed: "", isAirship: false, turn: 0, speaking: false, missed: false,
      answerStart: 0, boostUntil: 0, phaseUntil: 0, arrivedAfterReview: false, crashT: 0, flash: 0, result: null,
    };
  }

  get perLeg(): number { return this.cfg.questionsPerLeg; }
  isBoosting(now: number): boolean { return now < this.state.boostUntil; }
  isFlying(): boolean { return this.state.mode === "play" || this.state.mode === "review"; }

  // ---------- 入力 ----------

  start(now: number): void {
    const s = this.state;
    if (s.mode !== "idle" && s.mode !== "arrived") return;
    s.altitude = this.cfg.altitude.start;
    this.next(now);
  }

  quit(): void {
    const s = this.state;
    if (s.mode === "idle") return;
    this.o.emit({ type: "stopSpeaking" });
    Object.assign(s, { mode: "idle", question: null, result: null, speaking: false });
    this.o.emit({ type: "progress" });
  }

  setName(name: string): void {
    this.state.progress.name = name;
    this.o.emit({ type: "progress" });
  }

  speechEnded(turn: number, now: number): void {
    const s = this.state;
    if (turn !== s.turn || !s.speaking) return;
    s.speaking = false;
    s.answerStart = now;
  }

  replay(): void {
    const s = this.state;
    if (s.mode === "play" && s.question) this.o.emit({ type: "speak", turn: s.turn, first: false, text: s.question.sentence, airship: s.isAirship });
  }

  letter(ch: string, now: number): void {
    const s = this.state, q = s.question;
    if (s.mode !== "play" || !q) return;
    if (ch === q.answer[s.typed.length]) {
      s.typed += ch;
      if (s.typed === q.answer) this.correct(now);
    } else {
      s.altitude = Math.max(0, s.altitude - this.cfg.altitude.wrongPenalty);
      s.flash = 1;
      s.missed = true;
      this.o.emit({ type: "wrongLetter", letter: ch });
    }
  }

  backspace(): void { if (this.state.mode === "play") this.state.typed = this.state.typed.slice(0, -1); }
  clearTyped(): void { if (this.state.mode === "play") this.state.typed = ""; }

  pass(now: number): void {
    const s = this.state, q = s.question;
    if (s.mode !== "play" || !q) return;
    s.speaking = false;
    this.o.emit({ type: "stopSpeaking" });
    s.altitude = Math.max(0, s.altitude - this.cfg.altitude.passPenalty);
    s.progress.answered++;
    this.finish(now, { ok: false, message: `正解は ${q.answer}（${q.meaning}）`, question: q }, false);
  }

  // ---------- 時間経過 ----------

  tick(now: number, dt: number): void {
    const s = this.state, a = this.cfg.altitude;
    if (s.mode === "play" && s.question && !s.speaking) {
      s.altitude -= (a.decayPerSec + s.progress.laps * a.decayIncreasePerLap) * dt;
      if (s.altitude <= 0) { s.altitude = 0; this.crash(now); }
    }
    if (s.mode === "crash") s.crashT += dt;
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 3);

    if (now < s.phaseUntil) return;
    if (s.mode === "review") {
      if (s.arrivedAfterReview) this.arrive();
      else this.next(now);
    } else if (s.mode === "crash") {
      s.altitude = a.start;
      this.next(now);
    }
  }

  // ---------- 内部 ----------

  private next(now: number): void {
    const s = this.state;
    const airship = !this.isBoosting(now) && this.random() < this.cfg.airship.probability;
    const q = this.o.draw({ airship });
    if (!q) {
      Object.assign(s, { mode: "idle", question: null, result: null });
      this.o.emit({ type: "noQuestions" });
      return;
    }
    s.turn++;
    Object.assign(s, { mode: "play", question: q, isAirship: airship, typed: "", missed: false, result: null, speaking: true, answerStart: now });
    this.o.emit({ type: "speak", turn: s.turn, first: true, text: q.sentence, airship: s.isAirship });
  }

  private correct(now: number): void {
    const s = this.state, q = s.question!, ship = this.cfg.airship;
    const seconds = s.speaking ? 0 : (now - s.answerStart) / 1000;
    s.speaking = false;
    s.altitude = Math.min(100, s.altitude + altitudeGain(this.cfg.altitude, seconds));
    const boosting = this.isBoosting(now);
    s.progress.answered++;
    if (!s.missed) s.progress.correctFirst++;

    let message = seconds < 4 ? "すばらしい！ ↑↑" : seconds < 9 ? "OK！ ↑" : "なんとか…";
    if (s.isAirship) {
      s.boostUntil = now + ship.boostSeconds * 1000;
      message = `飛行船クリア！ ${ship.boostSeconds}秒間スピード${ship.multiplier}倍！`;
    }
    const r = advance(s.progress, boosting ? ship.multiplier : 1, this.perLeg, this.o.legs);
    s.progress = r.progress;
    this.finish(now, { ok: true, message, question: q }, r.arrived);
  }

  private finish(now: number, result: AnswerResult, arrived: boolean): void {
    const s = this.state, d = this.cfg.display;
    s.mode = "review";
    s.result = result;
    s.arrivedAfterReview = arrived;
    s.phaseUntil = now + (d.showReview ? d.reviewMs + (result.ok ? 0 : WRONG_EXTRA_MS) : NO_REVIEW_MS);
    this.o.emit({ type: "progress" });
  }

  private crash(now: number): void {
    const s = this.state;
    s.speaking = false;
    this.o.emit({ type: "stopSpeaking" });
    const r = crashSetback(s.progress, this.cfg.altitude.crashSetback, this.perLeg, this.o.legs);
    s.progress = r.progress;
    if (s.question) s.result = { ok: false, message: `ザブーン！ 海に墜落… ${r.back}問ぶん戻された`, question: s.question };
    Object.assign(s, { mode: "crash", crashT: 0, question: null, phaseUntil: now + CRASH_MS });
    this.o.emit({ type: "progress" });
  }

  private arrive(): void {
    this.o.emit({ type: "stopSpeaking" });
    Object.assign(this.state, { mode: "arrived", question: null, result: null });
  }
}
