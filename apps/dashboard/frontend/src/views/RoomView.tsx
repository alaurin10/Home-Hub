import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getHistory } from "../api/client";
import type { HistoryResponse } from "../api/types";
import { LegendRow, TrendChart, type Series } from "../components/charts/TrendChart";
import { NumberTicker } from "../components/NumberTicker";
import { StatTile } from "../components/StatTile";
import { StatusChip } from "../components/StatusChip";
import { METRIC_LABEL, roomStatus, statusFor } from "../lib/thresholds";
import { useStore } from "../store";

const RANGES = [
  { label: "3h", hours: 3 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
  { label: "90d", hours: 24 * 90 },
];

// Fixed categorical slots per entity role — never cycled, never re-ranked.
const PM_COLORS = { pm1_0: "var(--series-1)", pm2_5: "var(--series-2)", pm10: "var(--series-3)" };

export function RoomView() {
  const { id } = useParams();
  const { config, rooms } = useStore();
  const [hours, setHours] = useState(24);
  const [history, setHistory] = useState<HistoryResponse | null>(null);

  const roomCfg = config?.rooms.find((r) => r.id === id);
  const room = rooms?.rooms.find((r) => r.id === id);

  useEffect(() => {
    if (!roomCfg) return;
    let alive = true;
    setHistory(null);
    const entities = Object.values(roomCfg.entities);
    getHistory(entities, hours).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [roomCfg, hours]);

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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
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

        {/* One filter row above the charts; the active pill slides on a spring */}
        <div className="glass-chrome mb-4 flex w-fit items-center gap-1 rounded-full p-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setHours(r.hours)}
              className="relative rounded-full px-3 py-1 text-xs font-medium"
            >
              {hours === r.hours && (
                <motion.span
                  layoutId="range-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-ink"
                />
              )}
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

        {/* layoutId matches the Home room card → the card morphs into this
            hero section when navigating (falls back to the page transition
            where the browser can't run it). */}
        <motion.section layoutId={`room-${id}`} className="glass rounded-3xl p-5">
          <header className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">CO₂</h2>
            <div className="text-sm text-ink-2">
              <span className="text-2xl font-semibold text-ink">
                <NumberTicker value={room.metrics.co2?.value ?? null} />
              </span>{" "}
              ppm now
              <StatusChip
                status={statusFor(config, "co2", room.metrics.co2?.value ?? null)}
                label={undefined}
              />
            </div>
          </header>
          {co2 && (
            <TrendChart
              series={[co2]}
              kind={kind}
              hours={hours}
              height={240}
              unit="ppm"
              guides={config.thresholds.co2.bounds.slice(0, 2)}
            />
          )}
        </motion.section>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="glass rounded-3xl p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">Temperature</h2>
            {temp && <TrendChart series={[temp]} kind={kind} hours={hours} height={160} unit="°F" />}
          </section>
          <section className="glass rounded-3xl p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">Humidity</h2>
            {rh && <TrendChart series={[rh]} kind={kind} hours={hours} height={160} unit="%" />}
          </section>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Dew point"
            value={dew?.value ?? null}
            unit="°F"
            // 60.8°F = 16°C, the muggy threshold
            note={dew?.value !== null && dew !== undefined && dew.value! > 60.8 ? "muggy" : "comfortable"}
          />
          <StatTile label="Absolute humidity" value={abs?.value ?? null} unit="g/m³" />
          <StatTile label="Temperature" value={room.metrics.temperature?.value ?? null} unit="°F" />
          <StatTile label="Humidity" value={room.metrics.humidity?.value ?? null} unit="%" digits={0} />
        </div>

        {pmSeries.length > 0 && (
          <section className="mt-4 glass rounded-3xl p-5">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Particulate matter</h2>
              <LegendRow items={pmSeries.map((s) => ({ name: s.name, color: s.color }))} />
            </header>
            <TrendChart series={pmSeries} kind={kind} hours={hours} height={200} unit="µg/m³" area={false} />
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
              hours={hours}
              height={180}
              area={false}
            />
          </section>
        )}
      </motion.div>
    </main>
  );
}
