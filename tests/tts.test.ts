import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent } from "../scripts/content";
import { audioHash, audioJobs, pickForAccent } from "../scripts/tts/jobs";
import { LocalStore } from "../scripts/tts/store";
import { contentPlugin } from "../scripts/vite-plugin-content";
import type { PlayQuestion } from "../src/content/schema";
import { audioUrl, pickAccentQuestion, pickSpeaker, ttsAccent } from "../src/lib/voices";

const root = join(import.meta.dirname, "..");
const content = loadContent(join(root, "content"));
const config = content.config!;

describe("audioJobs", () => {
  const jobs = audioJobs(config, content.sets);
  const tts = config.speech.tts!;

  const speakerNames = Object.keys(tts.speakers);
  const forSpeaker = (name: string) => jobs.filter((j) => j.kind === "speaker" && j.slot === name);

  it("全問を全員ぶん、なまりごとに決まった数の音声を作る", () => {
    const total = content.sets.reduce((n, s) => n + s.questions.length, 0);
    for (const name of speakerNames) expect(forSpeaker(name)).toHaveLength(total);
    expect(jobs.filter((j) => j.kind === "accent" && j.slot === "en-GB")).toHaveLength(tts.accentQuestions);
  });
  it("通常の人物と同じ声のなまりは全問を対象にし、ファイルは共有する", () => {
    const name = speakerNames.find((n) => tts.speakers[n].voiceId === tts.accents["en-US"].voiceId)!;
    const us = jobs.filter((j) => j.kind === "accent" && j.slot === "en-US");
    expect(new Set(us.map((j) => j.hash))).toEqual(new Set(forSpeaker(name).map((j) => j.hash)));
  });
  it("人物が違えばファイルも違う", () => {
    const [a, b] = speakerNames.map((n) => new Set(forSpeaker(n).map((j) => j.hash)));
    expect([...a].some((h) => b.has(h))).toBe(false);
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
  const load = (audioDir: string, id: string, contentDir?: string) => {
    const plugin = contentPlugin({ root, audioDir, contentDir });
    return (plugin.load as (id: string) => string).call({}, "\0" + id);
  };

  it("音声が無ければ問題だけを出す", () => {
    const code = load(mkdtempSync(join(tmpdir(), "audio-")), "virtual:content/set/eiken2");
    expect(code).not.toContain("import ");
    expect(code).not.toContain("audio:");
  });
  it("生成済みの音声だけを import して問題に付ける", () => {
    const dir = mkdtempSync(join(tmpdir(), "audio-"));
    const all = audioJobs(config, content.sets);
    const job = all.find((j) => j.key.startsWith("eiken2/") && j.slot === "en-GB")!;
    const spk = all.find((j) => j.key === job.key && j.kind === "speaker" && j.slot === "nate")!;
    writeFileSync(join(dir, `${job.hash}.mp3`), "");
    writeFileSync(join(dir, `${spk.hash}.mp3`), "");
    const code = load(dir, "virtual:content/set/eiken2");
    expect(code.match(/^import /gm)).toHaveLength(2);
    expect(code).toContain(`/audio/${job.hash}.mp3?no-inline`);
    expect(code).toMatch(/speakers: \{ "nate": a\d \}/);
    expect(code).toMatch(/"en-GB": a\d/);
  });
});

describe("contentPlugin（音声を S3 に置くとき）", () => {
  // config.yaml に storage を足した content/ の複製
  const dir = mkdtempSync(join(tmpdir(), "content-"));
  cpSync(join(root, "content"), dir, { recursive: true });
  const yaml = readFileSync(join(dir, "config.yaml"), "utf8")
    .replace("    accentQuestions:", "    storage: { bucket: b, baseUrl: \"https://cdn.example\" }\n    accentQuestions:");
  writeFileSync(join(dir, "config.yaml"), yaml);

  it("全部の音声に配信元の URL を付け、ビルドには含めない", () => {
    const plugin = contentPlugin({ root, contentDir: dir, audioDir: mkdtempSync(join(tmpdir(), "audio-")) });
    const code = (plugin.load as (id: string) => string).call({}, "\0virtual:content/set/eiken2");
    const job = audioJobs(loadContent(dir).config!, content.sets).find((j) => j.key.startsWith("eiken2/") && j.slot === "nate")!;
    expect(code).not.toContain("import ");
    expect(code).toContain(`"nate": "https://cdn.example/audio/${job.hash}.mp3"`);
  });
  it("ブラウザへ配る設定にバケット名を含めない", () => {
    const plugin = contentPlugin({ root, contentDir: dir });
    const code = (plugin.load as (id: string) => string).call({}, "\0virtual:content");
    expect(code).toContain("accents");
    expect(code).not.toContain("storage");
  });
});

describe("LocalStore", () => {
  it("書き終えたファイルだけを一覧に出し、消せる", async () => {
    const store = new LocalStore(join(mkdtempSync(join(tmpdir(), "audio-")), "audio"));
    expect((await store.list()).size).toBe(0);
    await store.put("x.mp3", new Uint8Array([1, 2, 3]));
    expect([...(await store.list())]).toEqual([["x.mp3", 3]]);
    await store.remove(["x.mp3"]);
    expect((await store.list()).size).toBe(0);
  });
});

describe("voices", () => {
  const q: PlayQuestion = { key: "s/a", setId: "s", answer: "a", sentence: "a", meaning: "", translation: "", audio: { speakers: { tiffany: "t.mp3", nate: "n.mp3" }, accents: { "en-AU": "au.mp3" } } };
  it("都市のなまりのうち声が設定されている最初のもの", () => {
    expect(ttsAccent(["en-NZ", "en-AU"], config)).toBe("en-NZ");
    expect(ttsAccent(["fr-FR", "fr-CA"], config)).toBeUndefined();
  });
  it("読む人物は音声のある人物からランダムに選ぶ", () => {
    expect(pickSpeaker(q, () => 0)).toBe("tiffany");
    expect(pickSpeaker(q, () => 0.99)).toBe("nate");
    expect(pickSpeaker({ ...q, audio: { speakers: { nate: "n.mp3" } } }, () => 0)).toBe("nate");
    expect(pickSpeaker({ ...q, audio: undefined })).toBeUndefined();
  });
  it("通常はその人物の音声、飛行船ではなまりの音声、無ければブラウザの声", () => {
    expect(audioUrl(q, false, "en-AU", "nate")).toBe("n.mp3");
    expect(audioUrl(q, false, "en-AU", undefined)).toBeUndefined();
    expect(audioUrl(q, true, "en-AU", "nate")).toBe("au.mp3");
    expect(audioUrl(q, true, "en-GB", "nate")).toBeUndefined();
  });
  it("飛行船の問題はそのなまりの音声がある問題から選ぶ", () => {
    const plain = { ...q, key: "s/b", audio: undefined };
    expect(pickAccentQuestion([plain, q], "en-AU", () => 0)).toBe(q);
    expect(pickAccentQuestion([plain], "en-AU")).toBeUndefined();
    expect(pickAccentQuestion([q], undefined)).toBeUndefined();
  });
});

