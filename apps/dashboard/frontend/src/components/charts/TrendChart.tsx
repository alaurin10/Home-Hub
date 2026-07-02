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
import { clockLabel, formatValue } from "../../lib/format";

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
}: {
  series: Series[];
  kind: "raw" | "stats";
  hours: number;
  height?: number;
  unit?: string;
  guides?: number[];
  area?: boolean;
}) {
  // Merge all series onto one time axis (rows keyed by bucketed timestamp)
  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number | null>>();
    for (const s of series) {
      for (const p of s.points) {
        const key = Math.round(p.t);
        const row = rows.get(key) ?? { t: key };
        if (kind === "raw") {
          row[s.name] = p.v ?? null;
        } else {
          row[s.name] = p.mean ?? null;
          row[`${s.name}·band`] = [p.min ?? null, p.max ?? null] as unknown as number;
        }
        rows.set(key, row);
      }
    }
    return [...rows.values()].sort((a, b) => (a.t as number) - (b.t as number));
  }, [series, kind]);

  if (!data.length) return <div style={{ height }} className="animate-pulse rounded-xl bg-surface-2" />;

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
          tickFormatter={(t: number) => clockLabel(t, hours)}
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          minTickGap={48}
        />
        <YAxis
          width={44}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => formatValue(v)}
        />
        <Tooltip
          cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-xl border border-hairline bg-surface px-3 py-2 text-xs shadow-sm">
                <div className="mb-1 font-medium text-muted">{clockLabel(label as number, hours)}</div>
                {payload
                  .filter((p) => !String(p.dataKey).endsWith("·band"))
                  .map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center gap-1.5 text-ink">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.stroke ?? p.color }} />
                      <span className="text-ink-2">{String(p.dataKey)}</span>
                      <span className="ml-auto pl-3 font-semibold">
                        {formatValue(p.value as number, 1)} {unit}
                      </span>
                    </div>
                  ))}
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
              animationDuration={600}
              animationBegin={0}
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
              animationDuration={600}
              animationBegin={0}
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
