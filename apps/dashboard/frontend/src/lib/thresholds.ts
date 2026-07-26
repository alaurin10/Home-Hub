// The single air-quality semantics module: every signal color in the app
// derives from here (bands come from /api/config, colors from theme tokens).
// Status colors always ship with a label/icon — never color alone.

import type { AppConfig, RoomSnapshot } from "../api/types";

export type Status = "good" | "fair" | "poor" | "bad";

export const STATUS_LABEL: Record<Status, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  bad: "Very poor",
};

export const STATUS_COLOR: Record<Status, string> = {
  good: "var(--status-good)",
  fair: "var(--status-fair)",
  poor: "var(--status-poor)",
  bad: "var(--status-bad)",
};

const ORDER: Status[] = ["good", "fair", "poor", "bad"];

export function statusFor(config: AppConfig, metric: string, value: number | null): Status | null {
  const threshold = config.thresholds[metric];
  if (!threshold || value === null) return null;
  if (threshold.ranges) {
    const within = ([lo, hi]: [number, number]) => value >= lo && value <= hi;
    if (within(threshold.ranges.good)) return "good";
    if (within(threshold.ranges.fair)) return "fair";
    if (within(threshold.ranges.poor)) return "poor";
    return "bad";
  }
  const [fair, poor, bad] = threshold.bounds ?? [];
  if (value >= bad) return "bad";
  if (value >= poor) return "poor";
  if (value >= fair) return "fair";
  return "good";
}

export function worst(statuses: (Status | null)[]): Status | null {
  let result: Status | null = null;
  for (const s of statuses) {
    if (s && (!result || ORDER.indexOf(s) > ORDER.indexOf(result))) result = s;
  }
  return result;
}

// Temperature and humidity are comfort metrics: a slightly-off reading is
// normal and shouldn't tint the whole room. They only escalate the overall
// status once they're extreme (poor/bad); a merely "fair" humidity is ignored.
const COMFORT_METRICS = new Set(["temperature", "humidity"]);

/** Overall air status of a room. CO₂ and the particulate/VOC signals drive it
 * at full strength; temperature and humidity contribute only when extreme, so
 * high-but-tolerable humidity no longer flips a clean-air room to yellow. */
export function roomStatus(config: AppConfig, room: RoomSnapshot): Status | null {
  return worst(
    Object.entries(room.metrics).map(([metric, mv]) => {
      const status = statusFor(config, metric, mv.value);
      if (COMFORT_METRICS.has(metric) && status !== "poor" && status !== "bad") return null;
      return status;
    }),
  );
}

export const METRIC_LABEL: Record<string, string> = {
  co2: "CO₂",
  temperature: "Temperature",
  humidity: "Humidity",
  dew_point: "Dew point",
  absolute_humidity: "Absolute humidity",
  voc: "VOC index",
  nox: "NOx index",
  pm1_0: "PM1.0",
  pm2_5: "PM2.5",
  pm10: "PM10",
};

/** Short forms for segmented controls and pill rails, where the full label
 * would wrap. */
export const METRIC_SHORT: Record<string, string> = {
  ...METRIC_LABEL,
  temperature: "Temp",
  absolute_humidity: "Abs. humidity",
  voc: "VOC",
  nox: "NOx",
};

/** Decimals each metric is read at. A CO₂ reading to one decimal implies a
 * precision the sensor does not have. */
export const METRIC_DIGITS: Record<string, number> = {
  co2: 0,
  temperature: 1,
  humidity: 0,
  dew_point: 1,
  absolute_humidity: 1,
  voc: 0,
  nox: 0,
  pm1_0: 1,
  pm2_5: 1,
  pm10: 0,
};

/** Plot floor/ceiling per metric — the span a progress track represents.
 * CO₂ starts at 400 (the outdoor baseline), not 0: no indoor room ever reads
 * lower, so a bar from zero would spend a quarter of its length on nothing. */
export const METRIC_RANGE: Record<string, [number, number]> = {
  co2: [400, 2000],
  temperature: [55, 90],
  humidity: [20, 80],
  dew_point: [30, 70],
  absolute_humidity: [0, 20],
  voc: [0, 400],
  nox: [0, 300],
  pm1_0: [0, 55],
  pm2_5: [0, 55],
  pm10: [0, 150],
};

/** Where a reading sits between its floor and ceiling, as a 0–100 percentage
 * clamped so a value at the floor still shows a sliver of track. */
export function trackPercent(metric: string, value: number | null): number {
  if (value === null) return 0;
  const [lo, hi] = METRIC_RANGE[metric] ?? [0, 100];
  return Math.max(3, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

/** Unit for a metric, from config where possible. Temperature is deliberately
 * excluded — it is scale-dependent and comes from lib/scale.ts. */
export function unitFor(config: AppConfig, metric: string): string {
  if (metric === "humidity") return "%";
  if (metric === "absolute_humidity") return "g/m³";
  return config.thresholds[metric]?.unit ?? "";
}

/** Tint used behind chips and badges: the status color at low alpha. */
export const tint = (color: string, percent = 13) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** Score bands reuse the four status colors; "excellent" shares good's green
 * rather than introducing a fifth signal color. */
export const SCORE_BAND_COLOR: Record<string, string> = {
  excellent: "var(--status-good)",
  good: "var(--status-good)",
  fair: "var(--status-fair)",
  poor: "var(--status-poor)",
};

export const SCORE_BAND_LABEL: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};
