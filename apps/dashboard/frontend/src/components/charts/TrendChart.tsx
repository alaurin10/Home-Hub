import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoryPoint } from "../../api/types";
import { formatValue, tickLabel, tooltipLabel } from "../../lib/format";
import { timeTicks } from "../../lib/timeAxis";

export interface Series {
  name: string;
  points: HistoryPoint[];
  color: string; // categorical slot var, fixed per entity
}

/**
 * The one time-series chart. Follows the mark spec: 2px lines, ~10% area
 * wash, hairline solid grid, muted tabular ticks, crosshair + tooltip.
 * Long-range ("stats") data renders a translucent min–max band + mean line.
 * Single series: no legend (the card title names it). Multi-series: the
 * parent renders a legend row; colors are fixed per entity, never cycled.
 */
export function TrendChart({
  series,
  kind,
  hours,
  height = 220,
  unit = "",
  guides = [],
  area = true,
  yDigits,
}: {
  series: Series[];
  kind: "raw" | "stats";
  hours: number;
  height?: number;
  unit?: string;
  guides?: number[];
  area?: boolean;
  /** Y tick decimals; defaults to 1 when the plotted span is narrow (<5). */
  yDigits?: number;
}) {
  // Merge all series onto one time axis (rows keyed by bucketed timestamp)
  const { data, span } = useMemo(() => {
    const rows = new Map<number, Record<string, number | null>>();
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        const key = Math.round(p.t);
        const row = rows.get(key) ?? { t: key };
        const v = (kind === "raw" ? p.v : p.mean) ?? null;
        if (v !== null) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (kind === "raw") {
          row[s.name] = v;
        } else {
          row[s.name] = v;
          row[`${s.name}·band`] = [p.min ?? null, p.max ?? null] as unknown as number;
        }
        rows.set(key, row);
      }
    }
    return {
      data: [...rows.values()].sort((a, b) => (a.t as number) - (b.t as number)),
      span: hi - lo,
    };
  }, [series, kind]);

  const ticks = useMemo(
    () =>
      data.length
        ? timeTicks(data[0].t as number, data[data.length - 1].t as number, hours)
        : undefined,
    [data, hours],
  );

  if (!data.length) return <div style={{ height }} className="animate-pulse rounded-xl bg-surface-2" />;

  // Narrow-span series (a ~2°F temperature day) need a decimal or the Y
  // axis repeats the same integer on every tick.
  const digits = yDigits ?? (span < 5 ? 1 : 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`fill-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--hairline)" strokeWidth={1} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={(t: number) => tickLabel(t, hours)}
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          minTickGap={32}
        />
        <YAxis
          width={48}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => formatValue(v, digits)}
        />
        <Tooltip
          cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="glass-chrome rounded-xl px-3 py-2 text-xs">
                <div className="mb-1 font-medium text-muted">{tooltipLabel(label as number, kind)}</div>
                {payload
                  .filter((p) => !String(p.dataKey).endsWith("·band"))
                  .map((p) => {
                    // For hourly stats, surface the min–max band next to the
                    // mean so the shaded area is readable at the cursor.
                    const band =
                      kind === "stats"
                        ? ((p.payload as Record<string, unknown>)[`${String(p.dataKey)}·band`] as
                            | [number | null, number | null]
                            | undefined)
                        : undefined;
                    return (
                      <div key={String(p.dataKey)} className="flex items-center gap-1.5 text-ink">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.stroke ?? p.color }} />
                        <span className="text-ink-2">{String(p.dataKey)}</span>
                        <span className="ml-auto pl-3 font-semibold">
                          {formatValue(p.value as number, 1)} {unit}
                        </span>
                        {band && band[0] !== null && band[1] !== null && (
                          <span className="text-muted">
                            {formatValue(band[0], 1)}–{formatValue(band[1], 1)}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          }}
        />
        {guides.map((g) => (
          <ReferenceLine
            key={g}
            y={g}
            stroke="var(--baseline)"
            strokeWidth={1}
            ifOverflow="hidden"
            label={{
              value: formatValue(g),
              position: "insideBottomRight",
              fill: "var(--muted)",
              fontSize: 10,
              dy: -2,
            }}
          />
        ))}
        {kind === "stats" &&
          series.map((s, i) => (
            <Area
              key={`${s.name}·band`}
              dataKey={`${s.name}·band`}
              stroke="none"
              fill={`url(#fill-${i})`}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
            />
          ))}
        {series.map((s, i) =>
          kind === "raw" && area ? (
            <Area
              key={s.name}
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              fill={`url(#fill-${i})`}
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              dot={false}
            />
          ) : (
            <Line
              key={s.name}
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              dot={false}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Compact legend row for multi-series charts: colored key + ink label. */
export function LegendRow({ items }: { items: { name: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((item) => (
        <span key={item.name} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ background: item.color }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}
