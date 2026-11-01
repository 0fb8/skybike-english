// 空の場面: 空・景色（区間ごとに海・ビル街・古い街並み・田園・砂漠・極地）・自転車・飛行船。
// 高さ VIEW_H の仮想的な画面に描き、それを表示の高さに合わせて縦横同じ倍率で拡大・縮小する。
// 縦の比率は元の絵のまま保ち、横長の画面では景色が横に広く見えるだけにする（縦につぶれて見えないように）。
//
// 景色は「空の色・遠景のシルエット（ゆっくり流れる）・地面・天気・墜落の演出」の組み合わせ。
// 手前に物を置くと書き取りの邪魔になるので、景色は遠景だけにしている。
// 景色を足すときは THEMES に 1 つ足し、src/data/route.ts の Scenery に名前を足す。
import type { Scenery } from "../data/route";
import { fitCanvas, setupCanvas } from "./canvas";

const VIEW_H = 360;
/** 地面（海面）の高さ。上からの位置 */
const GROUND = VIEW_H - 70;

export interface SceneState {
  altitude: number; // 0..100
  flying: boolean;
  boosting: boolean;
  crashing: boolean;
  crashT: number;
  airshipVisible: boolean;
  flash: number; // 0..1
  scenery: Scenery;
}

type G = CanvasRenderingContext2D;
/** 流れていく景色の部品（建物・木・島など）。seed で形のばらつきを決める */
interface Prop { x: number; w: number; h: number; seed: number }

