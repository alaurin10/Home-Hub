import { motion, useReducedMotion, useSpring } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import { SCORE_BAND_COLOR } from "../lib/thresholds";

const SWEEP = 250; // degrees; the gap sits at the bottom
const START = -SWEEP / 2; // 0° = 12 o'clock, clockwise positive

function polar(c: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad) };
}

/**
 * The air-score arc: a hairline track with a band-colored fill.
 *
 * Used at three sizes (152 hero / 104 mobile hero / 58 room card) off one
 * geometry, so a glance from the card to the hero reads the same shape. The
 * value renders inside via `children` — color is never the only signal.
 */
export function ScoreArc({
  value,
  band,
  size = 152,
  strokeWidth = 9,
  children,
}: {
  value: number | null;
  band: string;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const c = size / 2;
  const r = (size - strokeWidth) / 2 - 1;
  const start = polar(c, r, START);
  const end = polar(c, r, START + SWEEP);
  const d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 1 1 ${end.x.toFixed(
    2,
  )} ${end.y.toFixed(2)}`;

  // A hair of fill at 0 so the arc reads as "measured, and low" rather than
  // "not measured" — an unmeasured room renders no arc at all.
  const fraction = value === null ? 0 : Math.max(0.02, Math.min(1, value / 100));

  const fill = useSpring(0, { stiffness: 120, damping: 26 });
  useEffect(() => {
    if (reduced) fill.jump(fraction);
    else fill.set(fraction);
  }, [fraction, reduced, fill]);

  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
        <path
          d={d}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {value !== null && (
          <motion.path
            d={d}
            fill="none"
            stroke={SCORE_BAND_COLOR[band] ?? "var(--muted)"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ pathLength: fill }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
