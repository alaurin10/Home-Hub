/** Explicit chart ticks on round local clock boundaries — Recharts' default
 * numeric ticks land on arbitrary timestamps like 13:47. Steps are chosen so
 * every range shows ~6–8 ticks. */
export function timeTicks(t0: number, t1: number, hours: number): number[] {
  const stepHours =
    hours <= 3 ? 0.5 : hours <= 24 ? 3 : hours <= 48 ? 6 : hours <= 168 ? 24 : hours <= 720 ? 120 : 336;

  const ticks: number[] = [];
  const anchor = new Date(t0 * 1000);
  anchor.setHours(0, 0, 0, 0); // local midnight at or before t0

  if (stepHours < 24) {
    const stepS = stepHours * 3600;
    let t = anchor.getTime() / 1000;
    while (t < t0) t += stepS;
    for (; t <= t1; t += stepS) ticks.push(t);
  } else {
    // Day-and-up steps advance via Date so ticks stay on local midnight
    // across DST shifts.
    const stepDays = stepHours / 24;
    if (anchor.getTime() / 1000 < t0) anchor.setDate(anchor.getDate() + 1);
    while (anchor.getTime() / 1000 <= t1) {
      ticks.push(anchor.getTime() / 1000);
      anchor.setDate(anchor.getDate() + stepDays);
    }
  }
  return ticks;
}
