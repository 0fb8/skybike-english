// 到着画面の世界地図（正距円筒図法）
import { CITIES, LAND } from "../data/route";
import { positionAt, unwrapLon } from "../lib/geo";

const LAT_TOP = 82, LAT_BOTTOM = -58;

export function drawMap(canvas: HTMLCanvasElement, opts: { totalKm: number; nextIndex: number; name: string; legs: number[] }) {
  const g = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  const proj = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * W, ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H];

  g.fillStyle = "#cfe8f7"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#f4f1e6"; g.strokeStyle = "#9a9480"; g.lineWidth = 1;
  for (const poly of LAND) {
    g.beginPath();
    poly.forEach(([lo, la], i) => { const [x, y] = proj(lo, la); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.fill(); g.stroke();
  }

  // ルート（日付変更線をまたぐ区間は左右にずらして 2 回描く）
  g.setLineDash([4, 4]); g.strokeStyle = "#888"; g.lineWidth = 1.5;
  CITIES.forEach((a, i) => {
    const b = CITIES[(i + 1) % CITIES.length];
    const bl = unwrapLon(a.lon, b.lon);
    for (const off of [-360, 0, 360]) {
      const [x1, y1] = proj(a.lon + off, a.lat), [x2, y2] = proj(bl + off, b.lat);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
  });
  g.setLineDash([]);

  CITIES.forEach((c, i) => {
    const [x, y] = proj(c.lon, c.lat);
    const isNext = i === opts.nextIndex;
    g.fillStyle = isNext ? "#e9426b" : "#555";
    g.beginPath(); g.arc(x, y, isNext ? 4 : 3, 0, Math.PI * 2); g.fill();
    if (isNext) { g.font = "bold 10px sans-serif"; g.fillText(c.name, x + 6, y + 12); }
  });

  const me = positionAt(CITIES, opts.legs, opts.totalKm);
  const [x, y] = proj(me.lon, me.lat);
  g.fillStyle = "#e23"; g.strokeStyle = "#fff"; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.stroke();
  g.font = "bold 11px sans-serif"; g.fillText(opts.name, x + 8, y - 4);
}
