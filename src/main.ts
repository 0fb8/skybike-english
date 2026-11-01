// 画面とゲーム進行の制御
import "./style.css";
import type { Config, Manifest, Question } from "./content/schema";
import { escapeHtml as esc, splitAtAnswer } from "./content/text";
import { CITIES } from "./data/route";
import { legDistances } from "./lib/geo";
import { advance, altitudeGain, crashSetback, newProgress, QuestionBag, type Progress } from "./lib/quiz";
import { speak, stopSpeaking } from "./lib/speech";
import { loadJSON, saveJSON } from "./lib/storage";
import { drawMap } from "./render/map";
import { Scene } from "./render/scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LEGS = legDistances(CITIES);

type Mode = "loading" | "menu" | "play" | "review" | "crash" | "arrive";
type KeyedQuestion = Question & { key: string };

// ---------- state ----------
let CFG: Config;
let sets: (Manifest["sets"][number] & { questions: Question[] })[] = [];
let P: Progress = { ...newProgress(), ...loadJSON<Partial<Progress>>("progress", {}) };
let enabledSets: string[] | null = loadJSON<string[] | null>("sets", null);
let bag: QuestionBag;

let mode: Mode = "loading";
let alt = 55, boostUntil = 0, typed = "", isAirship = false;
let Q: KeyedQuestion | null = null;
let qStart = 0, speaking = false, missed = false, crashT = 0, flash = 0;

const perLeg = () => CFG.questionsPerLeg;
const nextCity = () => CITIES[(P.leg + 1) % CITIES.length];
const save = () => { saveJSON("progress", P); saveJSON("bag", bag?.remaining ?? []); };

// ---------- loading ----------
async function loadAll() {
  const base = import.meta.env.BASE_URL;
  const manifest: Manifest = await (await fetch(`${base}data/manifest.json`, { cache: "no-store" })).json();
  CFG = manifest.config;
  sets = await Promise.all(
    manifest.sets.map(async (s) => ({ ...s, questions: (await (await fetch(base + s.file, { cache: "no-store" })).json()) as Question[] })),
  );
  rebuildBag();
}

function activeSetIds() {
  return sets.filter((s) => (enabledSets ? enabledSets.includes(s.id) : s.enabled)).map((s) => s.id);
}
function pool(): Map<string, KeyedQuestion> {
  const ids = new Set(activeSetIds());
  const m = new Map<string, KeyedQuestion>();
  for (const s of sets) if (ids.has(s.id)) s.questions.forEach((q, i) => m.set(`${s.id}:${i}`, { ...q, key: `${s.id}:${i}` }));
  return m;
}
function rebuildBag() {
  bag = new QuestionBag([...pool().keys()], CFG.order, loadJSON<string[]>("bag", []));
}

// ---------- speech ----------
function sayQuestion(first: boolean) {
  if (!Q) return;
  const langs = isAirship ? nextCity().accent : CFG.speech.voice;
  const rate = isAirship ? CFG.speech.airshipRate : CFG.speech.rate;
  if (first) speaking = true;
  speak(Q.sentence, langs, rate, () => {
    if (first && speaking) { speaking = false; qStart = performance.now(); }
  });
}

