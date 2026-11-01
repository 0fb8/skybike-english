// メニュー・到着画面の地球儀（正射図法）。ドラッグで回せて、ホイールで拡大・縮小できる。
// 表示するたびに今いる場所と次の目的地の方へ回り、区間の長さに合わせて少し拡大する。
// 陸地は Natural Earth の 1:1.1 億のデータ（world-atlas）。区間は大圏（球面上の最短経路）で描く。
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import landTopo from "world-atlas/land-110m.json";
import type { City } from "../data/route";
import { fitCanvas, setupCanvas } from "./canvas";

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land);
const GRATICULE = geoGraticule10();
const SPHERE: GeoPermissibleObjects = { type: "Sphere" };

export interface GlobeView {
  cities: City[];
  /** 今いる地点（到着済み） */
  here: number;
  /** 今いる地点に付ける名前（プレイヤー名） */
  name: string;
}

/** [経度, 緯度] */
type LonLat = [number, number];
const at = (c: City): LonLat => [c.lon, c.lat];

export class Globe {
  /** 正射図法の回転 [λ, φ]（画面の中心に来る地点の経度・緯度の符号を反転したもの） */
  private rotation: [number, number] = [-139.7, -35.7];
  /** 拡大率（1 で地球全体が収まる） */
  private zoom = 1;
  private view: GlobeView | null = null;
  private anim = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.bindDrag();
  }

  /** 表示内容を変えて、今いる場所と次の目的地の中間あたりが正面に来るよう回す */
  show(view: GlobeView) {
    this.view = view;
    const a = view.cities[view.here], b = view.cities[(view.here + 1) % view.cities.length];
    const [lon, lat] = geoInterpolate(at(a), at(b))(0.5);
    // 短い区間ほど拡大する（区間の角度が画面の半径の 6 割ほどに収まるくらい。最大 3 倍）
    const span = geoDistance(at(a), at(b));
    this.rotateTo([-lon, -lat], Math.max(1, Math.min(3, 0.6 / Math.max(span, 0.01))));
  }

  /** 大きさが変わったときなど、今の向きのまま描き直す */
  redraw() { this.draw(); }

  private rotateTo(target: [number, number], zoom = this.zoom) {
    cancelAnimationFrame(this.anim);
    const from = this.rotation, fromZoom = this.zoom;
    // 経度は近い方向へ回る
    let dl = target[0] - from[0];
    dl -= Math.round(dl / 360) * 360;
    const start = performance.now(), ms = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms), e = 1 - (1 - t) ** 3;
      this.rotation = [from[0] + dl * e, from[1] + (target[1] - from[1]) * e];
      this.zoom = fromZoom + (zoom - fromZoom) * e;
      this.draw();
      if (t < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  private bindDrag() {
    const c = this.canvas;
    let last: { x: number; y: number } | null = null;
    c.addEventListener("pointerdown", (e) => {
      cancelAnimationFrame(this.anim);
      last = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
      c.classList.add("dragging");
    });
    c.addEventListener("pointermove", (e) => {
      if (!last) return;
      // 半径に応じた角度だけ回す（地球の表面をつかんで動かす感覚）
      const r = (Math.min(c.clientWidth, c.clientHeight) / 2) * this.zoom;
      const k = 180 / Math.PI / Math.max(1, r);
      this.rotation = [this.rotation[0] + (e.clientX - last.x) * k, Math.max(-90, Math.min(90, this.rotation[1] - (e.clientY - last.y) * k))];
      last = { x: e.clientX, y: e.clientY };
      this.draw();
    });
    const end = () => { last = null; c.classList.remove("dragging"); };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => {
      e.preventDefault(); // ページのスクロールではなく拡大・縮小
      cancelAnimationFrame(this.anim);
      this.zoom = Math.max(1, Math.min(6, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.draw();
    }, { passive: false });
  }

  private draw() {
    const v = this.view;
    if (!v) return;
    fitCanvas(this.canvas);
    const { g, width: W, height: H } = setupCanvas(this.canvas);
    const r = (Math.min(W, H) / 2 - 14) * this.zoom;
    const proj = geoOrthographic().scale(r).translate([W / 2, H / 2]).rotate(this.rotation).clipAngle(90);
    const path = geoPath(proj, g);
    const center: LonLat = [-this.rotation[0], -this.rotation[1]];
    const visible = (p: LonLat) => geoDistance(p, center) < Math.PI / 2 - 0.02;

    g.clearRect(0, 0, W, H);
    // 海と縁
    g.beginPath(); path(SPHERE); g.fillStyle = "#cfe8f7"; g.fill();
    g.beginPath(); path(GRATICULE); g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 0.7; g.stroke();
    g.beginPath(); path(LAND); g.fillStyle = "#f4f1e6"; g.fill(); g.strokeStyle = "#9a9480"; g.lineWidth = 0.6; g.stroke();
    g.beginPath(); path(SPHERE); g.strokeStyle = "#7a8a99"; g.lineWidth = 1.2; g.stroke();

    // ルート: 通過した区間は実線、これからの区間は点線、次の区間は太く
    const n = v.cities.length, next = (v.here + 1) % n;
    const leg = (i: number): GeoPermissibleObjects => ({ type: "LineString", coordinates: [at(v.cities[i]), at(v.cities[(i + 1) % n])] });
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      if (i === v.here) continue;
      const done = i < v.here;
      g.setLineDash(done ? [] : [3, 4]);
      g.strokeStyle = done ? "rgba(233,66,107,.75)" : "rgba(80,90,100,.55)";
      g.lineWidth = done ? 2 : 1.2;
      g.beginPath(); path(leg(i)); g.stroke();
    }
    g.setLineDash([6, 5]); g.strokeStyle = "#e9426b"; g.lineWidth = 3;
    g.beginPath(); path(leg(v.here)); g.stroke();
    g.setLineDash([]);

    // 地点
    v.cities.forEach((c, i) => {
      if (!visible(at(c))) return;
      const [x, y] = proj(at(c))!;
      const done = i <= v.here;
      g.beginPath(); g.arc(x, y, i === next ? 5 : 3, 0, Math.PI * 2);
      g.fillStyle = i === next ? "#e9426b" : done ? "#c23b5c" : "#55606b";
      g.fill();
    });

    // 名前: 今いる場所（プレイヤー）と次の目的地
    const label = (p: LonLat, text: string, color: string, dy: number) => {
      if (!visible(p)) return;
      const [x, y] = proj(p)!;
      g.font = "bold 13px system-ui, sans-serif";
      g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.9)"; g.strokeText(text, x + 9, y + dy);
      g.fillStyle = color; g.fillText(text, x + 9, y + dy);
    };
    const here = v.cities[v.here], to = v.cities[next];
    label(at(to), to.name, "#e9426b", 14);
    if (visible(at(here))) {
      const [x, y] = proj(at(here))!;
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = "#e23"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
    }
    label(at(here), `${v.name}（${here.name}）`, "#1f2933", -6);
  }
}
