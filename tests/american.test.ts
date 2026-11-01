import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { americanIssues, loadSpellingTable } from "../scripts/levels/american";

const table = loadSpellingTable(join(import.meta.dirname, "..", "content", "wordlists"));
const check = (s: string) => americanIssues(s, table);

describe("americanIssues", () => {
  it("アメリカ英語なら何も言わない", () => {
    expect(check("My favorite color is gray, and I traveled to the theater toward noon.")).toEqual([]);
    expect(check("She installed the app and controlled the meeting. Okay, let's go towards the center.")).toEqual([]);
    expect(check("He called, filled the form, and rolled the dice.")).toEqual([]);
  });
  it("イギリス式の綴り（変化形も）", () => {
    expect(check("Chocolate is my favourite.")[0]).toContain("favorite");
    expect(check("We organised the colours.")).toHaveLength(2);
    expect(check("I travelled to the city centre.")).toHaveLength(2);
    expect(check("The flight was cancelled.")[0]).toContain("canceled");
  });
  it("主にイギリスで使う語", () => {
    expect(check("Let's get a takeaway.")[0]).toContain("takeout");
    expect(check("Two lorries were in the queue.")).toHaveLength(2);
  });
});
