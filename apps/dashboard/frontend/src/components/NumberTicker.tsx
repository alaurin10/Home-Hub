import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";

import { formatValue } from "../lib/format";

/**
 * Spring-animated numeric display: eases to each new live value.
 * The formatted text is a motion value written straight to the DOM, so the
 * spring never triggers React renders (there are many tickers per card and
 * live pushes arrive every few seconds).
 */
export function NumberTicker({ value, digits = 0 }: { value: number | null; digits?: number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value ?? 0);
  const text = useTransform(mv, (v) => formatValue(v, digits));

  useEffect(() => {
    if (value === null) return;
    if (reduced) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, { type: "spring", stiffness: 60, damping: 18 });
    return () => controls.stop();
  }, [value, reduced, mv]);

  if (value === null) return <span>{formatValue(null, digits)}</span>;
  return <motion.span>{text}</motion.span>;
}
