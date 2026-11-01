// Web Speech API による読み上げ。端末にある声から言語の優先順で選ぶ。
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

/** 読み上げる。終わったら（または失敗・タイムアウトしたら）onEnd を一度だけ呼ぶ */
export function speak(text: string, langs: string[], rate: number, onEnd?: () => void): void {
  let done = false;
  const finish = () => { if (!done) { done = true; onEnd?.(); } };
  if (!supported) { finish(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(langs) as SpeechSynthesisVoice | undefined;
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = langs[0];
  u.rate = rate;
  u.onend = finish;
  u.onerror = finish;
  setTimeout(finish, 2500 + text.length * 90); // onend が来ない環境への保険
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (supported) speechSynthesis.cancel();
}
