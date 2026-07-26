import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getHistory } from "../api/client";
import type { HistoryPoint, HistoryResponse, RoomSnapshot } from "../api/types";
import { Page } from "../App";
import { PageTransition } from "../components/PageTransition";
import { RangeControl } from "../components/RangeControl";
import { Skeleton } from "../components/Skeleton";
import { Sparkline } from "../components/charts/Sparkline";
import { TrendChart, type Series } from "../components/charts/TrendChart";
import { formatValue, humanDuration } from "../lib/format";
import { RANGES, rangeCaption } from "../lib/ranges";
import { displayTemp, isTemperatureMetric, scaleOf, tempUnit } from "../lib/scale";
import {
  METRIC_DIGITS,
  METRIC_LABEL,
  METRIC_SHORT,
  SCORE_BAND_COLOR,
  SCORE_BAND_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  statusFor,
  tint,
  trackPercent,
  unitFor,
  type Status,
} from "../lib/thresholds";
import { useIsDesktop } from "../lib/useBreakpoint";
import { useStore } from "../store";

const BAND_ORDER: Status[] = ["good", "fair", "poor", "bad"];

export function RoomView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { config, rooms, settings, rangeIdx } = useStore();
  const isDesktop = useIsDesktop();
  const [metric, setMetric] = useState("co2");
  const [loaded, setLoaded] = useState<{
    roomId: string;
    rangeIdx: number;
    resp: HistoryResponse;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const roomCfg = config?.rooms.find((r) => r.id === id);
  const room = rooms?.rooms.find((r) => r.id === id);

  // A new room resets the plotted metric: CO₂ is the reading that decides
  // "open a window", so it is the one worth landing on.
  useEffect(() => setMetric("co2"), [id]);

  useEffect(() => {
    if (!roomCfg) return;
    let alive = true;
    setFailed(false);
    const range = RANGES[rangeIdx];
    getHistory(Object.values(roomCfg.entities), range.hours, range.points)
      .then((resp) => alive && setLoaded({ roomId: roomCfg.id, rangeIdx, resp }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [roomCfg, rangeIdx, retryKey]);

  if (!config || !rooms)
    return (
      <Page>
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </Page>
    );
  if (!room || !roomCfg)
    return (
      <Page>
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-ink-2">Room not found.</p>
          <Link
            to="/"
            className="glass-chrome mt-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium text-ink-2"
          >
            Back to home
          </Link>
        </div>
      </Page>
    );

  const scale = scaleOf(settings);
  const history = loaded && loaded.roomId === roomCfg.id ? loaded.resp : null;
  const plottedHours = history ? RANGES[loaded!.rangeIdx].hours : RANGES[rangeIdx].hours;
  const kind = history?.kind ?? "raw";
  const metrics = Object.keys(roomCfg.entities);

  const pointsFor = (m: string): HistoryPoint[] | null => {
    const raw = history?.series[roomCfg.entities[m]];
    if (!raw?.length) return null;
    if (!isTemperatureMetric(m) || scale === "F") return raw;
    return raw.map((p) => ({
      ...p,
      v: p.v === null || p.v === undefined ? p.v : displayTemp(p.v, scale),
      mean: p.mean === null || p.mean === undefined ? p.mean : displayTemp(p.mean, scale),
    }));
  };

  const value = room.metrics[metric]?.value ?? null;
  const status = statusFor(config, metric, value);
  const unit = isTemperatureMetric(metric) ? tempUnit(scale) : unitFor(config, metric);
  const digits = METRIC_DIGITS[metric] ?? 0;
  const points = pointsFor(metric);
  const series: Series[] = points
    ? [
        {
          name: METRIC_LABEL[metric] ?? metric,
          points,
          color: status ? STATUS_COLOR[status] : "var(--series-1)",
        },
      ]
    : [];

  // How much of the plotted window each status band held. Counted from the
  // samples actually on screen, so it always agrees with the chart above it.
  const occupancy = (() => {
    if (!points) return [];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const p of points) {
      const v = (kind === "raw" ? p.v : p.mean) ?? null;
      // Bands are defined in °F, so classify before the display conversion.
      const source = isTemperatureMetric(metric) && scale === "C" && v !== null ? (v * 9) / 5 + 32 : v;
      const s = statusFor(config, metric, source);
      if (!s) continue;
      counts[s] = (counts[s] ?? 0) + 1;
      total += 1;
    }
    if (!total) return [];
    return BAND_ORDER.filter((b) => counts[b]).map((b) => ({
      band: b,
      percent: Math.round((counts[b] / total) * 100),
    }));
  })();

  const smallMultiples = metrics.filter((m) => m !== metric).slice(0, 3);

  return (
    <Page>
      <PageTransition>
        <div className="flex flex-col gap-5 max-lg:gap-3.5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              aria-label="Back to home"
              className="glass-chrome flex h-9 w-9 flex-none items-center justify-center rounded-full text-ink-2 max-lg:h-[34px] max-lg:w-[34px]"
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <h1 className="text-[22px] font-semibold tracking-[-.02em] text-ink lg:hidden">
              {room.name}
            </h1>
            {room.score ? (
              <span
                className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-[12.5px] font-semibold text-ink-2"
                style={{ background: tint(SCORE_BAND_COLOR[room.score.band]) }}
              >
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ background: SCORE_BAND_COLOR[room.score.band] }}
                />
                {SCORE_BAND_LABEL[room.score.band]} · score {room.score.value}
              </span>
            ) : (
              <span className="text-[12.5px] font-medium" style={{ color: "var(--status-bad)" }}>
                Sensor offline
              </span>
            )}
            <span className="text-[12.5px] text-muted max-lg:hidden">{nodeLine(room)}</span>
          </div>

          {/* Mobile: one horizontally scrollable rail of metric pills. Swipe,
              never wrap — a wrapped rail pushes the chart below the fold. */}
          <div className="no-scrollbar flex gap-[7px] overflow-x-auto pb-0.5 lg:hidden">
            {metrics.map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`flex-none rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors ${
                  m === metric ? "bg-ink text-surface" : "glass-chrome text-ink-2"
                }`}
              >
                {METRIC_SHORT[m] ?? m}
              </button>
            ))}
          </div>

          {failed && (
            <div className="glass flex items-center justify-between rounded-3xl p-4" role="alert">
              <p className="text-sm text-ink-2">Couldn't load history for this range.</p>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="glass-chrome rounded-full px-3 py-1 text-xs font-medium text-ink-2"
              >
                Retry
              </button>
            </div>
          )}

          <div className="grid min-w-0 gap-5 max-lg:gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="glass min-w-0 rounded-[26px] p-[24px_26px_18px] max-lg:rounded-[24px] max-lg:p-[18px_18px_12px]">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <h2 className="text-[16.5px] font-semibold tracking-[-.01em] text-ink max-lg:text-[11px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[.08em] max-lg:text-muted">
                    {METRIC_LABEL[metric] ?? metric}
                  </h2>
                  <div className="mt-1 text-[12.5px] text-muted max-lg:hidden">
                    {rangeCaption(RANGES[rangeIdx])}
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="tnum text-[34px] font-semibold tracking-[-.03em] text-ink">
                    {formatValue(
                      value !== null && isTemperatureMetric(metric)
                        ? displayTemp(value, scale)
                        : value,
                      digits,
                    )}
                  </span>
                  <span className="text-sm text-muted">{unit} now</span>
                </div>
              </div>
              <RangeControl />
              {series.length ? (
                <TrendChart
                  series={series}
                  kind={kind}
                  hours={plottedHours}
                  height={isDesktop ? 470 : 210}
                  unit={unit}
                  guides={config.thresholds[metric]?.bounds?.slice(0, 2) ?? []}
                />
              ) : (
                <Skeleton className="my-2 h-[470px] max-lg:h-[210px]" />
              )}
            </section>

            <section className="glass rounded-[26px] p-[22px_24px] max-lg:rounded-[24px] max-lg:p-[18px_20px]">
              <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted max-lg:text-[11px] max-lg:tracking-[.08em]">
                All readings
              </h2>
              <div className="mt-3 flex flex-col gap-0.5">
                {metrics.map((m) => {
                  const mv = room.metrics[m]?.value ?? null;
                  const s = statusFor(config, m, mv);
                  const active = m === metric;
                  const shown =
                    mv !== null && isTemperatureMetric(m) ? displayTemp(mv, scale) : mv;
                  return (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={`block w-full rounded-xl p-[10px_12px] text-left transition-colors hover:bg-surface-2 ${
                        active ? "bg-surface-2" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2.5">
                        <span className="inline-flex items-center gap-[7px] text-[13px] text-ink-2">
                          {METRIC_LABEL[m] ?? m}
                          {active && (
                            <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted">
                              plotted
                            </span>
                          )}
                        </span>
                        <span className="tnum text-[15px] font-semibold text-ink">
                          {formatValue(shown, METRIC_DIGITS[m] ?? 0)}
                          <span className="ml-[3px] text-[11.5px] font-normal text-muted">
                            {isTemperatureMetric(m) ? tempUnit(scale) : unitFor(config, m)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-[7px] h-1 rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${trackPercent(m, mv)}%`,
                            background: s ? STATUS_COLOR[s] : "var(--muted)",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {occupancy.length > 0 && (
                <div className="mt-5 border-t border-hairline pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[.07em] text-muted">
                      Time in band
                    </span>
                    <span className="text-[11.5px] text-muted">{METRIC_LABEL[metric]}</span>
                  </div>
                  <div className="mt-2.5 flex h-[9px] overflow-hidden rounded-full bg-surface-2">
                    {occupancy.map((o) => (
                      <span
                        key={o.band}
                        style={{ width: `${o.percent}%`, background: STATUS_COLOR[o.band] }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-[7px]">
                    {occupancy.map((o) => (
                      <div key={o.band} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                        <span
                          aria-hidden
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: STATUS_COLOR[o.band] }}
                        />
                        {STATUS_LABEL[o.band]}
                        <span className="tnum ml-auto text-muted">{o.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-5 max-lg:hidden lg:grid-cols-3">
            {smallMultiples.map((m) => {
              const mv = room.metrics[m]?.value ?? null;
              const s = statusFor(config, m, mv);
              const shown = mv !== null && isTemperatureMetric(m) ? displayTemp(mv, scale) : mv;
              return (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className="glass rounded-[22px] p-[18px_20px_14px] text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] font-semibold text-ink-2">
                      {METRIC_LABEL[m] ?? m}
                    </span>
                    <span className="tnum text-base font-semibold text-ink">
                      {formatValue(shown, METRIC_DIGITS[m] ?? 0)}
                      <span className="ml-0.5 text-[11px] font-normal text-muted">
                        {isTemperatureMetric(m) ? tempUnit(scale) : unitFor(config, m)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <Sparkline
                      points={pointsFor(m)}
                      width={481}
                      height={96}
                      color={s ? STATUS_COLOR[s] : "var(--baseline)"}
                      stretch
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </PageTransition>
    </Page>
  );
}

function nodeLine(room: RoomSnapshot): string {
  const parts = [room.node.online ? "node online" : "node offline"];
  if (room.node.wifi_signal !== null) parts.push(`${formatValue(room.node.wifi_signal)} dBm`);
  if (room.node.uptime !== null) parts.push(`up ${humanDuration(room.node.uptime)}`);
  return parts.join(" · ");
}
