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

export function clockLabel(ts: number, hours: number): string {
  const date = new Date(ts * 1000);
  if (hours <= 48) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
