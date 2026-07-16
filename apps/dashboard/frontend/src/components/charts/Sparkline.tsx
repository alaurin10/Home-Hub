import { useEffect, useState } from "react";

import { getHistory } from "../../api/client";
import type { HistoryPoint } from "../../api/types";

/** Tiny 3h trend in the de-emphasis hue (muted ink, not a series color) —
 * context, not a chart: no axes, no tooltip. `minSpan` stops a flat signal's
 * noise being stretched to full height and read as volatility. */
export function Sparkline({
  entity,
  width = 120,
  height = 28,
  minSpan = 0,
}: {
  entity: string;
  width?: number;
  height?: number;
  minSpan?: number;
}) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getHistory([entity], 3)
        .then((h) => alive && setPoints(h.series[entity] ?? []))
        .catch(() => alive && setPoints([]));
    void load();
    // Refresh every 5 min so a card left on screen doesn't fossilize
    // (cheap poll; live WS wiring isn't warranted for a context glyph).
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [entity]);

  if (!points || points.length < 2) return <div style={{ width, height }} />;

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
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={path} fill="none" stroke="var(--baseline)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
