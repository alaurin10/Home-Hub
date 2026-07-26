/** The six chart windows, shared by every view through the store's rangeIdx.
 *
 * The split at index 3 is not cosmetic: at or under 48h the backend returns raw
 * samples, beyond it hourly mean/min/max from long-term statistics. The range
 * control draws a hairline there because the data genuinely changes character.
 *
 * Raw ranges carry a point budget sized to the window so bucket width stays
 * useful (48h at 288 points was 10-minute buckets; 576 halves that). Stats
 * ranges are hourly server-side, so points is unused.
 */
export interface Range {
  label: string;
  long: string;
  hours: number;
  points?: number;
}

export const RANGES: Range[] = [
  { label: "3h", long: "Last 3 hours", hours: 3, points: 240 },
  { label: "24h", long: "Last 24 hours", hours: 24, points: 288 },
  { label: "48h", long: "Last 48 hours", hours: 48, points: 576 },
  { label: "7d", long: "Last 7 days", hours: 24 * 7 },
  { label: "30d", long: "Last 30 days", hours: 24 * 30 },
  { label: "90d", long: "Last 90 days", hours: 24 * 90 },
];

/** Index of the first aggregated range — where the divider goes. */
export const RAW_RANGE_COUNT = 3;

export const isRaw = (range: Range) => range.hours <= 48;

/** "Fri 11 AM → now · raw samples" */
export function rangeCaption(range: Range): string {
  const then = new Date(Date.now() - range.hours * 3600 * 1000);
  const options: Intl.DateTimeFormatOptions = isRaw(range)
    ? { weekday: "short", hour: "numeric" }
    : { month: "short", day: "numeric" };
  return `${then.toLocaleDateString("en-US", options)} → now · ${
    isRaw(range) ? "raw samples" : "hourly mean"
  }`;
}
