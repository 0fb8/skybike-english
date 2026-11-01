// 1回のプレイの進行（DOM・音声・保存に依存しない。テスト対象）。
// 画面は state を読んで描くだけ、入力は Game のメソッドを呼ぶだけにする。
// 時刻はすべて呼び出し側から ms で渡す（テストで時間を進められるように）。
//
// ルール:
// - 例文を聞いて、まるごと書き取る（英字だけ入力。空白と記号は自動で埋まる）
// - 高度は時間とともに下がり、正しい文字を 1 文字書くたびに少し上がる。打ち間違えても下がらない
// - 区間（都市→都市）の問題数を解くと到着。途中で高度 0 になったら墜落してその渡航は失敗、
//   メニューに戻り、次は出発地からやり直し
import type { Config, PlayQuestion } from "../content/schema";
import { letterTarget } from "../content/text";
import { completeLeg, type Progress } from "../lib/quiz";

export type Mode =
  | "idle" //    メニュー
  | "play" //    出題中
  | "review" //  解答後、次の問題までの間
  | "crash" //   墜落中（終わるとメニューへ）
  | "arrived"; // 都市に到着

export interface AnswerResult {
  ok: boolean;
  message: string;
  question: PlayQuestion;
}

export interface GameState {
  mode: Mode;
  progress: Progress;
  /** 今の渡航で進んだ問題数（飛行船のブースト中は 1 問で複数進む）。保存しない */
  legDone: number;
  /** 0..100。0 で墜落 */
  altitude: number;
  question: PlayQuestion | null;
  /** 書き取る英字（小文字） */
  target: string;
  /** 正しく書けた文字数 */
  typed: number;
  isAirship: boolean;
  /** 出題ごとに増える番号。前の問題の読み上げ終了通知を無視するのに使う */
  turn: number;
  /** 最初の読み上げ中（この間は高度が下がらない） */
  speaking: boolean;
  /** この問題で一度でも打ち間違えたか */
  missed: boolean;
  boostUntil: number;
  /** review / crash が終わる時刻 */
  phaseUntil: number;
  arrivedAfterReview: boolean;
  crashT: number;
  /** 打ち間違えたときの画面の赤み 0..1（見た目だけ。高度は変わらない） */
  flash: number;
  /** 直前の解答結果（review / crash 中に表示する） */
  result: AnswerResult | null;
  /** 直前の渡航が墜落で終わった（メニューで知らせる） */
  lastFlightFailed: boolean;
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
const PASS_EXTRA_MS = 800;

export class Game {
  readonly state: GameState;
  private readonly cfg: Config;
  private readonly random: () => number;

  constructor(private readonly o: GameOptions) {
    this.cfg = o.config;
    this.random = o.random ?? Math.random;
    this.state = {
      mode: "idle", progress: o.progress, legDone: 0, altitude: o.config.altitude.start,
      question: null, target: "", typed: 0, isAirship: false, turn: 0, speaking: false, missed: false,
      boostUntil: 0, phaseUntil: 0, arrivedAfterReview: false, crashT: 0, flash: 0, result: null,
      lastFlightFailed: false,
    };
  }

  get perLeg(): number { return this.cfg.questionsPerLeg; }
  isBoosting(now: number): boolean { return now < this.state.boostUntil; }
  isFlying(): boolean { return this.state.mode === "play" || this.state.mode === "review"; }

  // ---------- 入力 ----------

  /** 出発地から渡航を始める */
  start(now: number): void {
    const s = this.state;
    if (s.mode !== "idle" && s.mode !== "arrived") return;
    Object.assign(s, { altitude: this.cfg.altitude.start, legDone: 0, boostUntil: 0, lastFlightFailed: false });
    this.next(now);
  }

  /** 渡航をやめる（途中の進みは失われ、次は出発地から） */
  quit(): void {
    const s = this.state;
    if (s.mode === "idle") return;
    this.o.emit({ type: "stopSpeaking" });
    Object.assign(s, { mode: "idle", question: null, result: null, speaking: false, legDone: 0, boostUntil: 0 });
    this.o.emit({ type: "progress" });
  }

