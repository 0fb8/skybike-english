// ゲームの進行ルール（DOM に依存しない純粋なロジック。テスト対象）
import type { Config } from "../content/schema";

export interface Progress {
  name: string;
  /** 現在の出発都市のインデックス */
  leg: number;
  /** 現在の区間で正解した数（スピード倍化で一気に進むこともある） */
  legDone: number;
  totalKm: number;
  laps: number;
  answered: number;
  correctFirst: number;
}

export const newProgress = (): Progress => ({ name: "", leg: 0, legDone: 0, totalKm: 0, laps: 0, answered: 0, correctFirst: 0 });

/** 正解までの秒数から高度の上昇量を決める */
export function altitudeGain(a: Config["altitude"], seconds: number): number {
  return Math.max(a.gainMin, Math.min(a.gainMax, a.gainMax - seconds * a.gainFalloffPerSec));
}

/** 正解で steps 問ぶん進める。区間を終えたら次の都市へ */
export function advance(p: Progress, steps: number, perLeg: number, legs: number[]): { progress: Progress; arrived: boolean } {
  const next = { ...p };
  const before = next.legDone;
  next.legDone = Math.min(perLeg, next.legDone + steps);
  next.totalKm += (legs[next.leg] * (next.legDone - before)) / perLeg;
  if (next.legDone < perLeg) return { progress: next, arrived: false };
  next.legDone = 0;
  next.leg = (next.leg + 1) % legs.length;
  if (next.leg === 0) next.laps++;
  return { progress: next, arrived: true };
}

/** 墜落: 区間内の進みを ratio ぶん戻す（区間の手前までは戻らない） */
export function crashSetback(p: Progress, ratio: number, perLeg: number, legs: number[]): { progress: Progress; back: number } {
  const back = Math.min(p.legDone, Math.round(perLeg * ratio));
  return {
    progress: { ...p, legDone: p.legDone - back, totalKm: p.totalKm - (legs[p.leg] * back) / perLeg },
    back,
  };
}

/**
 * 出題順を管理する袋。全問出し切るまで同じ問題は出ない。
 * remaining は保存して次回に引き継げる（消えた問題のキーは自動で除外）。
 */
export class QuestionBag {
  constructor(
    private keys: string[],
    private order: Config["order"],
    public remaining: string[] = [],
    private random: () => number = Math.random,
  ) {
    const valid = new Set(keys);
    this.remaining = remaining.filter((k) => valid.has(k));
  }

  next(): string | undefined {
    if (!this.keys.length) return undefined;
    if (!this.remaining.length) this.refill();
    return this.remaining.pop();
  }

  private refill() {
    const r = [...this.keys];
    if (this.order === "shuffle") {
      for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
      }
    } else {
      r.reverse(); // pop() で先頭から出るように
    }
    this.remaining = r;
  }
}
