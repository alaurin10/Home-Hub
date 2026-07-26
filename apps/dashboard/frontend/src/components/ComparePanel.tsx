import { useEffect, useState } from "react";

import { getHistory } from "../api/client";
import type { HistoryResponse } from "../api/types";
import { RangeControl } from "./RangeControl";
import { Skeleton } from "./Skeleton";
import { TrendChart, type Series } from "./charts/TrendChart";
import { formatValue } from "../lib/format";
import { RANGES, rangeCaption } from "../lib/ranges";
import { displayTemp, isTemperatureMetric, scaleOf, tempUnit, type Scale } from "../lib/scale";
import { METRIC_DIGITS, METRIC_SHORT, unitFor } from "../lib/thresholds";
import { useIsDesktop } from "../lib/useBreakpoint";
import { useStore, type CompareMetric } from "../store";

// Fixed categorical slots per room, assigned by config order and never cycled:
// the Kitchen is the same blue on every chart in the app.
export const ROOM_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

const METRICS: CompareMetric[] = ["temperature", "humidity", "co2", "pm2_5"];

/** One history fetch for every room's chosen metric, keyed by metric+range. */
export function useCompareHistory(metric: CompareMetric, rangeIdx: number) {
  const config = useStore((s) => s.config);
  const [loaded, setLoaded] = useState<{
    metric: string;
    rangeIdx: number;
    resp: HistoryResponse;
  } | null>(null);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    const range = RANGES[rangeIdx];
    const entities = config.rooms.map((r) => r.entities[metric]).filter(Boolean);
    if (!entities.length) {
      setLoaded(null);
      return;
    }
    getHistory(entities, range.hours, range.points)
      .then((resp) => alive && setLoaded({ metric, rangeIdx, resp }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [config, metric, rangeIdx]);

  // Keep the previous chart mounted while a new range loads: swapping data is
  // calmer than collapsing the card and re-opening it.
  return loaded;
}

function MetricTabs({
  metric,
  onPick,
  available,
}: {
  metric: CompareMetric;
  onPick: (m: CompareMetric) => void;
  available: Set<string>;
}) {
  return (
    <div className="glass-chrome flex gap-[3px] rounded-full p-[3px]">
      {METRICS.filter((m) => available.has(m)).map((m) => (
        <button
          key={m}
          onClick={() => onPick(m)}
          className={`rounded-full px-[13px] py-1.5 text-[12.5px] font-medium transition-colors ${
            metric === m ? "bg-ink text-surface" : "text-muted hover:text-ink-2"
          }`}
        >
          {METRIC_SHORT[m]}
        </button>
      ))}
    </div>
  );
}

/** Builds the plotted series, converting temperatures to the display scale at
 * the last moment (never in the store — see lib/scale). */
export function buildSeries(
  loaded: ReturnType<typeof useCompareHistory>,
  config: ReturnType<typeof useStore.getState>["config"],
  metric: CompareMetric,
  scale: Scale,
): Series[] {
  if (!loaded || !config) return [];
  const convert = isTemperatureMetric(metric) && scale === "C";
  return config.rooms
    .map((room, i) => {
      const points = loaded.resp.series[room.entities[metric]];
      if (!points?.length) return null;
      return {
        name: room.name,
        color: ROOM_COLORS[i % ROOM_COLORS.length],
        points: convert
          ? points.map((p) => ({
              ...p,
              v: p.v === null || p.v === undefined ? p.v : displayTemp(p.v, scale),
              mean: p.mean === null || p.mean === undefined ? p.mean : displayTemp(p.mean, scale),
            }))
          : points,
      };
    })
    .filter((s): s is Series => s !== null);
}

export function seriesValues(series: Series, kind: "raw" | "stats"): number[] {
  return series.points
    .map((p) => (kind === "raw" ? p.v : p.mean))
    .filter((v): v is number => typeof v === "number");
}

/**
 * The compare panel, shared by the Home hero row and the full /compare view.
 * One code path so the two can never drift; only the chart height differs.
 */
export function ComparePanel({
  height = 250,
  mobileHeight = 200,
  title = "Compare rooms",
}: {
  height?: number;
  mobileHeight?: number;
  title?: string;
}) {
  const { config, compareMetric, setCompareMetric, rangeIdx, settings } = useStore();
  const isDesktop = useIsDesktop();
  const chartHeight = isDesktop ? height : mobileHeight;
  const loaded = useCompareHistory(compareMetric, rangeIdx);
  const scale = scaleOf(settings);
  const range = RANGES[rangeIdx];

  const available = new Set(config?.rooms.flatMap((r) => Object.keys(r.entities)) ?? []);
  const series = buildSeries(loaded, config, compareMetric, scale);
  const kind = loaded?.resp.kind ?? "raw";
  const plottedHours = loaded ? RANGES[loaded.rangeIdx].hours : range.hours;
  const unit = isTemperatureMetric(compareMetric)
    ? tempUnit(scale)
    : config
      ? unitFor(config, compareMetric)
      : "";
  const digits = METRIC_DIGITS[compareMetric] ?? 0;

  return (
    <section className="glass min-w-0 rounded-[26px] p-[24px_26px_20px] max-lg:rounded-[24px] max-lg:p-[18px_18px_12px]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 className="text-[16.5px] font-semibold tracking-[-.01em] text-ink">{title}</h2>
          <div className="mt-1 text-[12.5px] text-muted">{rangeCaption(range)}</div>
        </div>
        <MetricTabs metric={compareMetric} onPick={setCompareMetric} available={available} />
      </div>

      <RangeControl />

      {series.length ? (
        <TrendChart
          series={series}
          kind={kind}
          hours={plottedHours}
          height={chartHeight}
          unit={unit}
          area={series.length === 1}
          guides={config?.thresholds[compareMetric]?.bounds?.slice(0, 2) ?? []}
        />
      ) : (
        <Skeleton className="my-2" style={{ height: chartHeight }} />
      )}

      <div className="mt-2.5 flex flex-wrap gap-x-[22px] gap-y-2 border-t border-hairline pt-3.5">
        {series.map((s) => {
          const values = seriesValues(s, kind);
          if (!values.length) return null;
          return (
            <span key={s.name} className="inline-flex items-baseline gap-2 text-[12.5px] text-ink-2">
              <span
                aria-hidden
                className="inline-block h-[2.5px] w-[18px] self-center rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
              <span className="tnum font-semibold text-ink">
                {formatValue(values[values.length - 1], digits)}
                {unit && ` ${unit}`}
              </span>
              <span className="tnum text-muted">
                now · {formatValue(Math.min(...values), digits)}–
                {formatValue(Math.max(...values), digits)} range
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
