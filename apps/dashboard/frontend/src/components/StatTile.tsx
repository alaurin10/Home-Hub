import { NumberTicker } from "./NumberTicker";

/** Stat tile: label / value / optional note. Value in semibold sans,
 * proportional figures (tabular is reserved for columns). */
export function StatTile({
  label,
  value,
  unit,
  digits = 1,
  note,
}: {
  label: string;
  value: number | null;
  unit: string;
  digits?: number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">
        <NumberTicker value={value} digits={digits} />
        <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
      </div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}
