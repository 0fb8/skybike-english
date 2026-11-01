import { describe, expect, it } from "vitest";
import { CITIES } from "../src/data/route";
import { haversine, legDistances, positionAt, unwrapLon } from "../src/lib/geo";

describe("geo", () => {
  it("東京〜シドニーはおよそ 7,800km", () => {
    expect(haversine(CITIES[0], CITIES[1])).toBeGreaterThan(7700);
    expect(haversine(CITIES[0], CITIES[1])).toBeLessThan(7900);
  });
  it("日付変更線をまたぐ経度を補正する", () => {
    expect(unwrapLon(172, -158)).toBe(202);
  });
  it("区間の端では都市の位置になる", () => {
    const legs = legDistances(CITIES);
    const p = positionAt(CITIES, legs, legs[0]);
    expect(p.lat).toBeCloseTo(CITIES[1].lat);
  });
});
