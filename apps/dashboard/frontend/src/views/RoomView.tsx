import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getHistory } from "../api/client";
import type { HistoryResponse } from "../api/types";
import { LegendRow, TrendChart, type Series } from "../components/charts/TrendChart";
import { Gauge } from "../components/Gauge";
import { NumberTicker } from "../components/NumberTicker";
import { PageTransition } from "../components/PageTransition";
import { StatTile } from "../components/StatTile";
import { StatusChip } from "../components/StatusChip";
import { METRIC_LABEL, roomStatus, statusFor } from "../lib/thresholds";
import { useStore } from "../store";

// Raw ranges (≤48h) carry a point budget sized to the window so bucket
// width stays useful (48h at the default 288 was 10-minute buckets; 576
// halves that). Stats ranges (>48h) are hourly server-side; points unused.
const RANGES: { label: string; hours: number; points?: number }[] = [
  { label: "3h", hours: 3, points: 240 },
  { label: "24h", hours: 24, points: 288 },
  { label: "48h", hours: 48, points: 576 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
  { label: "90d", hours: 24 * 90 },
];

// Fixed categorical slots per entity role — never cycled, never re-ranked.
const PM_COLORS = { pm1_0: "var(--series-1)", pm2_5: "var(--series-2)", pm10: "var(--series-3)" };

/** One filter row above the charts; the active pill slides on a spring.
 * The pill is a single measured element (offsetLeft/offsetWidth of the
 * active button) rather than a layoutId pair: a layoutId element inside a
 * route stalls AnimatePresence mode="wait" exits — the view finishes fading
 * but never unmounts, leaving a dead page after Back. */
function RangeSelector({ hours, onChange }: { hours: number; onChange: (h: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-hours='${hours}']`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [hours]);

  return (
    <div ref={listRef} className="glass-chrome relative mb-4 flex w-fit items-center gap-1 rounded-full p-1">
      {pill && (
        <motion.span
          aria-hidden
          className="absolute bottom-1 top-1 left-0 rounded-full bg-ink"
          initial={false}
          animate={{ x: pill.x, width: pill.w }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      {RANGES.map((r) => (
        <button
          key={r.label}
          data-hours={r.hours}
          onClick={() => onChange(r.hours)}
          className="relative rounded-full px-3 py-1 text-xs font-medium"
        >
          <span
            className={`relative transition-colors duration-200 ${
              hours === r.hours ? "text-surface" : "text-muted hover:text-ink-2"
            }`}
          >
            {r.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function RoomView() {
  const { id } = useParams();
  const { config, rooms } = useStore();
  const [hours, setHours] = useState(24);
  // Loaded history is tagged with the room/range it belongs to: on a range
  // switch the previous charts stay mounted (no collapse/re-open bounce) and
  // simply swap data when the fetch lands. Only a room change starts blank.
  const [loaded, setLoaded] = useState<{ roomId: string; hours: number; resp: HistoryResponse } | null>(
    null,
  );

  const roomCfg = config?.rooms.find((r) => r.id === id);
  const room = rooms?.rooms.find((r) => r.id === id);

  useEffect(() => {
    if (!roomCfg) return;
    let alive = true;
    const entities = Object.values(roomCfg.entities);
    const points = RANGES.find((r) => r.hours === hours)?.points;
    getHistory(entities, hours, points).then(
      (resp) => alive && setLoaded({ roomId: roomCfg.id, hours, resp }),
    );
    return () => {
      alive = false;
    };
  }, [roomCfg, hours]);

  const history = loaded && loaded.roomId === roomCfg?.id ? loaded.resp : null;
  // Label/format charts by the range actually plotted, not the pending one.
  const plottedHours = history ? loaded!.hours : hours;

  const seriesFor = useMemo(
    () =>
      (metric: string, color: string): Series | null => {
        if (!roomCfg || !history) return null;
        const entity = roomCfg.entities[metric];
        const points = history.series[entity];
        if (!points?.length) return null;
        return { name: METRIC_LABEL[metric] ?? metric, points, color };
      },
    [roomCfg, history],
  );

  if (!config || !room || !roomCfg) return null;

  const kind = history?.kind ?? "raw";
  const co2 = seriesFor("co2", "var(--series-1)");
  const temp = seriesFor("temperature", "var(--series-1)");
  const rh = seriesFor("humidity", "var(--series-2)");
  const pmSeries = (["pm1_0", "pm2_5", "pm10"] as const)
    .map((m) => seriesFor(m, PM_COLORS[m]))
    .filter((s): s is Series => s !== null);
  const voc = seriesFor("voc", "var(--series-1)");
  const nox = seriesFor("nox", "var(--series-2)");

  const dew = room.metrics.dew_point;
  const abs = room.metrics.absolute_humidity;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 md:pb-10">
      <PageTransition>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="glass-chrome flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink"
              aria-label="Back to home"
            >
              ←
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{room.name}</h1>
            <StatusChip status={roomStatus(config, room)} />
          </div>
          {!room.node.online && (
            <span className="text-sm font-medium" style={{ color: "var(--status-bad)" }}>
              ⚠ Sensor offline
            </span>
          )}
        </div>

        <RangeSelector hours={hours} onChange={setHours} />

        {/* Comfort first: temperature + humidity lead, matching the cards. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="glass rounded-3xl p-5">
            <header className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink">Temperature</h2>
              <div className="text-sm text-ink-2">
                <span className="text-xl font-semibold text-ink">
                  <NumberTicker value={room.metrics.temperature?.value ?? null} digits={1} />
                </span>{" "}
                °F now
              </div>
            </header>
            <TrendChart
              series={temp ? [temp] : []}
              kind={kind}
              hours={plottedHours}
              height={200}
              unit="°F"
            />
          </section>
          <section className="glass rounded-3xl p-5">
            <header className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink">Humidity</h2>
              <div className="text-sm text-ink-2">
                <span className="text-xl font-semibold text-ink">
                  <NumberTicker value={room.metrics.humidity?.value ?? null} digits={0} />
                </span>{" "}
                % now
              </div>
            </header>
            <TrendChart series={rh ? [rh] : []} kind={kind} hours={plottedHours} height={200} unit="%" />
          </section>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <StatTile
            label="Dew point"
            value={dew?.value ?? null}
            unit="°F"
            // 60.8°F = 16°C, the muggy threshold
            note={dew?.value !== null && dew !== undefined && dew.value! > 60.8 ? "muggy" : "comfortable"}
          />
          <StatTile label="Absolute humidity" value={abs?.value ?? null} unit="g/m³" />
        </div>

        <section className="mt-4 glass rounded-3xl p-5">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">CO₂</h2>
            <div className="flex items-center gap-3">
              <StatusChip status={statusFor(config, "co2", room.metrics.co2?.value ?? null)} />
              <Gauge
                value={room.metrics.co2?.value ?? null}
                bounds={config.thresholds.co2.bounds}
                size={72}
                status={statusFor(config, "co2", room.metrics.co2?.value ?? null)}
              >
                <span className="text-base font-semibold leading-none text-ink">
                  <NumberTicker value={room.metrics.co2?.value ?? null} />
                </span>
                <span className="mt-0.5 text-[9px] font-medium text-muted">ppm</span>
              </Gauge>
            </div>
          </header>
          <TrendChart
            series={co2 ? [co2] : []}
            kind={kind}
            hours={plottedHours}
            height={240}
            unit="ppm"
            guides={config.thresholds.co2.bounds.slice(0, 2)}
          />
        </section>

        {pmSeries.length > 0 && (
          <section className="mt-4 glass rounded-3xl p-5">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Particulate matter</h2>
              <LegendRow items={pmSeries.map((s) => ({ name: s.name, color: s.color }))} />
            </header>
            <TrendChart series={pmSeries} kind={kind} hours={plottedHours} height={200} unit="µg/m³" area={false} />
          </section>
        )}

        {(voc || nox) && (
          <section className="mt-4 glass rounded-3xl p-5">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Gas indices</h2>
              <LegendRow
                items={[voc, nox]
                  .filter((s): s is Series => s !== null)
                  .map((s) => ({ name: s.name, color: s.color }))}
              />
            </header>
            <TrendChart
              series={[voc, nox].filter((s): s is Series => s !== null)}
              kind={kind}
              hours={plottedHours}
              height={180}
              area={false}
            />
          </section>
        )}
      </PageTransition>
    </main>
  );
}
