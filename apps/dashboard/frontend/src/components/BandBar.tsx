import { STATUS_COLOR, type Status } from "../lib/thresholds";

const FLOOR = 400; // outdoor CO₂ baseline — no indoor room reads lower
const CEILING = 2000;

/**
 * CO₂ as a banded bar, replacing the dial that used to be crammed into the
 * room card's footer beside humidity and two chips.
 *
 * A bar can carry what the dial could not: where the reading sits on an
 * absolute scale, where the config's thresholds fall (the ticks), and how far
 * the next band is — all readable at card size without a legend.
 */
export function BandBar({
  value,
  bounds,
  status,
  height = 8,
  showScale = true,
}: {
  value: number | null;
  /** Threshold bounds from config, e.g. [800, 1200, 2000]. Only the ones inside
   * the plotted span get a tick. */
  bounds: number[];
  status: Status | null;
  height?: number;
  showScale?: boolean;
}) {
  const pct = (v: number) => ((v - FLOOR) / (CEILING - FLOOR)) * 100;
  const fill = value === null ? 0 : Math.max(3, Math.min(100, pct(value)));
  const ticks = bounds.filter((b) => b > FLOOR && b < CEILING);

  return (
    <div>
      <div
        className="relative rounded-full bg-surface-2"
        style={{ height }}
        role="img"
        aria-label={value === null ? "No CO₂ reading" : `CO₂ ${value} ppm`}
      >
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full transition-[width] duration-500"
          style={{
            width: `${fill}%`,
            background: status ? STATUS_COLOR[status] : "var(--muted)",
          }}
        />
        {ticks.map((b) => (
          <span
            key={b}
            aria-hidden
            className="absolute rounded-sm bg-baseline"
            style={{ top: -3, bottom: -3, width: 1.5, left: `${pct(b)}%` }}
          />
        ))}
      </div>
      {showScale && (
        <div className="tnum mt-[7px] flex justify-between text-[11px] text-muted">
          <span>400</span>
          <span>800</span>
          <span>1,200</span>
          <span>2,000</span>
        </div>
      )}
    </div>
  );
}
