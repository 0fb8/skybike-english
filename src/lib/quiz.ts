// ゲームの進行ルール（DOM に依存しない純粋なロジック。テスト対象）
import type { Config } from "../content/schema";

/**
 * 保存する進行状況。区間（都市→都市）は出発から到着までで 1 回の渡航で、
 * 途中で墜落・中断したら次は出発地からやり直すので、区間の途中の進みは保存しない。
 */
export interface Progress {
  name: string;
  /** 次に出発する都市のインデックス */
  leg: number;
  laps: number;
  answered: number;
  correctFirst: number;
}

export const newProgress = (): Progress => ({ name: "", leg: 0, laps: 0, answered: 0, correctFirst: 0 });

/** 区間を飛び終えて次の都市に着いた後の進行状況 */
export function completeLeg(p: Progress, legCount: number): Progress {
  const leg = (p.leg + 1) % legCount;
  return { ...p, leg, laps: p.laps + (leg === 0 ? 1 : 0) };
}

/** これまでに飛び終えた総距離 km（周回 × 一周 ＋ 今の周で到着済みの区間） */
export function totalKm(p: Pick<Progress, "leg" | "laps">, legs: number[]): number {
  const lap = legs.reduce((a, b) => a + b, 0);
  return p.laps * lap + legs.slice(0, p.leg).reduce((a, b) => a + b, 0);
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

  /** 次に出る問題（袋を詰め直すときは順番がまだ決まっていないので undefined） */
  peek(): string | undefined {
    return this.remaining.at(-1);
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
