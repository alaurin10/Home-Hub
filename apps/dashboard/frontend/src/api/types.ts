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
}

export interface RoomSnapshot {
  id: string;
  name: string;
  metrics: Record<string, MetricValue>;
  node: NodeStatus;
}

export interface FleetStatus {
  stale_nodes: string[];
  problem: boolean;
}

export interface RoomsResponse {
  rooms: RoomSnapshot[];
  fleet: FleetStatus;
}

export interface RoomConfig {
  id: string;
  name: string;
  metrics: string[];
  entities: Record<string, string>;
  node: Record<string, string>;
}

export interface Threshold {
  bounds: number[];
  unit: string;
}

export interface AppConfig {
  house_name: string;
  rooms: RoomConfig[];
  thresholds: Record<string, Threshold>;
  mode: "demo" | "ha";
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
