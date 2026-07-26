/** Chart ticks that land on round clock boundaries — midnight, 3 AM, 6 AM —
 * never on "window start + n/5". A tick at 13:47 is noise; a tick at 3 PM is a
 * fact the reader already knows how to use.
 *
 * The step comes off a human ladder chosen against the width available, so a
 * narrow phone chart thins out (Sat · 6 AM · 12 PM · 6 PM) instead of crowding,
 * and a wide one fills in (Sat · 3 AM · 6 AM · 9 AM · 12 PM · 3 PM · 6 PM).
 */

const STEPS_H = [0.5, 1, 2, 3, 4, 6, 12, 24, 48, 168, 336, 720];
const PX_PER_TICK = 78;
/** Keep ticks off the frame edges, where the label would be clipped. */
const EDGE_MARGIN = 0.035;

export interface TimeAxis {
  /** Tick timestamps, unix seconds (the unit history uses). */
  ticks: number[];
  /** The chosen step in hours — decides the label format. */
  step: number;
}

export function timeAxis(t0: number, t1: number, hours: number, width: number): TimeAxis {
  const desired = Math.max(3, Math.min(9, Math.round(width / PX_PER_TICK)));
  const step = STEPS_H.find((s) => hours / s <= desired) ?? STEPS_H[STEPS_H.length - 1];

  const ticks: number[] = [];
  const margin = (t1 - t0) * EDGE_MARGIN;
  const anchor = new Date(t0 * 1000);
  anchor.setHours(0, 0, 0, 0); // local midnight at or before the window start

  if (step < 24) {
    const stepS = step * 3600;
    for (let t = anchor.getTime() / 1000; t <= t1; t += stepS) {
      if (t >= t0 + margin && t <= t1 - margin) ticks.push(t);
    }
  } else {
    // Day-and-up steps advance via Date so ticks stay on local midnight across
    // DST shifts — adding 86400s would drift an hour twice a year.
    const stepDays = step / 24;
    while (anchor.getTime() / 1000 <= t1) {
      const t = anchor.getTime() / 1000;
      if (t >= t0 + margin && t <= t1 - margin) ticks.push(t);
      anchor.setDate(anchor.getDate() + stepDays);
    }
  }
  return { ticks, step };
}

export const isMidnight = (ts: number) => {
  const d = new Date(ts * 1000);
  return d.getHours() === 0 && d.getMinutes() === 0;
};

/** Label for one tick, given the chosen step.
 *   step < 1h  -> "9:30 PM"
 *   step < 24h -> "3 AM", except midnight, which names the day ("Sat")
 *   1–7 days   -> "Sat"
 *   >= 7 days  -> "Jul 18"
 */
export function axisLabel(ts: number, step: number): string {
  const d = new Date(ts * 1000);
  if (step >= 168) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (step >= 24) return d.toLocaleDateString("en-US", { weekday: "short" });
  if (isMidnight(ts)) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleTimeString(
    "en-US",
    step < 1 ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" },
  );
}
