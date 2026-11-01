// 上画面: 空・雲・島・海・自転車・飛行船
export interface SceneState {
  altitude: number; // 0..100
  flying: boolean;
  boosting: boolean;
  crashing: boolean;
  crashT: number;
  airshipVisible: boolean;
  flash: number; // 0..1
}

export class Scene {
  private g: CanvasRenderingContext2D;
  private clouds = Array.from({ length: 7 }, () => ({ x: Math.random() * 480, y: 70 + Math.random() * 180, s: 0.6 + Math.random() * 0.8 }));
  private islands = [{ x: 520, w: 120 }];
  private waveT = 0;
  private airshipX = 600;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
  }

  update(dt: number, s: SceneState) {
    const speed = s.flying ? (s.boosting ? 220 : 110) : 25;
    this.waveT += dt * speed;
    for (const c of this.clouds) {
      c.x -= speed * dt * c.s * 0.5;
      if (c.x < -80) { c.x = 520 + Math.random() * 80; c.y = 70 + Math.random() * 180; }
    }
    for (const i of this.islands) i.x -= speed * dt;
    this.islands = this.islands.filter((i) => i.x > -i.w - 20);
    if (this.islands.length < 2 && Math.random() < dt * 0.3) this.islands.push({ x: 500, w: 60 + Math.random() * 140 });
    if (s.airshipVisible) { if (this.airshipX > 330) this.airshipX -= dt * 120; }
    else if (this.airshipX < 600) this.airshipX += dt * 200;
  }

  showAirship() { this.airshipX = 520; }

  draw(now: number, s: SceneState) {
    const g = this.g, W = this.canvas.width, H = this.canvas.height, sea = H - 70;
    const grd = g.createLinearGradient(0, 0, 0, sea);
    grd.addColorStop(0, "#7cc3f0"); grd.addColorStop(1, "#d9f0fb");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    g.fillStyle = "rgba(255,255,255,.9)";
    for (const c of this.clouds) {
      g.beginPath(); g.ellipse(c.x, c.y, 30 * c.s, 12 * c.s, 0, 0, 7); g.ellipse(c.x + 18 * c.s, c.y - 8 * c.s, 20 * c.s, 12 * c.s, 0, 0, 7); g.fill();
    }
    for (const i of this.islands) {
      g.fillStyle = "#6aa84f"; g.beginPath(); g.ellipse(i.x + i.w / 2, sea + 2, i.w / 2, 18, 0, Math.PI, 0); g.fill();
      g.fillStyle = "#3d7a2d"; g.fillRect(i.x + i.w * 0.3, sea - 26, 4, 14); g.beginPath(); g.arc(i.x + i.w * 0.3 + 2, sea - 28, 9, 0, 7); g.fill();
    }
    g.fillStyle = "#2f7fc1"; g.fillRect(0, sea, W, H - sea);
    g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = sea + 12 + r * 18 + Math.sin((x + this.waveT * (1 + r * 0.3)) / 22) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    if (this.airshipX < 560) this.drawAirship(this.airshipX, 130 + Math.sin(now / 600) * 6);

    const top = 95, bottom = sea - 26, bx = 150;
    let by = bottom - (s.altitude / 100) * (bottom - top);
    if (s.crashing) by = Math.min(sea + 10, by + s.crashT * s.crashT * 400);
    else by += Math.sin(now / 300) * 2;
    this.drawBike(bx, by, now, s);

    if (s.crashing && by >= sea - 10) {
      g.fillStyle = "rgba(255,255,255,.85)";
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI, r = 20 + s.crashT * 40; g.beginPath(); g.arc(bx + Math.cos(a) * r, sea + Math.sin(a) * r * 0.6, 5, 0, 7); g.fill(); }
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
