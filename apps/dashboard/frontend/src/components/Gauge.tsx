import { motion, useReducedMotion, useSpring } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import { STATUS_COLOR, type Status } from "../lib/thresholds";

const SWEEP = 240; // degrees of arc; the gap sits at the bottom
const START = -SWEEP / 2; // 0° = 12 o'clock, clockwise positive

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number) {
  const s = polar(cx, cy, r, START);
  const e = polar(cx, cy, r, START + SWEEP);
  return `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${r} ${r} 0 ${SWEEP > 180 ? 1 : 0} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Compact arc meter (the CO₂ dial). A recessive hairline track with a
 * status-colored fill; threshold notches mark where the config bands flip so
 * "how close to fair/poor" reads without a painted rainbow arc. Color is
 * never the only signal — the value renders inside via `children`.
 */
export function Gauge({
  value,
  bounds,
  min = 400, // outdoor CO₂ baseline; the arc starts meaningfully, not at zero
  max,
  size = 64,
  status,
  children,
}: {
  value: number | null;
  bounds: number[];
  min?: number;
  max?: number;
  size?: number;
  status: Status | null;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const top = max ?? bounds[bounds.length - 1] ?? min + 1;
  const frac = value === null ? 0 : Math.max(0.02, clamp01((value - min) / (top - min)));

  // Spring the fill without React renders; snap under reduced motion.
  const fill = useSpring(0, { stiffness: 120, damping: 26 });
  useEffect(() => {
    if (reduced) fill.jump(frac);
    else fill.set(frac);
  }, [frac, reduced, fill]);

  const strokeWidth = Math.max(4, size * 0.11);
  const c = size / 2;
  const r = (size - strokeWidth) / 2 - 1;
  const d = arcPath(c, c, r);

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <path d={d} fill="none" stroke="var(--hairline)" strokeWidth={strokeWidth} strokeLinecap="round" />
        {value !== null && (
          <motion.path
            d={d}
            fill="none"
            stroke={status ? STATUS_COLOR[status] : "var(--muted)"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ pathLength: fill }}
          />
        )}
        {bounds.map((b) => {
          const deg = START + SWEEP * clamp01((b - min) / (top - min));
          const p1 = polar(c, c, r - strokeWidth / 2 - 1, deg);
          const p2 = polar(c, c, r + strokeWidth / 2 + 1, deg);
          return (
            <line
              key={b}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="var(--baseline)"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
