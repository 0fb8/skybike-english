// 高解像度ディスプレイでもぼやけないよう、canvas の画素数を devicePixelRatio 倍にする。
// 描画側は論理サイズ（CSS のピクセル）の座標系のまま描ける。
export function setupCanvas(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; width: number; height: number } {
  canvas.dataset.w ??= String(canvas.width);
  canvas.dataset.h ??= String(canvas.height);
  const width = Number(canvas.dataset.w), height = Number(canvas.dataset.h);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, width, height };
}

/** canvas の論理サイズを、画面に表示されている大きさに合わせる（ウィンドウに合わせて描くため） */
export function fitCanvas(canvas: HTMLCanvasElement): void {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return; // 非表示のときは前の大きさのまま
  canvas.dataset.w = String(Math.round(r.width));
  canvas.dataset.h = String(Math.round(r.height));
}
