// 画面の組み立て。ゲームの進行は game/game.ts、ここは
//   入力 → Game のメソッド呼び出し
//   Game の state → 画面（毎フレーム、変化があったところだけ書き換える）
//   Game のイベント → 読み上げ・保存
// をつなぐだけにする。
import "./style.css";
import { config, sets } from "virtual:content";
import type { PlayQuestion } from "./content/schema";
import { currentWord, escapeHtml as esc, maskLetters, revealSentence, splitAtAnswer } from "./content/text";
import { CITIES } from "./data/route";
import { Game, type AnswerResult, type GameEvent, type GameState, type Mode } from "./game/game";
import { legDistances } from "./lib/geo";
import { QuestionBag, totalKm } from "./lib/quiz";
import { loadSave, writeSave } from "./lib/save";
import { prefetchAudio, speak, stopSpeaking, unlockAudio } from "./lib/speech";
import { audioUrl, pickAccentQuestion, pickSpeaker, ttsAccent } from "./lib/voices";
import { drawMap } from "./render/map";
import { Scene } from "./render/scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LEGS = legDistances(CITIES);
const SPEAK_DELAY_MS = 200;

// ---------- 保存データと出題 ----------
const save = loadSave();
const loadedSets = new Map<string, PlayQuestion[]>();
let pool = new Map<string, PlayQuestion>();
let bag: QuestionBag | null = null;

const activeSetIds = () => sets.filter((s) => (save.enabledSets ? save.enabledSets.includes(s.id) : s.enabled)).map((s) => s.id);

/** 選ばれている問題集を読み込み、出題の袋を作り直す */
async function preparePool(): Promise<void> {
  const ids = activeSetIds();
  await Promise.all(sets.filter((s) => ids.includes(s.id) && !loadedSets.has(s.id)).map(async (s) => loadedSets.set(s.id, await s.load())));
  pool = new Map(ids.flatMap((id) => loadedSets.get(id) ?? []).map((q) => [q.key, q]));
  bag = new QuestionBag([...pool.keys()], config.order, bag?.remaining ?? save.bag);
}

function persist() {
  save.progress = game.state.progress;
  if (bag) save.bag = bag.remaining;
  writeSave(save);
}

// ---------- ゲーム ----------
const nextCity = () => CITIES[(game.state.progress.leg + 1) % CITIES.length];
const nextAccent = () => ttsAccent(nextCity().accent, config);

function drawQuestion({ airship }: { airship: boolean }): PlayQuestion | undefined {
  // 飛行船は、次の都市のなまりで音声を作ってある問題から出す（無ければ通常の順番で出し、ブラウザの声でなまりを試みる）
  const special = airship ? pickAccentQuestion(pool.values(), nextAccent()) : undefined;
  if (special) return special;
  const k = bag?.next();
  return k ? pool.get(k) : undefined;
}

/** 次に出る問題の音声を先に読み込んでおく（読む人物はまだ決まっていないので全員ぶん） */
function prefetchNext() {
  const k = bag?.peek();
  const next = k ? pool.get(k) : undefined;
  for (const url of Object.values(next?.audio?.speakers ?? {})) prefetchAudio(url);
}

/** いまの問題を読む人物（config.yaml の speech.tts.speakers の名前） */
let speaker: { turn: number; name: string | undefined } = { turn: -1, name: undefined };

function onGameEvent(e: GameEvent) {
  switch (e.type) {
    case "speak": {
      const q = game.state.question;
      // 読む人物は問題ごとにランダムに決め、聞き直しのときは同じ人物で読む
      if (e.first || speaker.turn !== e.turn) speaker = { turn: e.turn, name: q ? pickSpeaker(q) : undefined };
      const req = {
        text: e.text,
        url: q ? audioUrl(q, e.airship, nextAccent(), speaker.name) : undefined,
        langs: e.airship ? nextCity().accent : config.speech.voice,
        rate: e.airship ? config.speech.airshipRate : config.speech.rate,
      };
      if (!e.first) { speak(req); break; }
      if (req.url) prefetchAudio(req.url);
      prefetchNext();
      setTimeout(() => {
        if (game.state.turn !== e.turn || game.state.mode !== "play") return;
        speak(req, () => game.speechEnded(e.turn));
      }, SPEAK_DELAY_MS);
      break;
    }
    case "stopSpeaking": stopSpeaking(); break;
    case "wrongLetter": feedback(`× ${e.letter}`, "ng"); break;
    case "progress": persist(); break;
    case "noQuestions": feedback("出題できる問題がありません", "ng"); break;
  }
}

const game = new Game({
  config,
  legs: LEGS,
  progress: save.progress,
  draw: drawQuestion,
  emit: onGameEvent,
});

async function start() {
  unlockAudio(); // クリックの処理中に呼ぶ必要がある
  const ni = document.getElementById("nameInput") as HTMLInputElement | null;
  if (ni) game.setName(ni.value.trim() || "あなた");
  if (!activeSetIds().length) { feedback("問題集を1つ以上選んでください", "ng"); return; }
  const btn = document.getElementById("btnStart") as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    await preparePool();
  } catch (err) {
    feedback("問題データを読み込めませんでした", "ng");
    console.error(err);
    if (btn) btn.disabled = false;
    return;
  }
  game.start(performance.now());
}