  setName(name: string): void {
    this.state.progress.name = name;
    this.o.emit({ type: "progress" });
  }

  speechEnded(turn: number): void {
    if (turn === this.state.turn) this.state.speaking = false;
  }

  replay(): void {
    const s = this.state;
    if (s.mode === "play" && s.question) this.o.emit({ type: "speak", turn: s.turn, first: false, text: s.question.sentence, airship: s.isAirship });
  }

  letter(ch: string, now: number): void {
    const s = this.state;
    if (s.mode !== "play" || !s.question) return;
    if (ch.toLowerCase() === s.target[s.typed]) {
      s.typed++;
      s.altitude = Math.min(100, s.altitude + this.cfg.altitude.gainPerLetter);
      if (s.typed === s.target.length) this.correct(now);
    } else {
      s.flash = 1;
      s.missed = true;
      this.o.emit({ type: "wrongLetter", letter: ch });
    }
  }

  pass(now: number): void {
    const s = this.state, q = s.question;
    if (s.mode !== "play" || !q) return;
    s.speaking = false;
    this.o.emit({ type: "stopSpeaking" });
    s.progress.answered++;
    this.finish(now, { ok: false, message: "パス。正解はこちら", question: q }, false);
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
      // 渡航失敗。メニューに戻り、次は出発地から
      Object.assign(s, { mode: "idle", result: null, legDone: 0, boostUntil: 0, altitude: a.start, lastFlightFailed: true });
    }
  }

  // ---------- 内部 ----------

  private next(now: number): void {
    const s = this.state;
    const airship = !this.isBoosting(now) && this.random() < this.cfg.airship.probability;
    const q = this.o.draw({ airship });
    if (!q) {
      Object.assign(s, { mode: "idle", question: null, result: null, legDone: 0 });
      this.o.emit({ type: "noQuestions" });
      return;
    }
    s.turn++;
    Object.assign(s, {
      mode: "play", question: q, target: letterTarget(q.sentence), typed: 0, isAirship: airship,
      missed: false, result: null, speaking: true,
    });
    this.o.emit({ type: "speak", turn: s.turn, first: true, text: q.sentence, airship });
  }

  private correct(now: number): void {
    const s = this.state, q = s.question!, ship = this.cfg.airship;
    s.speaking = false;
    const boosting = this.isBoosting(now);
    s.progress.answered++;
    if (!s.missed) s.progress.correctFirst++;

    let message = s.missed ? "正解！" : "ノーミスで正解！";
    if (s.isAirship) {
      s.boostUntil = now + ship.boostSeconds * 1000;
      message = `飛行船クリア！ ${ship.boostSeconds}秒間スピード${ship.multiplier}倍！`;
    }
    s.legDone = Math.min(this.perLeg, s.legDone + (boosting ? ship.multiplier : 1));
    const arrived = s.legDone >= this.perLeg;
    if (arrived) s.progress = completeLeg(s.progress, this.o.legs.length);
    this.finish(now, { ok: true, message, question: q }, arrived);
  }

  private finish(now: number, result: AnswerResult, arrived: boolean): void {
    const s = this.state, d = this.cfg.display;
    s.mode = "review";
    s.result = result;
    s.arrivedAfterReview = arrived;
    s.phaseUntil = now + (d.showReview ? d.reviewMs + (result.ok ? 0 : PASS_EXTRA_MS) : NO_REVIEW_MS);
    this.o.emit({ type: "progress" });
  }

  private crash(now: number): void {
    const s = this.state;
    s.speaking = false;
    this.o.emit({ type: "stopSpeaking" });
    if (s.question) s.result = { ok: false, message: "ザブーン！ 海に墜落… この渡航は失敗", question: s.question };
    Object.assign(s, { mode: "crash", crashT: 0, question: null, legDone: 0, phaseUntil: now + CRASH_MS });
    this.o.emit({ type: "progress" });
  }

  private arrive(): void {
    this.o.emit({ type: "stopSpeaking" });
    Object.assign(this.state, { mode: "arrived", question: null, result: null, legDone: 0 });
  }
}
