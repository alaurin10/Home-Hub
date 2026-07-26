import { useId } from "react";

import type { HistoryPoint } from "../../api/types";

/** Tiny trend — context, not a chart: no axes, no tooltip.
 *
 * `minSpan` stops a flat signal's noise being stretched to full height and read
 * as volatility: a bedroom holding 70.1–70.3 °F overnight should look flat,
 * because it was. Purely presentational; points arrive from a batched fetch.
 */
export function Sparkline({
  points,
  width = 120,
  height = 28,
  minSpan = 0,
  color = "var(--baseline)",
  wash = true,
  stretch = false,
}: {
  points: HistoryPoint[] | null;
  width?: number; // coordinate-space width; rendered width when not stretching
  height?: number;
  minSpan?: number;
  color?: string;
  /** The 22%→0 gradient under the line. Off for the thinnest uses. */
  wash?: boolean;
  stretch?: boolean; // fill the container (non-scaling stroke keeps the hairline true)
}) {
  const gradientId = useId();
  const usable = points?.filter((p) => (p.v ?? p.mean) !== null && (p.v ?? p.mean) !== undefined);
  if (!usable || usable.length < 2)
    return <div style={{ width: stretch ? "100%" : width, height }} />;

  const valueOf = (p: HistoryPoint) => (p.v ?? p.mean) as number;
  const vs = usable.map(valueOf);
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const span = max - min || 1;
  const t0 = usable[0].t;
  const t1 = usable[usable.length - 1].t;
  const xy = (p: HistoryPoint) => [
    ((p.t - t0) / (t1 - t0 || 1)) * (width - 2) + 1,
    height - 3 - ((valueOf(p) - min) / span) * (height - 6),
  ];
  const path = usable
    .map((p, i) => {
      const [x, y] = xy(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={stretch ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      aria-hidden
      className="block overflow-visible"
    >
      {wash && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {wash && (
        <path d={`${path} L${width - 1},${height} L1,${height} Z`} fill={`url(#${gradientId})`} stroke="none" />
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