// ---------- 表示部品 ----------
/** 書き取り中の例文（書けた部分 → カーソル → 残りの伏せ字） */
function dictationHtml(q: PlayQuestion, typed: number) {
  const { done, rest } = revealSentence(q.sentence, typed);
  const tail = config.display.showLetterCount ? `<span class="rest">${esc(maskLetters(rest))}</span>` : "";
  return `<div class="dictation">${esc(done)}<span class="cur"></span>${tail}</div>`;
}
function highlightSentence(q: PlayQuestion) {
  const parts = splitAtAnswer(q.sentence, q.answer);
  if (!parts) return esc(q.sentence);
  return `${esc(parts.before)}<span class="hit">${esc(parts.match)}</span>${esc(parts.after)}`;
}
/** 解答後の表示。日本語（和訳・重要語の意味）は正解したときだけ出す */
function reviewHtml(r: AnswerResult) {
  const q = r.question;
  return `<div class="${r.ok ? "ok" : "ng"}">${esc(r.message)}</div><div>${highlightSentence(q)}</div>` +
    (r.ok ? `<div class="tr">${esc(q.translation)}</div><div class="tr"><b>${esc(q.answer)}</b>：${esc(q.meaning)}</div>` : "");
}
function feedback(text: string, cls = "") {
  const e = $("feedback");
  e.textContent = text; e.className = cls;
  clearTimeout(feedbackTimer);
  if (text) feedbackTimer = setTimeout(() => (e.textContent = ""), 1600);
}
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

const stampsHtml = (laps: number) => `<div class="stamps">
  <div class="stamp ${laps >= 1 ? "" : "empty"}"><span>✈</span>一周</div>
  <div class="stamp ${laps >= 2 ? "" : "empty"}"><span>🌐</span>二周</div></div>`;
const statsHtml = (s: GameState) => {
  const p = s.progress, rate = p.answered ? Math.round((p.correctFirst / p.answered) * 100) : 0;
  return `<div class="stats">周回 ${p.laps}　解答 ${p.answered}問　ノーミス正解率 ${rate}%</div>`;
};
const setsHtml = () => {
  const on = new Set(activeSetIds());
  return `<div class="sets">${sets.map((s) =>
    `<label><input type="checkbox" data-set="${esc(s.id)}" ${on.has(s.id) ? "checked" : ""}> ${esc(s.title)}（${s.count}問）</label>`).join("")}</div>`;
};

// ---------- 画面（モードが変わったときに切り替える） ----------
function showPanel(html: string) { $("playArea").style.display = "none"; const p = $("panel"); p.innerHTML = html; p.classList.add("show"); }
function hidePanel() { $("panel").classList.remove("show"); $("playArea").style.display = "flex"; }
function showMap(on: boolean) {
  $("mapScreen").classList.toggle("show", on);
  if (!on) return;
  const p = game.state.progress, name = p.name || "あなた";
  $("mapName").textContent = name;
  const km = totalKm(p, LEGS);
  $("mapTotal").textContent = Math.round(km).toLocaleString();
  drawMap($<HTMLCanvasElement>("mapCanvas"), { totalKm: km, nextIndex: (p.leg + 1) % CITIES.length, name, legs: LEGS });
}

function showMenu(s: GameState) {
  const p = s.progress, here = CITIES[p.leg % CITIES.length];
  const failed = s.lastFlightFailed ? `<div class="ng">海に墜落して渡航失敗… ${esc(here.ja)}からもう一度！</div>` : "";
  showMap(true);
  showPanel(`
    ${p.name ? `<h2>${esc(p.name)} さん、おかえり！</h2>` : `<h2>空とぶ自転車で世界一周</h2><div>なまえ：<input id="nameInput" maxlength="8" placeholder="なまえ"></div>`}
    ${failed}
    <div>${esc(here.ja)}から <b>${esc(nextCity().name)}</b> へ（${game.perLeg}問）</div>
    <button class="big" id="btnStart">スタート</button>
    ${setsHtml()}${stampsHtml(p.laps)}${statsHtml(s)}`);
  document.querySelectorAll<HTMLInputElement>("[data-set]").forEach((cb) => (cb.onchange = () => {
    save.enabledSets = [...document.querySelectorAll<HTMLInputElement>("[data-set]:checked")].map((c) => c.dataset.set!);
    writeSave(save);
  }));
  $("btnStart").onclick = start;
}

function showArrive(s: GameState) {
  const p = s.progress, here = CITIES[p.leg];
  const lapMsg = p.leg !== 0 ? "" :
    p.laps === 1 ? "<div class='ok'>世界一周達成！ 飛行機のハンコをゲット！</div>" :
    p.laps === 2 ? "<div class='ok'>二周達成！ 地球儀のハンコをゲット！</div>" :
    `<div class='ok'>${p.laps}周目達成！</div>`;
  showMap(true);
  showPanel(`<span class="end">終了</span>
    <h2>${esc(here.ja)}（${esc(here.name)}）に到着！</h2>${lapMsg}
    <div>次の目的地は <b>${esc(nextCity().name)}</b></div>
    <button class="big" id="btnStart">スタート</button>
    ${stampsHtml(p.laps)}${statsHtml(s)}`);
  $("btnStart").onclick = start;
}

