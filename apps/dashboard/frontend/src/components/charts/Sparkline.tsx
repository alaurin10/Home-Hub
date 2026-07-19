import type { HistoryPoint } from "../../api/types";

/** Tiny 3h trend in the de-emphasis hue (muted ink, not a series color) —
 * context, not a chart: no axes, no tooltip. `minSpan` stops a flat signal's
 * noise being stretched to full height and read as volatility. Purely
 * presentational: points arrive via the Home view's batched history fetch. */
export function Sparkline({
  points,
  width = 120,
  height = 28,
  minSpan = 0,
  stretch = false,
  stroke = "var(--baseline)",
}: {
  points: HistoryPoint[] | null;
  width?: number;   // coordinate-space width; rendered width when not stretching
  height?: number;
  minSpan?: number;
  stretch?: boolean; // fill the container width (non-scaling stroke keeps the hairline true)
  stroke?: string;
}) {
  if (!points || points.length < 2) return <div style={{ width: stretch ? "100%" : width, height }} />;

  const vs = points.map((p) => p.v ?? 0);
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const span = max - min || 1;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const path = points
    .map((p, i) => {
      const x = ((p.t - t0) / (t1 - t0 || 1)) * (width - 2) + 1;
      const y = height - 3 - ((p.v! - min) / span) * (height - 6);
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
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
