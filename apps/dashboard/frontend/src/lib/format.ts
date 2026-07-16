export function formatValue(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function humanDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeOfDay(date: Date): string {
  // "6 AM" on the hour, "6:30 PM" otherwise — minutes only when they matter.
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    ...(date.getMinutes() !== 0 ? { minute: "2-digit" } : {}),
  });
}

/** Axis tick label. Once the window crosses midnight the day must be
 * readable: a 48h axis of bare clock times repeats and turns ambiguous. */
export function tickLabel(ts: number, hours: number): string {
  const date = new Date(ts * 1000);
  if (hours > 48) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (hours > 24 && date.getHours() === 0 && date.getMinutes() === 0) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return timeOfDay(date);
}

/** Tooltip header: always full day context, plus the stats bucket size. */
export function tooltipLabel(ts: number, kind: "raw" | "stats"): string {
  const date = new Date(ts * 1000);
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (kind === "stats") {
    const hour = date.toLocaleTimeString("en-US", { hour: "numeric" });
    return `${day} · ${hour} (hourly)`;
  }
  return `${day} · ${timeOfDay(date)}`;
}
