import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import type { HistoryPoint } from "../../api/types";
import { Sparkline } from "./Sparkline";

export interface SparklineSlot {
  metric: string;
  label: string;
  points: HistoryPoint[] | null;
  minSpan: number;
}

const ROTATE_MS = 8000;
const LABEL_H = 12; // reserved under the curve so the metric label never clips

/** Sparkline that cycles through metrics with a crossfade. The index derives
 * from the wall clock, so every card on the grid flips in unison instead of
 * drifting apart by mount time. Reduced motion pins to the first slot —
 * auto-cycling content is exactly what those users opted out of. */
export function RotatingSparkline({
  slots,
  width = 120,
  height = 28,
  stretch = false,
}: {
  slots: SparklineSlot[];
  width?: number;
  height?: number;
  stretch?: boolean;
}) {
  const reduced = useReducedMotion();
  const live = slots.filter((s) => s.points && s.points.length >= 2);
  const clockIndex = () => Math.floor(Date.now() / ROTATE_MS) % Math.max(live.length, 1);
  const [index, setIndex] = useState(clockIndex);

  useEffect(() => {
    if (reduced || live.length < 2) return;
    // Align the first flip to the next clock boundary, then tick on-period.
    let interval: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      setIndex(clockIndex());
      interval = setInterval(() => setIndex(clockIndex()), ROTATE_MS);
    }, ROTATE_MS - (Date.now() % ROTATE_MS));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, live.length]);

  const boxStyle = { width: stretch ? undefined : width, height: height + LABEL_H };
  if (!live.length) return <div className={stretch ? "w-full" : ""} style={boxStyle} />;
  const slot = live[reduced ? 0 : index % live.length];

  return (
    <div aria-hidden className={`relative ${stretch ? "w-full" : ""}`} style={boxStyle}>
      {/* Default sync mode, not mode="wait": a waiting exit inside routed
          content stalls the router's own AnimatePresence (see RoomView). */}
      <AnimatePresence initial={false}>
        <motion.div
          key={slot.metric}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Sparkline points={slot.points} width={width} height={height} minSpan={slot.minSpan} stretch={stretch} />
          <div className="absolute bottom-0 right-0 text-[10px] font-medium leading-none text-muted">
            {slot.label}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
