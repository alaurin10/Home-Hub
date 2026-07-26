import type { Outdoor } from "../api/types";
import { formatValue } from "../lib/format";
import { displayTemp, tempUnit, type Scale } from "../lib/scale";
import { STATUS_COLOR, tint } from "../lib/thresholds";
import { useStore } from "../store";

// AQI is a fixed public scale, not one of our configurable bands.
const AQI_GOOD = 50;
const AQI_MODERATE = 100;

export function aqiColor(aqi: number | null): string {
  if (aqi === null) return "var(--muted)";
  if (aqi < AQI_GOOD) return STATUS_COLOR.good;
  if (aqi < AQI_MODERATE) return STATUS_COLOR.fair;
  return STATUS_COLOR.poor;
}

const DELTA_COLORS = ["var(--series-1)", "var(--series-2)", "var(--status-good)"];

/**
 * Outdoor context — the half of "should I open a window" the sensors cannot
 * see. There is no outdoor node, so this comes from the nearest public weather
 * station for the location set in Settings, which the card names so the reader
 * knows how far away "outside" actually is.
 */
export function OutdoorCard({ outdoor, scale }: { outdoor: Outdoor | null; scale: Scale }) {
  const openSettings = useStore((s) => s.openSettings);

  if (!outdoor) return <SetLocationPrompt onOpen={() => openSettings("weather")} />;

  const advice = outdoor.ventilation;
  const adviceColor = advice?.recommended ? "var(--status-good)" : "var(--muted)";

  return (
    <section className="glass flex flex-col rounded-[26px] p-[24px_26px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted">
          Outdoor context
        </h2>
        {outdoor.station && <span className="text-xs text-muted">{outdoor.station}</span>}
      </div>
      <p className="mt-[7px] text-[11.5px] leading-[1.5] text-muted" style={{ textWrap: "pretty" }}>
        {outdoor.source}
      </p>

      <div className="mt-3.5 flex items-end gap-3.5">
        <span className="tnum text-[44px] font-semibold leading-none tracking-[-.03em] text-ink">
          {outdoor.temp === null ? "–" : formatValue(displayTemp(outdoor.temp, scale), 0)}
          <span className="text-[19px] font-medium text-muted">{tempUnit(scale)}</span>
        </span>
        <span className="text-[13.5px] leading-[1.4] text-ink-2">
          {outdoor.humidity !== null && (
            <>
              {formatValue(outdoor.humidity, 0)}% RH
              <br />
            </>
          )}
          {outdoor.wind !== null && `${formatValue(outdoor.wind, 0)} mph ${outdoor.wind_dir ?? ""}`}
        </span>
      </div>
      {(outdoor.sunrise || outdoor.sunset) && (
        <div className="tnum mt-2.5 text-xs text-muted">
          {outdoor.sunrise && `Sunrise ${outdoor.sunrise}`}
          {outdoor.sunrise && outdoor.sunset && " · "}
          {outdoor.sunset && `Sunset ${outdoor.sunset}`}
        </div>
      )}

      <div className="mt-[18px] flex flex-col gap-[11px]">
        {outdoor.deltas.map((delta, i) => (
          <div key={delta.label}>
            <div className="flex justify-between text-[12.5px] text-ink-2">
              <span>{delta.label}</span>
              <span className="tnum text-muted">{delta.text}</span>
            </div>
            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(delta.fraction * 100)}%`,
                  background: DELTA_COLORS[i % DELTA_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {advice && (
        <div className="mt-auto pt-[18px]">
          <div
            className="rounded-2xl p-[14px_16px]"
            style={{ background: tint(adviceColor, 11) }}
          >
            <div className="text-[12.5px] font-semibold text-ink">{advice.title}</div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-ink-2">{advice.body}</div>
          </div>
        </div>
      )}
    </section>
  );
}

/** The mobile strip: one chrome pill with the same three facts. */
export function OutdoorStrip({ outdoor, scale }: { outdoor: Outdoor | null; scale: Scale }) {
  const openSettings = useStore((s) => s.openSettings);
  if (!outdoor)
    return (
      <button
        onClick={() => openSettings("weather")}
        className="glass-chrome flex w-full items-center gap-2.5 rounded-2xl p-[12px_15px] text-left text-xs text-ink-2"
      >
        Set your location for outdoor context
        <span className="ml-auto text-muted">Settings ›</span>
      </button>
    );

  return (
    <button
      onClick={() => openSettings("weather")}
      className="glass-chrome flex w-full items-center gap-2.5 rounded-2xl p-[12px_15px] text-left"
    >
      <span className="tnum text-[13px] font-semibold text-ink">
        {outdoor.temp === null ? "–" : formatValue(displayTemp(outdoor.temp, scale), 0)}
        {tempUnit(scale)}
      </span>
      <span className="tnum text-[12.5px] text-muted">
        {outdoor.humidity !== null && `${formatValue(outdoor.humidity, 0)}%`}
        {outdoor.aqi !== null && ` · AQI ${formatValue(outdoor.aqi, 0)}`}
      </span>
      {outdoor.ventilation && (
        <span className="ml-auto text-right text-xs text-ink-2">{outdoor.ventilation.title}</span>
      )}
    </button>
  );
}

function SetLocationPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="glass flex flex-col rounded-[26px] p-[24px_26px]">
      <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted">
        Outdoor context
      </h2>
      <p className="mt-2 max-w-[44ch] text-[13px] leading-[1.6] text-ink-2" style={{ textWrap: "pretty" }}>
        There is no outdoor node in the fleet. Set a location and the dashboard reads the nearest
        public weather station and air-quality monitor — which is what tells you whether opening a
        window would actually help.
      </p>
      <button
        onClick={onOpen}
        className="mt-4 w-fit rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-surface"
      >
        Set location
      </button>
    </section>
  );
}