// ---------- rendering helpers ----------
function blankSentence(q: Question) {
  const parts = splitAtAnswer(q.sentence, q.answer);
  if (!parts) return esc(q.sentence);
  const blank = CFG.display.showLetterCount ? "_ ".repeat(q.answer.length).trim() : "＿＿＿";
  return `${esc(parts.before)}<span class="blank">${blank}</span>${esc(parts.after)}`;
}
function highlightSentence(q: Question) {
  const parts = splitAtAnswer(q.sentence, q.answer);
  if (!parts) return esc(q.sentence);
  return `${esc(parts.before)}<span class="hit">${esc(parts.match)}</span>${esc(parts.after)}`;
}
function reviewHtml(ok: boolean, msg: string, q: Question) {
  return `<div class="${ok ? "ok" : "ng"}">${esc(msg)}</div><div>${highlightSentence(q)}</div>` +
    (q.translation ? `<div class="tr">${esc(q.translation)}</div>` : "");
}
function renderQuestion() {
  if (!Q) { $("wordBar").innerHTML = ""; $("meaning").textContent = ""; return; }
  const rest = CFG.display.showLetterCount ? `<span class="rest">${"·".repeat(Math.max(0, Q.answer.length - typed.length - 1))}</span>` : "";
  $("wordBar").innerHTML = esc(typed) + (typed.length < Q.answer.length ? `<span class="cur"></span>${rest}` : "");
  const showMeaning = isAirship ? CFG.airship.showMeaning : CFG.display.showMeaning;
  $("meaning").innerHTML = isAirship
    ? `✈ 飛行船！ <b>${esc(nextCity().region)}</b>なまり${showMeaning ? "：" + esc(Q.meaning) : "の例文を聞き取ろう"}`
    : showMeaning ? esc(Q.meaning) : "";
  if (mode === "play") {
    $("sentenceBox").innerHTML = CFG.display.sentence === "hidden"
      ? `<span class="muted">🔊 例文を聞いて、空欄に入る単語を書こう</span>`
      : `<div>${blankSentence(Q)}</div>`;
  }
}
function updateInfo() {
  const n = perLeg();
  $("dest").textContent = "→ " + nextCity().ja;
  $("remain").textContent = "あと " + Math.max(0, Math.round((LEGS[P.leg] * (n - P.legDone)) / n)).toLocaleString() + "km";
  $("count").textContent = mode === "play" || mode === "review" ? `${Math.floor(P.legDone)} / ${n}問` : "";
}
function feedback(text: string, cls = "") {
  const e = $("feedback");
  e.textContent = text; e.className = cls;
  clearTimeout((feedback as any).t);
  if (text) (feedback as any).t = setTimeout(() => (e.textContent = ""), 1600);
}

// ---------- question flow ----------
function nextQuestion() {
  const key = bag.next();
  Q = key ? pool().get(key) ?? null : null;
  if (!Q) { menu(); feedback("出題できる問題がありません", "ng"); return; }
  typed = ""; missed = false; mode = "play";
  isAirship = performance.now() >= boostUntil && Math.random() < CFG.airship.probability;
  if (isAirship) scene.showAirship();
  renderQuestion(); updateInfo();
  setTimeout(() => sayQuestion(true), 200);
}

function inputLetter(ch: string) {
  if (mode !== "play" || !Q) return;
  if (ch === Q.answer[typed.length]) {
    typed += ch; renderQuestion();
    if (typed === Q.answer) onCorrect();
  } else {
    alt = Math.max(0, alt - CFG.altitude.wrongPenalty); flash = 1; missed = true;
    feedback(`× ${ch}`, "ng");
  }
}

function onCorrect() {
  const seconds = speaking ? 0 : (performance.now() - qStart) / 1000;
  speaking = false;
  alt = Math.min(100, alt + altitudeGain(CFG.altitude, seconds));
  const boosting = performance.now() < boostUntil;
  P.answered++; if (!missed) P.correctFirst++;
  let msg = seconds < 4 ? "すばらしい！ ↑↑" : seconds < 9 ? "OK！ ↑" : "なんとか…";
  if (isAirship) {
    boostUntil = performance.now() + CFG.airship.boostSeconds * 1000;
    msg = `飛行船クリア！ ${CFG.airship.boostSeconds}秒間スピード${CFG.airship.multiplier}倍！`;
  }
  const r = advance(P, boosting ? CFG.airship.multiplier : 1, perLeg(), LEGS);
  P = r.progress;
  afterAnswer(true, msg, r.arrived);
}

function onPass() {
  if (mode !== "play" || !Q) return;
  speaking = false; stopSpeaking();
  alt = Math.max(0, alt - CFG.altitude.passPenalty);
  P.answered++;
  afterAnswer(false, `正解は ${Q.answer}（${Q.meaning}）`, false);
}

