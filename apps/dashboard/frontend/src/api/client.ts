import type { HistoryResponse, Layout, StateEvent } from "./types";

export async function getJson<T>(path: string): Promise<T> {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  return resp.json();
}

export async function putLayout(layout: Layout): Promise<void> {
  await fetch("/api/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
}

export function getHistory(entities: string[], hours: number): Promise<HistoryResponse> {
  const params = new URLSearchParams({ entities: entities.join(","), hours: String(hours) });
  return getJson(`/api/history?${params}`);
}

/** Reconnecting WebSocket for live state pushes. */
export function openStream(
  onEvent: (ev: StateEvent) => void,
  onStatus: (connected: boolean) => void,
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
      const data = JSON.parse(msg.data);
      if (data.type === "state") onEvent(data as StateEvent);
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
