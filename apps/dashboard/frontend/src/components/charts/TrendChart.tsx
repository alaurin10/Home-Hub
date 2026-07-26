import { useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoryPoint } from "../../api/types";
import { formatValue, tooltipLabel } from "../../lib/format";
import { axisLabel, isMidnight, timeAxis } from "../../lib/timeAxis";

export interface Series {
  name: string;
  points: HistoryPoint[];
  color: string; // categorical slot var, fixed per entity
}

/** Where the pointer is, as a fraction across the plot. Component state, never
 * lifted to the store: two charts on screen scrub independently. */
interface Cursor {
  fraction: number;
  index: number;
}

/**
 * The one time-series chart. 2px lines, ~10% area wash, hairline grid, muted
 * tabular ticks, and a scrub readout that works under both a mouse and a thumb.
 *
 * Two things it does that Recharts will not do on its own:
 *   - ticks land on round clock boundaries (lib/timeAxis), with midnight named
 *     by its weekday and drawn as a day boundary, because a 48h axis of bare
 *     clock times repeats and turns ambiguous;
 *   - the readout is pointer-driven rather than hover-driven, so a press-drag
 *     on a phone scrubs. `touch-action: pan-y` keeps vertical page scrolling.
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<Cursor | null>(null);

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
        row[s.name] = v;
        if (kind === "stats") {
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

  const axis = useMemo(() => {
    if (!data.length) return { ticks: [] as number[], step: 24 };
    return timeAxis(data[0].t as number, data[data.length - 1].t as number, hours, width || 900);
  }, [data, hours, width]);

  const track = (clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || !data.length) return;
    const fraction = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    setCursor({ fraction, index: Math.round(fraction * (data.length - 1)) });
  };

  if (!data.length) return <div style={{ height }} className="animate-pulse rounded-xl bg-surface-2" />;

  // Narrow-span series (a ~2°F temperature day) need a decimal or the Y axis
  // repeats the same integer on every tick.
  const digits = yDigits ?? (span < 5 ? 1 : 0);
  const row = cursor ? data[cursor.index] : null;

  return (
    <div
      ref={wrapRef}
      className="relative cursor-crosshair"
      style={{ touchAction: "pan-y" }}
      onPointerMove={(e) => track(e.clientX)}
      onPointerDown={(e) => track(e.clientX)}
      onPointerLeave={() => setCursor(null)}
      onPointerUp={() => setCursor(null)}
    >
      <ResponsiveContainer width="100%" height={height} onResize={(w) => setWidth(w)}>
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
            ticks={axis.ticks}
            tickFormatter={(t: number) => axisLabel(t, axis.step)}
            tickLine={{ stroke: "var(--baseline)", strokeWidth: 1 }}
            tickSize={4}
            axisLine={{ stroke: "var(--baseline)", strokeWidth: 1 }}
            tick={(props: {
              x: number;
              y: number;
              payload: { value: number };
            }) => {
              const midnight = isMidnight(props.payload.value) && axis.step < 24;
              return (
                <text
                  x={props.x}
                  y={props.y + 14}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize={10.5}
                  fontWeight={midnight ? 600 : 400}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {axisLabel(props.payload.value, axis.step)}
                </text>
              );
            }}
            minTickGap={20}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => formatValue(v, digits)}
          />
          {/* Midnight reads as a day boundary, not just a differently-worded
              tick — without it a 48h chart looks like one very long day. */}
          {axis.step < 24 &&
            axis.ticks.filter(isMidnight).map((t) => (
              <ReferenceLine key={`day-${t}`} x={t} stroke="var(--hairline)" strokeWidth={1} />
            ))}
          {guides.map((g) => (
            <ReferenceLine
              key={g}
              y={g}
              stroke="var(--baseline)"
              strokeWidth={1}
              strokeDasharray="3 4"
              ifOverflow="hidden"
              label={{
                value: formatValue(g),
                position: "insideBottomRight",
                fill: "var(--muted)",
                fontSize: 9.5,
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
                activeDot={false}
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
                activeDot={false}
                dot={false}
              />
            ),
          )}
          {/* Drawn inside the SVG so the crosshair and dots sit in plot
              coordinates; the readout itself is HTML, positioned below. */}
          <Customized
            component={(props: unknown) => (
              <Crosshair chartProps={props} cursorIndex={cursor?.index ?? null} series={series} />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {row && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[118px] rounded-xl border border-hairline px-[11px] py-2 shadow-[var(--chrome-shadow)] backdrop-blur-xl"
          style={{
            left: `${cursor!.fraction * 100}%`,
            // Flip the anchor at the edges so the readout never leaves the card.
            transform:
              cursor!.fraction < 0.22
                ? "translateX(0)"
                : cursor!.fraction > 0.78
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
            background: "color-mix(in srgb, var(--surface) 88%, transparent)",
          }}
        >
          <div className="tnum whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[.04em] text-muted">
            {tooltipLabel(row.t as number, kind)}
          </div>
          {series.map((s) => (
            <div
              key={s.name}
              className="mt-[5px] flex items-center gap-2 whitespace-nowrap text-xs text-ink-2"
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{ background: s.color }}
              />
              <span className="flex-1">{s.name}</span>
              <span className="tnum font-semibold text-ink">
                {formatValue(row[s.name] as number | null, 1)}
                {unit && ` ${unit}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Recharts hands <Customized> the resolved axis maps, which is the only way to
 * draw in plot coordinates without re-deriving the scales ourselves. */
function Crosshair({
  chartProps,
  cursorIndex,
  series,
}: {
  chartProps: unknown;
  cursorIndex: number | null;
  series: Series[];
}) {
  const props = chartProps as {
    xAxisMap?: Record<string, { scale: (v: number) => number }>;
    yAxisMap?: Record<string, { scale: (v: number) => number }>;
    offset?: { top: number; height: number };
    data?: Record<string, number | null>[];
  };
  if (cursorIndex === null || !props.data?.length) return null;
  const xAxis = Object.values(props.xAxisMap ?? {})[0];
  const yAxis = Object.values(props.yAxisMap ?? {})[0];
  const offset = props.offset;
  if (!xAxis || !yAxis || !offset) return null;

  const row = props.data[cursorIndex];
  if (!row) return null;
  const x = xAxis.scale(row.t as number);

  return (
    <g pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={offset.top}
        y2={offset.top + offset.height}
        stroke="var(--baseline)"
        strokeWidth={1}
      />
      {series.map((s) => {
        const v = row[s.name];
        if (v === null || v === undefined) return null;
        return (
          <circle
            key={s.name}
            cx={x}
            cy={yAxis.scale(v as number)}
            r={4}
            fill={s.color}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        );
      })}
    </g>
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
