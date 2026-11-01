// 高解像度ディスプレイでもぼやけないよう、canvas の画素数を devicePixelRatio 倍にする。
// 描画側は HTML に書いた width/height（論理サイズ）の座標系のまま描ける。
export function setupCanvas(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; width: number; height: number } {
  canvas.dataset.w ??= String(canvas.width);
  canvas.dataset.h ??= String(canvas.height);
  const width = Number(canvas.dataset.w), height = Number(canvas.dataset.h);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, width, height };
}
