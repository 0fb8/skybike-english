import { describe, expect, it } from "vitest";
import { CITIES, LEGACY_ROUTE_V2 } from "../src/data/route";
import { haversine, legDistances } from "../src/lib/geo";

const city = (name: string) => CITIES.find((c) => c.name === name)!;

describe("geo", () => {
  it("東京〜シドニーはおよそ 7,800km", () => {
    expect(haversine(city("Tokyo"), city("Sydney"))).toBeGreaterThan(7700);
    expect(haversine(city("Tokyo"), city("Sydney"))).toBeLessThan(7900);
  });
  it("極点もふつうに計算できる（北極点〜南極点は地球の半周）", () => {
    expect(haversine(city("North Pole"), city("South Pole"))).toBeCloseTo(Math.PI * 6371, 0);
  });
});

describe("route", () => {
  it("50〜100 地点で、名前は重複せず、座標は範囲内", () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(50);
    expect(CITIES.length).toBeLessThanOrEqual(100);
    expect(new Set(CITIES.map((c) => c.name)).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180);
    }
  });
  it("東京から出発し、北極点と南極点を通る", () => {
    expect(CITIES[0].name).toBe("Tokyo");
    expect(CITIES.some((c) => c.lat === 90)).toBe(true);
    expect(CITIES.some((c) => c.lat === -90)).toBe(true);
  });
  it("区間は極端に長くない（どの区間も 8,000km 以内）", () => {
    const legs = legDistances(CITIES);
    const long = legs.map((d, i) => [CITIES[i].name, CITIES[(i + 1) % CITIES.length].name, Math.round(d)]).filter((x) => (x[2] as number) > 8000);
    expect(long).toEqual([]);
  });
  it("旧ルートの都市はすべて新しいルートにある（保存データの引き継ぎ用）", () => {
    for (const name of LEGACY_ROUTE_V2) expect(CITIES.some((c) => c.name === name)).toBe(true);
  });
});
