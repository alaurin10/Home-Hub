import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { formatValue } from "../lib/format";

/** Spring-animated numeric display: eases to each new live value. */
export function NumberTicker({ value, digits = 0 }: { value: number | null; digits?: number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value ?? 0);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (value === null) {
      setDisplay(null);
      return;
    }
    if (reduced) {
      setDisplay(value);
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      type: "spring",
      stiffness: 60,
      damping: 18,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, reduced, mv]);

  return <motion.span>{formatValue(display, digits)}</motion.span>;
}
