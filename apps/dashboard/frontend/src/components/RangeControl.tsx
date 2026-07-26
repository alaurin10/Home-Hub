import { RANGES, RAW_RANGE_COUNT } from "../lib/ranges";
import { useStore } from "../store";

/**
 * The chart window picker: one grouped segmented control, replacing the
 * six-pill row.
 *
 * The hairline before "7d" is load-bearing, not decoration — that is where the
 * backend stops returning raw samples and starts returning hourly means, so
 * the two groups genuinely behave differently.
 *
 * On desktop the active option spells itself out ("Last 24 hours") while the
 * rest stay short; below lg all six stay short, because they only fit that way
 * — and because the spelled-out label's intrinsic width would otherwise set the
 * min-content width of whatever grid column the control sits in.
 */
export function RangeControl() {
  const rangeIdx = useStore((s) => s.rangeIdx);
  const setRangeIdx = useStore((s) => s.setRangeIdx);

  return (
    <div className="mb-1.5 mt-3.5 flex max-lg:mb-1 max-lg:mt-2.5">
      <div
        className="glass-chrome inline-flex items-center gap-0.5 rounded-full p-[3px]"
        role="group"
        aria-label="Chart range"
      >
        {RANGES.map((range, i) => {
          const active = i === rangeIdx;
          return (
            <span key={range.label} className="contents">
              {i === RAW_RANGE_COUNT && (
                <span aria-hidden className="mx-[5px] my-[5px] w-px flex-none self-stretch bg-hairline" />
              )}
              <button
                type="button"
                onClick={() => setRangeIdx(i)}
                aria-pressed={active}
                aria-label={range.long}
                className={`tnum whitespace-nowrap rounded-full px-[13px] py-[7px] text-[12.5px] transition-colors duration-[180ms] max-lg:px-[11px] max-lg:text-[11.5px] ${
                  active ? "bg-ink font-semibold text-surface" : "font-medium text-muted hover:text-ink-2"
                }`}
              >
                {active ? (
                  <>
                    <span className="max-lg:hidden">{range.long}</span>
                    <span className="lg:hidden">{range.label}</span>
                  </>
                ) : (
                  range.label
                )}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
