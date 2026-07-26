// Mirrors the backend pydantic models (backend/app/models.py).

export interface MetricValue {
  value: number | null;
  unit: string;
  ts: number | null;
}

export interface NodeStatus {
  online: boolean;
  wifi_signal: number | null;
  uptime: number | null;
  last_seen: number | null;
  esphome_version: string | null;
  ip_address: string | null;
  missing: string[];
}

export type ScoreBand = "excellent" | "good" | "fair" | "poor";

export interface ScorePart {
  metric: string;
  label: string;   // "CO₂"
  detail: string;  // "1,140 ppm vs 800 target" — printed verbatim, never re-derived
  penalty: number;
}

export interface RoomScore {
  value: number;
  band: ScoreBand;
  parts: ScorePart[];
}

export interface RoomSnapshot {
  id: string;
  name: string;
  metrics: Record<string, MetricValue>;
  node: NodeStatus;
  /** null for an offline node — render the offline state, not a stale 100. */
  score: RoomScore | null;
}

export interface FleetStatus {
  stale_nodes: string[];
  problem: boolean;
}

export interface HouseSummary {
  score: number;
  band: ScoreBand;
  worst_room: string | null;
  headline: string;
  advisory: string;
}

export interface RoomsResponse {
  rooms: RoomSnapshot[];
  fleet: FleetStatus;
  house: HouseSummary;
}

export interface AppSettings {
  location: string;
  scale: "F" | "C";
  /** Resolved server-side; null means the location matched nothing. */
  station: string | null;
  latitude: number | null;
  longitude: number | null;
  /** IANA zone of the resolved place — sun times are formatted in it. */
  timezone: string | null;
}

export interface OutdoorDelta {
  label: string;
  text: string;
  fraction: number; // 0–1 bar fill
}

export interface Ventilation {
  recommended: boolean;
  title: string;
  body: string;
}

export interface Outdoor {
  temp: number | null;
  humidity: number | null;
  aqi: number | null;
  pm2_5: number | null;
  wind: number | null;
  wind_dir: string | null;
  sunrise: string | null;
  sunset: string | null;
  station: string | null;
  source: string;
  deltas: OutdoorDelta[];
  ventilation: Ventilation | null;
}

export type InsightKind = "action" | "likely" | "measured";

export interface Insight {
  id: string;
  kind: InsightKind;
  text: string;
  when: string;
  evidence: string[];
  room_id: string | null;
  color_role: "good" | "fair" | "poor" | "series_1" | "series_2" | "muted";
}

export interface RoomConfig {
  id: string;
  name: string;
  metrics: string[];
  entities: Record<string, string>;
  node: Record<string, string>;
}

export interface Threshold {
  bounds?: number[];                                           // monotonic: [fair, poor, bad]
  ranges?: Record<"good" | "fair" | "poor", [number, number]>; // band: outside poor = bad
  unit: string;
}

export interface AppConfig {
  house_name: string;
  rooms: RoomConfig[];
  thresholds: Record<string, Threshold>;
  mode: "demo" | "ha";
}

// Numeric shape of one metric's bands, unit-less — the editable part of a
// threshold (units are config-owned and never sent back).
export type ThresholdShape =
  | { ranges: Record<"good" | "fair" | "poor", [number, number]> }
  | { bounds: number[] };

export interface ThresholdsResponse {
  thresholds: Record<string, Threshold>; // effective (defaults + overrides)
  defaults: Record<string, Threshold>;   // pristine config.yaml, for reset
}

export interface HistoryPoint {
  t: number;
  v?: number | null;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
}

export interface HistoryResponse {
  series: Record<string, HistoryPoint[]>;
  kind: "raw" | "stats";
}

export interface CardLayout {
  id: string;
  size: "regular" | "wide";
}

export interface Layout {
  cards: CardLayout[];
}

export interface StateEvent {
  type: "state";
  entity_id: string;
  value: number | string | null;
  ts: number;
}

/** Sent when the server's insight set changes, so open dashboards refetch
 * instead of polling for a feed that moves a few times a day. */
export interface InsightsEvent {
  type: "insights";
}

export type StreamMessage = StateEvent | InsightsEvent;
