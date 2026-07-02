import type { RoomSnapshot } from "../api/types";
import { formatValue, humanDuration, relativeTime } from "../lib/format";

function WifiBars({ dbm }: { dbm: number | null }) {
  // -50 dBm ≈ full, -80 dBm ≈ one bar
  const bars = dbm === null ? 0 : Math.max(1, Math.min(4, Math.round((dbm + 90) / 10)));
  return (
    <span aria-hidden className="inline-flex items-end gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1 rounded-sm"
          style={{
            height: `${3 + i * 3}px`,
            background: i <= bars ? "var(--ink-2)" : "var(--hairline)",
          }}
        />
      ))}
    </span>
  );
}

export function NodeCard({ room }: { room: RoomSnapshot }) {
  const online = room.node.online;
  return (
    <article
      className="rounded-3xl border bg-surface p-5"
      style={{
        borderColor: online ? "var(--hairline)" : "var(--status-bad)",
      }}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{room.name}</h3>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: online ? "var(--status-good)" : "var(--status-bad)" }}
          />
          {online ? "Online" : "Offline"}
        </span>
      </header>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">WiFi</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-ink-2">
            <WifiBars dbm={room.node.wifi_signal} />
            {room.node.wifi_signal !== null ? `${formatValue(room.node.wifi_signal)} dBm` : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Uptime</dt>
          <dd className="mt-0.5 text-ink-2">{humanDuration(room.node.uptime)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Last seen</dt>
          <dd className="mt-0.5 text-ink-2">{relativeTime(room.node.last_seen)}</dd>
        </div>
      </dl>
    </article>
  );
}