interface Theme {
  sky: [string, string];
  clouds: string | null;
  /** 遠景の部品を作る（幅 w・高さ h を決める） */
  far: () => Omit<Prop, "x">;
  drawFar: (g: G, p: Prop) => void;
  /** 部品と部品の間隔 [最小, 最大] */
  gap: [number, number];
  /** 地面（scroll は流れた距離。模様を動かすのに使う） */
  drawGround: (g: G, W: number, scroll: number) => void;
  /** 墜落したときに舞うもの（水しぶき・砂ぼこり・雪） */
  burst: string;
  snow?: boolean;
  sun?: string;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** seed から 0..1 の値を決める（同じ部品は毎フレーム同じ形に描く） */
const hash = (seed: number, k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

function waves(g: G, W: number, scroll: number, color: string, top: number) {
  g.strokeStyle = color; g.lineWidth = 2;
  for (let r = 0; r < 3; r++) {
    g.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = top + 12 + r * 18 + Math.sin((x + scroll * (1 + r * 0.3)) / 22) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
}
/** 一定間隔で流れる模様（道路の白線・畑のうねなど） */
function dashes(g: G, W: number, scroll: number, y: number, len: number, period: number, color: string, width: number) {
  g.strokeStyle = color; g.lineWidth = width;
  g.beginPath();
  for (let x = -(scroll % period); x < W; x += period) { g.moveTo(x, y); g.lineTo(x + len, y); }
  g.stroke();
}

const THEMES: Record<Scenery, Theme> = {
  ocean: {
    sky: ["#7cc3f0", "#d9f0fb"], clouds: "rgba(255,255,255,.9)",
    far: () => ({ w: rnd(60, 200), h: rnd(10, 22), seed: Math.random() }),
    drawFar: (g, p) => { // 遠くの島
      g.fillStyle = "#86b79a"; g.beginPath(); g.ellipse(p.x + p.w / 2, GROUND, p.w / 2, p.h, 0, Math.PI, 0); g.fill();
      if (hash(p.seed, 1) > 0.5) { const x = p.x + p.w * 0.35; g.fillRect(x, GROUND - p.h - 12, 2.5, 14); g.beginPath(); g.ellipse(x + 1, GROUND - p.h - 13, 8, 3, 0, 0, 7); g.fill(); }
    },
    gap: [200, 650],
    drawGround: (g, W, scroll) => { g.fillStyle = "#2f7fc1"; g.fillRect(0, GROUND, W, VIEW_H - GROUND); waves(g, W, scroll, "rgba(255,255,255,.6)", GROUND); },
    burst: "rgba(255,255,255,.85)",
  },

  city: {
    sky: ["#86bde6", "#e6eef4"], clouds: "rgba(255,255,255,.8)",
    far: () => ({ w: rnd(28, 70), h: rnd(50, 170), seed: Math.random() }),
    drawFar: (g, p) => { // ビル街のシルエット
      g.fillStyle = hash(p.seed, 1) > 0.5 ? "#aebdcc" : "#bfcbd8";
      g.fillRect(p.x, GROUND - p.h, p.w, p.h);
      if (hash(p.seed, 2) > 0.75) g.fillRect(p.x + p.w / 2 - 1, GROUND - p.h - 14, 2, 14); // アンテナ
    },
    gap: [-8, 6],
    drawGround: (g, W, scroll) => {
      g.fillStyle = "#9aa3ab"; g.fillRect(0, GROUND, W, 8); // 歩道
      g.fillStyle = "#5a6068"; g.fillRect(0, GROUND + 8, W, VIEW_H - GROUND - 8); // 道路
      dashes(g, W, scroll, GROUND + 38, 26, 60, "rgba(255,255,255,.5)", 2);
    },
    burst: "rgba(150,150,150,.8)",
  },

  town: {
    sky: ["#8cc9ef", "#e3f2fb"], clouds: "rgba(255,255,255,.9)",
    far: () => ({ w: rnd(30, 56), h: rnd(30, 60), seed: Math.random() }),
    drawFar: (g, p) => { // 三角屋根の家並みと教会の塔のシルエット
      const top = GROUND - p.h, roof = 14 + hash(p.seed, 3) * 10;
      g.fillStyle = hash(p.seed, 1) > 0.5 ? "#c9b6a3" : "#d6c5b3";
      g.fillRect(p.x, top, p.w, p.h);
      g.beginPath(); g.moveTo(p.x - 2, top); g.lineTo(p.x + p.w / 2, top - roof); g.lineTo(p.x + p.w + 2, top); g.fill();
      if (hash(p.seed, 4) > 0.85) {
        g.fillRect(p.x + p.w / 2 - 5, top - roof - 34, 10, 34);
        g.beginPath(); g.moveTo(p.x + p.w / 2 - 7, top - roof - 34); g.lineTo(p.x + p.w / 2, top - roof - 56); g.lineTo(p.x + p.w / 2 + 7, top - roof - 34); g.fill();
      }
    },
    gap: [-4, 10],
    drawGround: (g, W, scroll) => {
      g.fillStyle = "#a39382"; g.fillRect(0, GROUND, W, VIEW_H - GROUND); // 石畳
      g.strokeStyle = "rgba(90,70,50,.22)"; g.lineWidth = 1;
      for (let row = 0; row < 5; row++) {
        const y = GROUND + 8 + row * 13, off = (row % 2) * 9;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y);
        for (let x = -((scroll + off) % 18); x < W; x += 18) { g.moveTo(x, y); g.lineTo(x, y + 13); }
        g.stroke();
      }
    },
    burst: "rgba(170,150,120,.8)",
  },

  countryside: {
    sky: ["#7cc3f0", "#e2f3fb"], clouds: "rgba(255,255,255,.9)",
    far: () => ({ w: rnd(200, 400), h: rnd(30, 80), seed: Math.random() }),
    drawFar: (g, p) => { // 丘と、その上の木のシルエット
      g.fillStyle = "#a3d088"; g.beginPath(); g.ellipse(p.x + p.w / 2, GROUND, p.w / 2, p.h, 0, Math.PI, 0); g.fill();
      g.fillStyle = "#8fc275";
      const trees = Math.floor(hash(p.seed, 1) * 4);
      for (let i = 0; i < trees; i++) {
        const t = 0.25 + hash(p.seed, i + 2) * 0.5, x = p.x + p.w * t;
        const y = GROUND - p.h * Math.sqrt(1 - ((t - 0.5) * 2) ** 2);
        g.beginPath(); g.arc(x, y - 6, 7, 0, 7); g.fill(); g.fillRect(x - 1, y - 2, 2, 4);
      }
    },
    gap: [-120, 0],
    drawGround: (g, W, scroll) => {
      g.fillStyle = "#6aa84f"; g.fillRect(0, GROUND, W, VIEW_H - GROUND);
      for (let r = 0; r < 4; r++) dashes(g, W, scroll * (1 + r * 0.25), GROUND + 12 + r * 16, 50, 90, "rgba(60,110,40,.25)", 3); // 畑のうね
    },
    burst: "rgba(140,110,70,.8)",
  },

  desert: {
    sky: ["#f2b46d", "#fbe7c4"], clouds: "rgba(255,245,230,.6)", sun: "#fff4d6",
    far: () => ({ w: rnd(80, 180), h: rnd(30, 90), seed: Math.random() }),
    drawFar: (g, p) => { // 台地（メサ）と砂丘のシルエット
      g.fillStyle = "#dca878";
      if (hash(p.seed, 1) > 0.4) {
        g.beginPath(); g.moveTo(p.x, GROUND); g.lineTo(p.x + 14, GROUND - p.h); g.lineTo(p.x + p.w - 14, GROUND - p.h); g.lineTo(p.x + p.w, GROUND); g.fill();
      } else {
        g.beginPath(); g.ellipse(p.x + p.w / 2, GROUND, p.w / 2, p.h * 0.4, 0, Math.PI, 0); g.fill();
      }
    },
    gap: [40, 240],
    drawGround: (g, W, scroll) => {
      g.fillStyle = "#e9c88a"; g.fillRect(0, GROUND, W, VIEW_H - GROUND);
      g.strokeStyle = "rgba(180,130,70,.25)"; g.lineWidth = 2;
      for (let r = 0; r < 3; r++) {
        g.beginPath();
        for (let x = 0; x <= W; x += 8) { const y = GROUND + 16 + r * 18 + Math.sin((x + scroll * (0.8 + r * 0.2)) / 40) * 4; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    },
    burst: "rgba(225,190,130,.85)",
  },

  polar: {
    sky: ["#a9c6dc", "#eef4f8"], clouds: "rgba(245,248,250,.9)", snow: true,
    far: () => ({ w: rnd(90, 200), h: rnd(50, 120), seed: Math.random() }),
    drawFar: (g, p) => { // 氷の山
      g.fillStyle = "#dfeaf2"; g.beginPath(); g.moveTo(p.x, GROUND); g.lineTo(p.x + p.w * 0.45, GROUND - p.h); g.lineTo(p.x + p.w, GROUND); g.fill();
      g.fillStyle = "#c9dae7"; g.beginPath(); g.moveTo(p.x + p.w * 0.45, GROUND - p.h); g.lineTo(p.x + p.w, GROUND); g.lineTo(p.x + p.w * 0.6, GROUND); g.fill();
    },
    gap: [-40, 80],
    drawGround: (g, W, scroll) => {
      g.fillStyle = "#f2f7fb"; g.fillRect(0, GROUND, W, VIEW_H - GROUND); // 氷原
      for (let r = 0; r < 3; r++) dashes(g, W, scroll * (1 + r * 0.3), GROUND + 14 + r * 18, 30, 120 + r * 40, "rgba(120,160,190,.35)", 1.5); // 氷の割れ目
    },
    burst: "rgba(255,255,255,.95)",
  },
};

/** 墜落したときの言い方（「〜に墜落」） */
export const CRASH_PLACE: Record<Scenery, { sound: string; place: string }> = {
  ocean: { sound: "ザブーン！", place: "海" },
  city: { sound: "ドスン！", place: "ビル街" },
  town: { sound: "ドスン！", place: "街" },
  countryside: { sound: "ドサッ！", place: "野原" },
  desert: { sound: "ザザッ！", place: "砂漠" },
  polar: { sound: "ズボッ！", place: "雪原" },
};

export class Scene {
  private g: G;
  private W = 480;
  private readonly H = VIEW_H;
  private clouds: { x: number; y: number; s: number }[] = [];
  private far: Prop[] = [];
  private snow: { x: number; y: number; r: number; v: number }[] = [];
  private scroll = 0;
  private airshipX = Infinity;
  private scenery: Scenery = "ocean";

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
    this.resize();
    this.clouds = Array.from({ length: Math.ceil(this.W / 70) }, () => ({ x: Math.random() * this.W, y: this.cloudY(), s: 0.6 + Math.random() * 0.8 }));
    this.setScenery("ocean");
  }

  /** 表示されている大きさに合わせ直す（ウィンドウの大きさが変わったとき） */
  resize() {
    fitCanvas(this.canvas);
    const c = setupCanvas(this.canvas);
    const scale = c.height / VIEW_H;
    c.g.scale(scale, scale);
    this.g = c.g; this.W = c.width / scale;
  }

  private get theme() { return THEMES[this.scenery]; }
  private cloudY() { return 70 + Math.random() * 180; }
  /** 自転車の横位置（左寄り） */
  private get bikeX() { return Math.max(150, this.W * 0.28); }
  /** 飛行船が止まる位置（右寄り） */
  private get airshipStop() { return Math.max(this.bikeX + 180, this.W * 0.7); }

  /** 景色を切り替え、画面いっぱいに部品を並べ直す */
  private setScenery(s: Scenery) {
    this.scenery = s;
    this.far = [];
    this.fill(this.far, -50);
    this.snow = this.theme.snow ? Array.from({ length: Math.ceil(this.W / 8) }, () => this.flake(Math.random() * this.H)) : [];
  }
  private flake(y: number) { return { x: Math.random() * (this.W + 60), y, r: 1 + Math.random() * 2, v: 20 + Math.random() * 40 }; }

  /** 右端まで部品を足す */
  private fill(list: Prop[], start: number) {
    const { far: make, gap } = this.theme;
    let right = list.length ? list[list.length - 1].x + list[list.length - 1].w : start;
    while (right < this.W + 60) {
      const p = { ...make(), x: right + rnd(gap[0], gap[1]) };
      list.push(p);
      right = p.x + p.w;
    }
  }

  update(dt: number, s: SceneState) {
    if (s.scenery !== this.scenery) this.setScenery(s.scenery);
    const speed = s.flying ? (s.boosting ? 220 : 110) : 25;
    this.scroll += dt * speed;
    for (const c of this.clouds) {
      c.x -= speed * dt * c.s * 0.5;
      if (c.x < -80) { c.x = this.W + 40 + Math.random() * 80; c.y = this.cloudY(); }
    }
    for (const p of this.far) p.x -= speed * dt * 0.35;
    this.far = this.far.filter((p) => p.x + p.w > -60);
    this.fill(this.far, this.W);
    for (const f of this.snow) {
      f.y += f.v * dt; f.x -= (speed * 0.3 + 10) * dt;
      if (f.y > this.H || f.x < -10) Object.assign(f, this.flake(-5));
    }
    const out = this.W + 120;
    if (s.airshipVisible) { this.airshipX = Math.min(this.airshipX, out); if (this.airshipX > this.airshipStop) this.airshipX -= dt * 120; }
    else if (this.airshipX < out) this.airshipX += dt * 200;
  }

  showAirship() { this.airshipX = this.W + 100; }

  draw(now: number, s: SceneState) {
    const g = this.g, W = this.W, H = this.H, t = this.theme;
    const grd = g.createLinearGradient(0, 0, 0, GROUND);
    grd.addColorStop(0, t.sky[0]); grd.addColorStop(1, t.sky[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (t.sun) { g.fillStyle = t.sun; g.beginPath(); g.arc(W * 0.82, 70, 30, 0, 7); g.fill(); }

    if (t.clouds) {
      g.fillStyle = t.clouds;
      for (const c of this.clouds) {
        g.beginPath(); g.ellipse(c.x, c.y, 30 * c.s, 12 * c.s, 0, 0, 7); g.ellipse(c.x + 18 * c.s, c.y - 8 * c.s, 20 * c.s, 12 * c.s, 0, 0, 7); g.fill();
      }
    }
    for (const p of this.far) t.drawFar(g, p);
    t.drawGround(g, W, this.scroll);
    if (this.airshipX < W + 100) this.drawAirship(this.airshipX, 130 + Math.sin(now / 600) * 6);

    // 高度 0..100 を、上は情報の帯の下から、下は地面の少し上まで
    const top = 95, bottom = GROUND - 26, bx = this.bikeX;
    let by = bottom - (s.altitude / 100) * (bottom - top);
    if (s.crashing) by = Math.min(GROUND + 10, by + s.crashT * s.crashT * 400);
    else by += Math.sin(now / 300) * 2;
    this.drawBike(bx, by, now, s);

    if (s.crashing && by >= GROUND - 10) {
      g.fillStyle = t.burst;
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI, r = 20 + s.crashT * 40; g.beginPath(); g.arc(bx + Math.cos(a) * r, GROUND + Math.sin(a) * r * 0.6, 5, 0, 7); g.fill(); }
    }
    if (this.snow.length) {
      g.fillStyle = "rgba(255,255,255,.9)";
      for (const f of this.snow) { g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill(); }
    }
    if (s.flash > 0) { g.fillStyle = `rgba(233,66,107,${s.flash * 0.25})`; g.fillRect(0, 0, W, H); }
  }

  private drawBike(x: number, y: number, now: number, s: SceneState) {
    const g = this.g;
    g.save(); g.translate(x, y);
    g.rotate(s.crashing ? Math.min(1.2, s.crashT * 1.5) : 0);
    if (s.boosting && s.flying) {
      g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const o = (now / 30 + i * 20) % 60; g.beginPath(); g.moveTo(-60 - o, -10 + i * 7); g.lineTo(-35 - o, -10 + i * 7); g.stroke(); }
    }
    g.fillStyle = "#f2f2f2"; g.strokeStyle = "#333"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-10, -14); g.lineTo(-38, -34); g.lineTo(-8, -22); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = "#222";
    g.beginPath(); g.arc(-18, 12, 12, 0, 7); g.stroke(); g.beginPath(); g.arc(20, 12, 12, 0, 7); g.stroke();
    const spin = now / 80; g.lineWidth = 1;
    for (const cx of [-18, 20]) for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI) / 3;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 11, 12 + Math.sin(a) * 11); g.lineTo(cx - Math.cos(a) * 11, 12 - Math.sin(a) * 11); g.stroke();
    }
    g.strokeStyle = "#c0392b"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-18, 12); g.lineTo(0, 12); g.lineTo(14, -6); g.lineTo(-6, -6); g.lineTo(-18, 12); g.moveTo(-6, -6); g.lineTo(0, 12); g.moveTo(14, -6); g.lineTo(20, 12); g.stroke();
    g.strokeStyle = "#222"; g.lineWidth = 2; g.beginPath(); g.moveTo(14, -6); g.lineTo(12, -14); g.lineTo(18, -15); g.stroke();
    g.strokeStyle = "#333"; g.lineWidth = 3;
    const pedal = Math.sin(now / 120) * 5;
    g.beginPath(); g.moveTo(-6, -10); g.lineTo(2, -2 + pedal); g.lineTo(0, 12); g.stroke();
    g.fillStyle = "#2d7be0"; g.beginPath(); g.moveTo(-10, -10); g.lineTo(-4, -30); g.lineTo(4, -28); g.lineTo(-2, -8); g.fill();
    g.strokeStyle = "#2d7be0"; g.beginPath(); g.moveTo(0, -26); g.lineTo(16, -15); g.stroke();
    g.fillStyle = "#f6cfa8"; g.beginPath(); g.arc(-1, -36, 7, 0, 7); g.fill();
    g.fillStyle = "#7a4b2a"; g.beginPath(); g.arc(-1, -38, 7, Math.PI, 0); g.fill();
    g.fillStyle = "#555"; g.fillRect(-36, -4, 10, 8);
    const pr = Math.abs(Math.sin(now / 30)) * 14; g.fillStyle = "#999"; g.fillRect(-40, -pr, 3, pr * 2);
    g.restore();
  }

  private drawAirship(x: number, y: number) {
    const g = this.g;
    g.save(); g.translate(x, y);
    g.fillStyle = "#ffcc00"; g.strokeStyle = "#333"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, 0, 62, 22, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#e9426b"; g.beginPath(); g.moveTo(52, -4); g.lineTo(76, -22); g.lineTo(76, 22); g.lineTo(52, 4); g.fill(); g.stroke();
    g.strokeStyle = "#333"; g.beginPath(); g.moveTo(-20, 20); g.lineTo(-14, 30); g.moveTo(14, 20); g.lineTo(10, 30); g.stroke();
    g.fillStyle = "#fff"; g.fillRect(-18, 28, 30, 12); g.strokeRect(-18, 28, 30, 12);
    g.fillStyle = "#333"; g.font = "bold 13px sans-serif"; g.textAlign = "center"; g.fillText("ACCENT!", 0, 5);
    g.restore();
  }
}