function afterAnswer(ok: boolean, msg: string, arrived: boolean) {
  save(); updateInfo();
  const go = () => (arrived ? arrive() : nextQuestion());
  if (CFG.display.showReview && Q) {
    mode = "review";
    $("sentenceBox").innerHTML = reviewHtml(ok, msg, Q);
    setTimeout(() => { if (mode === "review") go(); }, CFG.display.reviewMs + (ok ? 0 : 800));
  } else {
    feedback(msg, ok ? "ok" : "ng");
    setTimeout(go, 450);
  }
}

function crash() {
  mode = "crash"; crashT = 0; speaking = false; stopSpeaking();
  const r = crashSetback(P, CFG.altitude.crashSetback, perLeg(), LEGS);
  P = r.progress; save(); updateInfo();
  if (Q) $("sentenceBox").innerHTML = reviewHtml(false, `ザブーン！ 海に墜落… ${r.back}問ぶん戻された`, Q);
  Q = null; renderQuestion();
  setTimeout(() => { if (mode === "crash") { alt = CFG.altitude.start; nextQuestion(); } }, 2800);
}

// ---------- screens ----------
function showPanel(html: string) { $("playArea").style.display = "none"; const p = $("panel"); p.innerHTML = html; p.classList.add("show"); }
function hidePanel() { $("panel").classList.remove("show"); $("playArea").style.display = "flex"; }
function showMap(on: boolean) {
  $("mapScreen").classList.toggle("show", on);
  if (!on) return;
  $("mapName").textContent = P.name || "あなた";
  $("mapTotal").textContent = Math.round(P.totalKm).toLocaleString();
  drawMap($<HTMLCanvasElement>("mapCanvas"), { totalKm: P.totalKm, nextIndex: (P.leg + 1) % CITIES.length, name: P.name || "あなた", legs: LEGS });
}
const stampsHtml = () => `<div class="stamps">
  <div class="stamp ${P.laps >= 1 ? "" : "empty"}"><span>✈</span>一周</div>
  <div class="stamp ${P.laps >= 2 ? "" : "empty"}"><span>🌐</span>二周</div></div>`;
const statsHtml = () => {
  const rate = P.answered ? Math.round((P.correctFirst / P.answered) * 100) : 0;
  return `<div class="stats">周回 ${P.laps}　解答 ${P.answered}問　ノーミス正解率 ${rate}%</div>`;
};
const setsHtml = () => {
  const on = new Set(activeSetIds());
  return `<div class="sets">${sets.map((s) =>
    `<label><input type="checkbox" data-set="${esc(s.id)}" ${on.has(s.id) ? "checked" : ""}> ${esc(s.title)}（${s.count}問）</label>`).join("")}</div>`;
};

function menu() {
  mode = "menu"; Q = null; renderQuestion(); showMap(true); updateInfo();
  const remaining = P.legDone ? `・残り${perLeg() - Math.floor(P.legDone)}問` : "";
  showPanel(`
    ${P.name ? `<h2>${esc(P.name)} さん、おかえり！</h2>` : `<h2>空とぶ自転車で世界一周</h2><div>なまえ：<input id="nameInput" maxlength="8" placeholder="なまえ"></div>`}
    <div>次の目的地は <b>${esc(nextCity().name)}</b>（${perLeg()}問${remaining}）</div>
    <button class="big" id="btnStart">スタート</button>
    ${setsHtml()}${stampsHtml()}${statsHtml()}`);
  document.querySelectorAll<HTMLInputElement>("[data-set]").forEach((cb) => (cb.onchange = () => {
    enabledSets = [...document.querySelectorAll<HTMLInputElement>("[data-set]:checked")].map((c) => c.dataset.set!);
    saveJSON("sets", enabledSets); rebuildBag();
  }));
  $("btnStart").onclick = start;
}

