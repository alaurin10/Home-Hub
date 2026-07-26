import type { RoomSnapshot } from "../api/types";
import { formatValue, humanDuration, relativeTime } from "../lib/format";
import { tint } from "../lib/thresholds";

function WifiBars({ dbm }: { dbm: number | null }) {
  // -50 dBm ≈ full, -80 dBm ≈ one bar
  const bars = dbm === null ? 0 : Math.max(1, Math.min(4, Math.round((dbm + 90) / 10)));
  return (
    <span aria-hidden className="inline-flex items-end gap-[3px]">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[5px] rounded-sm"
          style={{
            height: `${5 + i * 4}px`,
            background: i <= bars ? "var(--ink-2)" : "var(--hairline)",
          }}
        />
      ))}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[.07em] text-muted">{label}</dt>
      <dd className="tnum mt-1 text-[13.5px] text-ink-2">{value}</dd>
    </div>
  );
}

export function NodeCard({ room, entities }: { room: RoomSnapshot; entities: string[] }) {
  const online = room.node.online;
  const color = online ? "var(--status-good)" : "var(--status-bad)";

  return (
    <article className="glass rounded-[26px] p-[24px_26px] max-lg:rounded-[22px] max-lg:p-[18px_20px]">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-[-.01em] text-ink">{room.name}</h3>
        <span
          className="inline-flex items-center gap-[7px] rounded-full px-[11px] py-1 text-xs font-semibold text-ink-2"
          style={{ background: tint(color) }}
        >
          <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
          {online ? "Online" : "Offline"}
        </span>
      </header>

      <div className="mt-[18px] flex items-end gap-2.5">
        <WifiBars dbm={room.node.wifi_signal} />
        <span className="tnum text-2xl font-semibold leading-none text-ink">
          {room.node.wifi_signal === null ? "–" : formatValue(room.node.wifi_signal)}
          <span className="ml-[3px] text-xs font-normal text-muted">dBm</span>
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3.5">
        <Field label="Uptime" value={humanDuration(room.node.uptime)} />
        <Field label="Last seen" value={relativeTime(room.node.last_seen)} />
        <Field label="Firmware" value={room.node.esphome_version ?? "–"} />
        <Field label="IP" value={room.node.ip_address ?? "–"} />
      </dl>

      {entities.length > 0 && (
        <div className="mt-[18px] border-t border-hairline pt-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-muted">
            Reporting
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entities.map((entity) => (
              <span
                key={entity}
                className="rounded-[7px] bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-ink-2"
              >
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {room.node.missing.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--status-fair)" }}
            />
            {room.node.missing.length} configured{" "}
            {room.node.missing.length === 1 ? "entity" : "entities"} not reporting
          </p>
          {/* Full entity_ids on purpose: they ARE the diagnosis — compare
              against HA Developer Tools → States to spot renames/disables. */}
          <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-muted">
            {room.node.missing.join(" · ")}
          </p>
        </div>
      )}
    </article>
  );
}
