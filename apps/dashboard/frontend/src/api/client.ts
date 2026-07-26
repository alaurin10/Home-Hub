import type {
  AppSettings,
  HistoryResponse,
  Insight,
  Outdoor,
  StateEvent,
  StreamMessage,
  ThresholdShape,
  ThresholdsResponse,
} from "./types";

export async function getJson<T>(path: string): Promise<T> {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  return resp.json();
}

/** Outdoor context, or null when no location is set (204) — the card is then
 * simply absent rather than showing a fabricated reading. */
export async function getOutdoor(): Promise<Outdoor | null> {
  const resp = await fetch("/api/outdoor");
  if (resp.status === 204) return null;
  if (!resp.ok) throw new Error(`/api/outdoor: ${resp.status}`);
  return resp.json();
}

export function getInsights(): Promise<Insight[]> {
  return getJson<Insight[]>("/api/insights");
}

export function getSettings(): Promise<AppSettings> {
  return getJson<AppSettings>("/api/settings");
}

export async function putSettings(update: {
  location: string;
  scale: "F" | "C";
}): Promise<AppSettings> {
  const resp = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!resp.ok) throw new Error((await resp.text()) || `PUT /api/settings: ${resp.status}`);
  return resp.json();
}

export function getThresholds(): Promise<ThresholdsResponse> {
  return getJson<ThresholdsResponse>("/api/thresholds");
}

/** Persist comfort-band overrides. Rejects (with the server's message) when a
 * band fails validation, so the caller can surface it. */
export async function putThresholds(
  thresholds: Record<string, ThresholdShape>,
): Promise<ThresholdsResponse> {
  const resp = await fetch("/api/thresholds", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thresholds }),
  });
  if (!resp.ok) throw new Error((await resp.text()) || `PUT /api/thresholds: ${resp.status}`);
  return resp.json();
}

export function getHistory(entities: string[], hours: number, points?: number): Promise<HistoryResponse> {
  const params = new URLSearchParams({ entities: entities.join(","), hours: String(hours) });
  if (points) params.set("points", String(points));
  return getJson(`/api/history?${params}`);
}

/** Reconnecting WebSocket for live pushes: per-entity state, plus a nudge when
 * the server's insight set changes. */
export function openStream(
  onEvent: (ev: StateEvent) => void,
  onStatus: (connected: boolean) => void,
  onInsights?: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 1000;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/api/stream`);
    ws.onopen = () => {
      retry = 1000;
      onStatus(true);
      keepalive = setInterval(() => ws?.send("ping"), 30000);
    };
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data) as StreamMessage;
      if (data.type === "state") onEvent(data);
      else if (data.type === "insights") onInsights?.();
    };
    ws.onclose = () => {
      onStatus(false);
      if (keepalive) clearInterval(keepalive);
      if (!closed) {
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      }
    };
  };
  connect();
  return () => {
    closed = true;
    ws?.close();
  };
}
