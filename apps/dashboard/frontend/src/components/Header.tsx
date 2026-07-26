import { Settings as SettingsIcon } from "lucide-react";

import { formatValue } from "../lib/format";
import { displayTemp, scaleOf, tempUnit } from "../lib/scale";
import { useStore } from "../store";
import { aqiColor } from "./OutdoorCard";
import { LiveDot } from "./LiveDot";

const today = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/**
 * The per-view header. On desktop it carries the kicker/title pair plus two
 * chrome pills (outdoor summary, date); on mobile it collapses to the title,
 * the live dot and the settings gear, since the rail is not there to hold them.
 */
export function Header({ kicker, title }: { kicker: string; title: string }) {
  const { outdoor, settings, connected, openSettings } = useStore();
  const scale = scaleOf(settings);

  return (
    <header className="flex items-end justify-between gap-6">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[.1em] text-muted max-lg:hidden">
          {kicker}
        </div>
        <h1 className="mt-1 font-semibold leading-[1.05] tracking-[-.022em] text-ink max-lg:mt-0 max-lg:text-[27px] max-lg:tracking-[-.025em] lg:text-[30px]">
          {title}
        </h1>
        <div className="mt-[5px] text-[12.5px] text-muted lg:hidden">{today()}</div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="lg:hidden">
          <LiveDot connected={connected} />
        </div>
        {outdoor && (
          <span className="glass-chrome inline-flex items-center gap-[9px] rounded-full p-[8px_15px] text-[12.5px] text-ink-2 max-lg:hidden">
            <span className="text-muted">Outside</span>
            {outdoor.temp !== null && (
              <span className="tnum font-semibold">
                {formatValue(displayTemp(outdoor.temp, scale), 0)}
                {tempUnit(scale)}
              </span>
            )}
            {outdoor.humidity !== null && (
              <>
                <span aria-hidden className="h-3 w-px bg-hairline" />
                <span className="tnum">{formatValue(outdoor.humidity, 0)}%</span>
              </>
            )}
            {outdoor.aqi !== null && (
              <>
                <span aria-hidden className="h-3 w-px bg-hairline" />
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] rounded-full"
                    style={{ background: aqiColor(outdoor.aqi) }}
                  />
                  AQI {formatValue(outdoor.aqi, 0)}
                </span>
              </>
            )}
          </span>
        )}
        <span className="tnum glass-chrome rounded-full p-[8px_15px] text-[12.5px] text-muted max-lg:hidden">
          {today()}
        </span>
        <button
          onClick={() => openSettings()}
          aria-label="Settings"
          className="glass-chrome flex h-[34px] w-[34px] items-center justify-center rounded-full text-ink-2 lg:hidden"
        >
          <SettingsIcon size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