function arrive() {
  mode = "arrive"; Q = null; renderQuestion(); stopSpeaking();
  const here = CITIES[P.leg];
  const lapMsg = P.leg !== 0 ? "" :
    P.laps === 1 ? "<div class='ok'>世界一周達成！ 飛行機のハンコをゲット！</div>" :
    P.laps === 2 ? "<div class='ok'>二周達成！ 地球儀のハンコをゲット！</div>" :
    `<div class='ok'>${P.laps}周目達成！</div>`;
  showMap(true); updateInfo();
  showPanel(`<span class="end">終了</span>
    <h2>${esc(here.ja)}（${esc(here.name)}）に到着！</h2>${lapMsg}
    <div>次の目的地は <b>${esc(nextCity().name)}</b></div>
    <button class="big" id="btnStart">スタート</button>
    ${stampsHtml()}${statsHtml()}`);
  $("btnStart").onclick = start;
}

function start() {
  const ni = document.getElementById("nameInput") as HTMLInputElement | null;
  if (ni) { P.name = ni.value.trim() || "あなた"; save(); }
  if (!pool().size) { feedback("問題集を1つ以上選んでください", "ng"); return; }
  showMap(false); hidePanel();
  alt = CFG.altitude.start;
  nextQuestion();
}

// ---------- main loop ----------
const scene = new Scene($<HTMLCanvasElement>("scene"));
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const boosting = now < boostUntil;
  const flying = mode === "play" || mode === "review";
  if (mode === "play" && Q && !speaking) {
    alt -= (CFG.altitude.decayPerSec + P.laps * CFG.altitude.decayIncreasePerLap) * dt;
    if (alt <= 0) { alt = 0; crash(); }
  }
  if (mode === "crash") crashT += dt;
  if (flash > 0) flash = Math.max(0, flash - dt * 3);
  const s = { altitude: alt, flying, boosting: boosting && flying, crashing: mode === "crash", crashT, airshipVisible: isAirship && !!Q, flash };
  scene.update(dt, s);
  scene.draw(now, s);

  $("altFill").style.height = alt + "%";
  $("altFill").style.background = alt < 25 ? "#e9426b" : alt < 50 ? "#f2b632" : "#2fb36b";
  $("boost").style.display = s.boosting ? "block" : "none";
  $("count").style.display = s.boosting ? "none" : "block";
  if (s.boosting) $("boost").textContent = `×${CFG.airship.multiplier} スピード! ${Math.ceil((boostUntil - now) / 1000)}`;
  requestAnimationFrame(loop);
}

// ---------- input ----------
function buildKeyboard() {
  const kb = $("kbd");
  const add = (label: string, fn: () => void, cls = "") => {
    const b = document.createElement("button"); b.textContent = label; b.className = cls; b.onclick = fn; kb.appendChild(b);
  };
  for (const ch of "qwertyuiopasdfghjklzxcvbnm") add(ch, () => inputLetter(ch));
  add("書き直し", () => { if (mode === "play") { typed = ""; renderQuestion(); } }, "wide");
  add("⌫", () => { if (mode === "play") { typed = typed.slice(0, -1); renderQuestion(); } }, "wide");
}
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const startBtn = document.getElementById("btnStart");
  if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox") { if (e.key === "Enter") startBtn?.click(); return; }
  if (e.key === "Enter" && startBtn && (mode === "menu" || mode === "arrive")) { startBtn.click(); e.preventDefault(); return; }
  if (mode !== "play") return;
  if (/^[a-zA-Z]$/.test(e.key)) { inputLetter(e.key.toLowerCase()); e.preventDefault(); }
  else if (e.key === "Backspace") { typed = typed.slice(0, -1); renderQuestion(); e.preventDefault(); }
  else if (e.key === " ") { sayQuestion(false); e.preventDefault(); }
});
$("btnListen").onclick = () => sayQuestion(false);
$("btnPass").onclick = onPass;
$("btnQuit").onclick = () => { save(); speaking = false; stopSpeaking(); menu(); };

// ---------- boot ----------
buildKeyboard();
showPanel("<div>読み込み中…</div>");
loadAll()
  .then(() => { requestAnimationFrame(loop); menu(); })
  .catch((err) => showPanel(`<div class="ng">問題データを読み込めませんでした</div><div class="small">${esc(String(err))}</div>`));
