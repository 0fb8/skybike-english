// 世界一周のルート（東京を出発し、地球のいろいろな地域と北極・南極を巡って東京に戻る）。
// 1 区間（ある地点 → 次の地点）が 1 回のゲーム。名前は英語で表示する。

export interface Accent {
  /** 飛行船の例文を読む声の言語（先頭から順に、config.yaml の speech.tts.accents → ブラウザの声で探す） */
  langs: string[];
  /** 表示名（例: Australian English） */
  label: string;
}

export interface City {
  name: string;
  lat: number;
  lon: number;
  /** この地点へ向かう区間で飛行船（訛りの例文）が出る。無い区間では出ない */
  accent?: Accent;
}

const AU: Accent = { langs: ["en-AU"], label: "Australian English" };
const NZ: Accent = { langs: ["en-NZ", "en-AU"], label: "New Zealand English" };
const ZA: Accent = { langs: ["en-ZA", "en-GB"], label: "South African English" };
const IN: Accent = { langs: ["en-IN"], label: "Indian English" };
const GB: Accent = { langs: ["en-GB"], label: "British English" };

export const CITIES: City[] = [
  // 東アジア・東南アジア
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "Seoul", lat: 37.57, lon: 126.98 },
  { name: "Beijing", lat: 39.9, lon: 116.41 },
  { name: "Shanghai", lat: 31.23, lon: 121.47 },
  { name: "Taipei", lat: 25.03, lon: 121.57 },
  { name: "Hong Kong", lat: 22.32, lon: 114.17 },
  { name: "Manila", lat: 14.6, lon: 120.98 },
  { name: "Ho Chi Minh City", lat: 10.82, lon: 106.63 },
  { name: "Bangkok", lat: 13.76, lon: 100.5 },
  { name: "Kuala Lumpur", lat: 3.14, lon: 101.69 },
  { name: "Singapore", lat: 1.35, lon: 103.82 },
  { name: "Jakarta", lat: -6.21, lon: 106.85 },
  { name: "Bali", lat: -8.65, lon: 115.22 },
  // オセアニア
  { name: "Darwin", lat: -12.46, lon: 130.84 },
  { name: "Brisbane", lat: -27.47, lon: 153.03 },
  { name: "Sydney", lat: -33.87, lon: 151.21, accent: AU },
  { name: "Melbourne", lat: -37.81, lon: 144.96 },
  { name: "Auckland", lat: -36.85, lon: 174.76, accent: NZ },
  { name: "Christchurch", lat: -43.53, lon: 172.64 },
  // 南極
  { name: "McMurdo Station", lat: -77.85, lon: 166.67 },
  { name: "South Pole", lat: -90, lon: 0 },
  { name: "Rothera Station", lat: -67.57, lon: -68.13 },
  // 南米
  { name: "Ushuaia", lat: -54.8, lon: -68.3 },
  { name: "Santiago", lat: -33.45, lon: -70.67 },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38 },
  { name: "São Paulo", lat: -23.55, lon: -46.63 },
  { name: "Rio de Janeiro", lat: -22.91, lon: -43.17 },
  // アフリカ
  { name: "Cape Town", lat: -33.92, lon: 18.42, accent: ZA },
  { name: "Johannesburg", lat: -26.2, lon: 28.05 },
  { name: "Nairobi", lat: -1.29, lon: 36.82 },
  { name: "Addis Ababa", lat: 9.03, lon: 38.74 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  // 中東・南アジア
  { name: "Dubai", lat: 25.2, lon: 55.27 },
  { name: "Mumbai", lat: 19.08, lon: 72.88, accent: IN },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  // ヨーロッパ
  { name: "Istanbul", lat: 41.01, lon: 28.98 },
  { name: "Athens", lat: 37.98, lon: 23.73 },
  { name: "Rome", lat: 41.9, lon: 12.5 },
  { name: "Barcelona", lat: 41.39, lon: 2.17 },
  { name: "Madrid", lat: 40.42, lon: -3.7 },
  { name: "Lisbon", lat: 38.72, lon: -9.14 },
  { name: "Paris", lat: 48.86, lon: 2.35 },
  { name: "London", lat: 51.51, lon: -0.13, accent: GB },
  { name: "Amsterdam", lat: 52.37, lon: 4.9 },
  { name: "Berlin", lat: 52.52, lon: 13.4 },
  { name: "Moscow", lat: 55.76, lon: 37.62 },
  { name: "Saint Petersburg", lat: 59.93, lon: 30.36 },
  { name: "Helsinki", lat: 60.17, lon: 24.94 },
  { name: "Stockholm", lat: 59.33, lon: 18.07 },
  { name: "Oslo", lat: 59.91, lon: 10.75 },
  // 北極
  { name: "Tromsø", lat: 69.65, lon: 18.96 },
  { name: "Longyearbyen", lat: 78.22, lon: 15.65 },
  { name: "North Pole", lat: 90, lon: 0 },
  { name: "Reykjavik", lat: 64.15, lon: -21.94 },
  { name: "Nuuk", lat: 64.18, lon: -51.72 },
  // 北米・中米・南米北部
  { name: "Montreal", lat: 45.5, lon: -73.57 },
  { name: "Toronto", lat: 43.65, lon: -79.38 },
  { name: "Chicago", lat: 41.88, lon: -87.63 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Washington, D.C.", lat: 38.91, lon: -77.04 },
  { name: "Miami", lat: 25.76, lon: -80.19 },
  { name: "Havana", lat: 23.11, lon: -82.37 },
  { name: "Mexico City", lat: 19.43, lon: -99.13 },
  { name: "Bogotá", lat: 4.71, lon: -74.07 },
  { name: "Lima", lat: -12.05, lon: -77.04 },
  // 北米西海岸・太平洋
  { name: "Los Angeles", lat: 34.05, lon: -118.24 },
  { name: "San Francisco", lat: 37.77, lon: -122.42 },
  { name: "Seattle", lat: 47.61, lon: -122.33 },
  { name: "Vancouver", lat: 49.28, lon: -123.12 },
  { name: "Anchorage", lat: 61.22, lon: -149.9 },
  { name: "Honolulu", lat: 21.31, lon: -157.86 },
];

/** 保存データの版 2 までのルート（12 都市）。今いる地点を名前で引き継ぐのに使う */
export const LEGACY_ROUTE_V2 = ["Tokyo", "Sydney", "Christchurch", "Honolulu", "San Francisco", "New York", "London", "Paris", "Rome", "Cairo", "Mumbai", "Singapore"];
