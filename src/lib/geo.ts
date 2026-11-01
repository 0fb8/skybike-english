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
