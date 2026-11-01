import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent } from "../scripts/content";
import { audioHash, audioJobs, pickForAccent } from "../scripts/tts/jobs";
import { contentPlugin } from "../scripts/vite-plugin-content";
import type { PlayQuestion } from "../src/content/schema";
import { audioUrl, pickAccentQuestion, ttsAccent } from "../src/lib/voices";

const root = join(import.meta.dirname, "..");
const content = loadContent(join(root, "content"));
const config = content.config!;

describe("audioJobs", () => {
  const jobs = audioJobs(config, content.sets);
  const tts = config.speech.tts!;

  it("全問に通常の声、なまりごとに決まった数の音声を作る", () => {
    const total = content.sets.reduce((n, s) => n + s.questions.length, 0);
    expect(jobs.filter((j) => j.slot === "default")).toHaveLength(total);
    expect(jobs.filter((j) => j.slot === "en-GB")).toHaveLength(tts.accentQuestions);
  });
  it("通常と同じ声のなまりは全問を対象にし、ファイルは共有する", () => {
    const us = jobs.filter((j) => j.slot === "en-US");
    expect(us).toHaveLength(jobs.filter((j) => j.slot === "default").length);
    expect(new Set(us.map((j) => j.hash))).toEqual(new Set(jobs.filter((j) => j.slot === "default").map((j) => j.hash)));
  });
  it("同じ入力からは同じ結果になる", () => {
    expect(audioJobs(config, content.sets)).toEqual(jobs);
  });
  it("文か声が変わるとファイル名が変わる", () => {
    const v = { voiceId: "Joanna", engine: "neural" as const };
    expect(audioHash("a", v, "polly")).not.toBe(audioHash("b", v, "polly"));
    expect(audioHash("a", v, "polly")).not.toBe(audioHash("a", { ...v, voiceId: "Amy" }, "polly"));
  });
  it("なまり用の選択は問題を足しても他の問題の当落がほぼ変わらない", () => {
    const qs = Array.from({ length: 100 }, (_, i) => ({ key: `s/q${i}` }));
    const before = pickForAccent(qs, "en-AU", 10).map((q) => q.key);
    const after = pickForAccent([...qs, { key: "s/new" }], "en-AU", 10).map((q) => q.key);
    expect(before.filter((k) => after.includes(k)).length).toBeGreaterThanOrEqual(9);
  });
  it("speech.tts が無ければ何も作らない", () => {
    expect(audioJobs({ ...config, speech: { ...config.speech, tts: undefined } }, content.sets)).toEqual([]);
  });
});

describe("contentPlugin", () => {
  const load = (audioDir: string, id: string) => {
    const plugin = contentPlugin({ root, audioDir });
    return (plugin.load as (id: string) => string).call({}, "\0" + id);
  };

  it("音声が無ければ問題だけを出す", () => {
    const code = load(mkdtempSync(join(tmpdir(), "audio-")), "virtual:content/set/eiken2");
    expect(code).not.toContain("import ");
    expect(code).not.toContain("audio:");
  });
  it("生成済みの音声だけを import して問題に付ける", () => {
    const dir = mkdtempSync(join(tmpdir(), "audio-"));
    const job = audioJobs(config, content.sets).find((j) => j.key.startsWith("eiken2/") && j.slot === "en-GB")!;
    writeFileSync(join(dir, `${job.hash}.mp3`), "");
    const code = load(dir, "virtual:content/set/eiken2");
    expect(code.match(/^import /gm)).toHaveLength(1);
    expect(code).toContain(`/audio/${job.hash}.mp3?no-inline`);
    expect(code).toContain(`"en-GB": a0`);
  });
});

describe("voices", () => {
  const q: PlayQuestion = { key: "s/a", setId: "s", answer: "a", sentence: "a", meaning: "", translation: "", audio: { default: "d.mp3", accents: { "en-AU": "au.mp3" } } };
  it("都市のなまりのうち声が設定されている最初のもの", () => {
    expect(ttsAccent(["en-NZ", "en-AU"], config)).toBe("en-NZ");
    expect(ttsAccent(["fr-FR", "fr-CA"], config)).toBeUndefined();
  });
  it("飛行船ではなまりの音声、無ければブラウザの声", () => {
    expect(audioUrl(q, false, "en-AU")).toBe("d.mp3");
    expect(audioUrl(q, true, "en-AU")).toBe("au.mp3");
    expect(audioUrl(q, true, "en-GB")).toBeUndefined();
  });
  it("飛行船の問題はそのなまりの音声がある問題から選ぶ", () => {
    const plain = { ...q, key: "s/b", audio: undefined };
    expect(pickAccentQuestion([plain, q], "en-AU", () => 0)).toBe(q);
    expect(pickAccentQuestion([plain], "en-AU")).toBeUndefined();
    expect(pickAccentQuestion([q], undefined)).toBeUndefined();
  });
});

