// 読み上げ。事前生成した音声ファイルがあればそれを再生し、無ければ（または再生に失敗したら）
// Web Speech API（端末にある声）で読む。
let voices: SpeechSynthesisVoice[] = [];
const supported = typeof window !== "undefined" && "speechSynthesis" in window;

if (supported) {
  const refresh = () => { voices = speechSynthesis.getVoices(); };
  refresh();
  speechSynthesis.onvoiceschanged = refresh;
}

export function pickVoice(langs: string[], list: Pick<SpeechSynthesisVoice, "lang">[] = voices) {
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  for (const l of langs) { const v = list.find((v) => norm(v.lang) === norm(l)); if (v) return v; }
  for (const l of langs) { const v = list.find((v) => norm(v.lang).startsWith(norm(l).slice(0, 2))); if (v) return v; }
  return list.find((v) => norm(v.lang).startsWith("en"));
}

export interface SpeakRequest {
  text: string;
  /** 事前生成した音声。無ければブラウザの声で読む */
  url?: string;
  /** ブラウザの声で読むときの言語（先頭から順に探す） */
  langs: string[];
  rate: number;
}

/** 呼び出しごとに増える番号。前の読み上げの終了通知を無視するのに使う */
let current = 0;
let audioEl: HTMLAudioElement | null = null;
const audio = () => (audioEl ??= new Audio());

/** 読み上げる。終わったら（または失敗・タイムアウトしたら）onEnd を一度だけ呼ぶ */
export function speak(req: SpeakRequest, onEnd?: () => void): void {
  const token = ++current;
  let done = false;
  const finish = () => { if (!done && token === current) { done = true; onEnd?.(); } };
  stopAll();
  if (req.url) playFile(req, token, finish);
  else speakWithVoice(req, finish);
}

function playFile(req: SpeakRequest, token: number, finish: () => void) {
  const a = audio();
  let fellBack = false;
  const fallback = () => {
    if (fellBack || token !== current) return;
    fellBack = true;
    speakWithVoice(req, finish);
  };
  a.onended = finish;
  a.onerror = fallback;
  a.src = req.url!;
  a.playbackRate = req.rate;
  a.preservesPitch = true;
  // 自動再生の制限などで再生できなければブラウザの声に切り替える
  a.play().catch(fallback);
}

function speakWithVoice(req: SpeakRequest, finish: () => void) {
  if (!supported) { finish(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(req.text);
  const v = pickVoice(req.langs) as SpeechSynthesisVoice | undefined;
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = req.langs[0];
  u.rate = req.rate;
  u.onend = finish;
  u.onerror = finish;
  setTimeout(finish, 2500 + req.text.length * 90); // onend が来ない環境への保険
  speechSynthesis.speak(u);
}

function stopAll() {
  if (supported) speechSynthesis.cancel();
  if (audioEl) { audioEl.onended = audioEl.onerror = null; audioEl.pause(); }
}

export function stopSpeaking(): void {
  current++;
  stopAll();
}

/**
 * iOS などは、ユーザーの操作の中で一度再生しないと以後の音声を自動再生できない。
 * スタートボタンなどのクリック処理の中で呼ぶ。
 */
export function unlockAudio(): void {
  const a = audio();
  if (a.dataset.unlocked) return;
  a.dataset.unlocked = "1";
  a.src = SILENT_WAV;
  a.play().catch(() => { /* 次の操作で再挑戦される */ delete a.dataset.unlocked; });
}

/** 無音の短い WAV（data URL） */
const SILENT_WAV = (() => {
  const samples = 800, rate = 8000, b = new DataView(new ArrayBuffer(44 + samples));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); b.setUint32(4, 36 + samples, true); str(8, "WAVE"); str(12, "fmt ");
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, rate, true);
  b.setUint32(28, rate, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true); str(36, "data"); b.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) b.setUint8(44 + i, 128);
  let bin = ""; new Uint8Array(b.buffer).forEach((x) => (bin += String.fromCharCode(x)));
  return "data:audio/wav;base64," + btoa(bin);
})();
