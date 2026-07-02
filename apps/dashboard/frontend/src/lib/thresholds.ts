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
  const [fair, poor, bad] = threshold.bounds;
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

/** Overall air status of a room = worst of its thresholded metrics. */
export function roomStatus(config: AppConfig, room: RoomSnapshot): Status | null {
  return worst(
    Object.entries(room.metrics).map(([metric, mv]) => statusFor(config, metric, mv.value)),
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
