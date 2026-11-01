import type { City } from "../data/route";

const rad = (d: number) => (d * Math.PI) / 180;

/** 2 地点間の大圏距離（km） */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 各区間（i → i+1、最後は先頭へ戻る）の距離 */
export function legDistances(cities: City[]): number[] {
  return cities.map((c, i) => haversine(c, cities[(i + 1) % cities.length]));
}

/** 経度差が 180 度を超えるとき、日付変更線をまたぐ側へ寄せる */
export function unwrapLon(fromLon: number, toLon: number): number {
  if (toLon - fromLon > 180) return toLon - 360;
  if (fromLon - toLon > 180) return toLon + 360;
  return toLon;
}

/** 周回上の累積距離 km における位置（区間内は線形補間） */
export function positionAt(cities: City[], legs: number[], km: number): { lat: number; lon: number; leg: number } {
  const lap = legs.reduce((a, b) => a + b, 0);
  let k = ((km % lap) + lap) % lap;
  let i = 0;
  while (k > legs[i]) { k -= legs[i]; i = (i + 1) % cities.length; }
  const a = cities[i], b = cities[(i + 1) % cities.length];
  const t = legs[i] ? k / legs[i] : 0;
  let lon = a.lon + (unwrapLon(a.lon, b.lon) - a.lon) * t;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: a.lat + (b.lat - a.lat) * t, lon, leg: i };
}