function onModeChange(from: Mode | null, to: Mode, s: GameState) {
  if (to === "idle") showMenu(s);
  else if (to === "arrived") showArrive(s);
  else if (from === null || from === "idle" || from === "arrived") { showMap(false); hidePanel(); }
  if (to === "review" && !config.display.showReview && s.result) feedback(s.result.message, s.result.ok ? "ok" : "ng");
  if (to === "play" && s.isAirship) scene.showAirship();
}

// ---------- プレイ中の表示（関係する値が変わったときだけ書き換える） ----------
function renderPlay(s: GameState) {
  const q = s.question;
  if (!q) { $("wordBar").innerHTML = ""; $("meaning").textContent = ""; }
  else {
    // 上画面: 入力中の単語
    const w = currentWord(q.sentence, s.typed);
    const rest = config.display.showLetterCount ? `<span class="rest">${"·".repeat(Math.max(0, w.restLetters - 1))}</span>` : "";
    $("wordBar").innerHTML = esc(w.done) + (w.restLetters ? `<span class="cur"></span>${rest}` : "");
    // 出題中は日本語を出さない
    $("meaning").innerHTML = s.isAirship
      ? `✈ 飛行船！ <b>${esc(nextCity().region)}</b>なまりの例文を聞き取ろう`
      : "🔊 例文をまるごと書き取ろう";
  }
  if (s.mode === "play" && q) {
    $("sentenceBox").innerHTML = dictationHtml(q, s.typed);
  } else if (s.result && (s.mode === "crash" || (s.mode === "review" && config.display.showReview))) {
    $("sentenceBox").innerHTML = reviewHtml(s.result);
  }
  const p = s.progress, n = game.perLeg;
  $("dest").textContent = "→ " + nextCity().ja;
  $("remain").textContent = "あと " + Math.max(0, Math.round((LEGS[p.leg] * (n - s.legDone)) / n)).toLocaleString() + "km";
  $("count").textContent = s.mode === "play" || s.mode === "review" ? `${Math.floor(s.legDone)} / ${n}問` : "";
}

// ---------- メインループ ----------
const scene = new Scene($<HTMLCanvasElement>("scene"));
let last = performance.now();
let lastMode: Mode | null = null;
let lastView = "";

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  game.tick(now, dt);
  const s = game.state;

  if (s.mode !== lastMode) { onModeChange(lastMode, s.mode, s); lastMode = s.mode; }
  const view = [s.mode, s.turn, s.typed, s.isAirship, s.result?.message, s.legDone, s.progress.leg].join("|");
  if (view !== lastView) { renderPlay(s); lastView = view; }

  const boosting = game.isBoosting(now) && game.isFlying();
  const sceneState = {
    altitude: s.altitude, flying: game.isFlying(), boosting, crashing: s.mode === "crash", crashT: s.crashT,
    airshipVisible: s.isAirship && !!s.question, flash: s.flash,
  };
  scene.update(dt, sceneState);
  scene.draw(now, sceneState);

  $("altFill").style.height = s.altitude + "%";
  $("altFill").style.background = s.altitude < 25 ? "#e9426b" : s.altitude < 50 ? "#f2b632" : "#2fb36b";
  $("boost").style.display = boosting ? "block" : "none";
  $("count").style.display = boosting ? "none" : "block";
  if (boosting) $("boost").textContent = `×${config.airship.multiplier} スピード! ${Math.ceil((s.boostUntil - now) / 1000)}`;
  requestAnimationFrame(loop);
}

// ---------- 入力 ----------
function buildKeyboard() {
  for (const keys of ["qwertyuiop", "asdfghjkl", "zxcvbnm"]) {
    const row = document.createElement("div");
    row.className = "krow";
    for (const ch of keys) {
      const b = document.createElement("button");
      b.textContent = ch;
      b.onclick = () => game.letter(ch, performance.now());
      row.appendChild(b);
    }
    $("kbd").appendChild(row);
  }
}
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const startBtn = document.getElementById("btnStart");
  const mode = game.state.mode;
  if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox") { if (e.key === "Enter") startBtn?.click(); return; }
  if (e.key === "Enter" && startBtn && (mode === "idle" || mode === "arrived")) { startBtn.click(); e.preventDefault(); return; }
  if (mode !== "play") return;
  if (/^[a-zA-Z]$/.test(e.key)) { game.letter(e.key.toLowerCase(), performance.now()); e.preventDefault(); }
  else if (e.key === " ") { game.replay(); e.preventDefault(); }
});
$("btnListen").onclick = () => game.replay();
$("btnPass").onclick = () => game.pass(performance.now());
$("btnQuit").onclick = () => game.quit();

// ---------- 起動 ----------
buildKeyboard();
requestAnimationFrame(loop);
