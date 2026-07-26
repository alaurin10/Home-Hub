import type { AppConfig, RoomsResponse } from "../api/types";
import { formatValue } from "../lib/format";
import { displayTemp, tempUnit, type Scale } from "../lib/scale";
import { SCORE_BAND_COLOR, SCORE_BAND_LABEL, tint } from "../lib/thresholds";
import { ScoreArc } from "./ScoreArc";

/**
 * The hero: one number and one sentence answering "is the house OK, and if not
 * what do I do", before any per-room detail.
 *
 * Both the score and the advisory arrive from the API — deriving them here
 * would let three open dashboards disagree about the same house.
 */
export function HouseCard({
  rooms,
  config,
  scale,
  compact = false,
}: {
  rooms: RoomsResponse;
  config: AppConfig;
  scale: Scale;
  compact?: boolean;
}) {
  const { house } = rooms;
  const bandColor = SCORE_BAND_COLOR[house.band] ?? "var(--muted)";
  const stats = houseStats(rooms, config, scale);

  return (
    <section
      className={`glass ${compact ? "rounded-[24px] p-5" : "rounded-[26px] p-[28px_30px]"}`}
    >
      <div className={`flex items-center ${compact ? "gap-[18px]" : "gap-[30px]"}`}>
        <ScoreArc
          value={house.score}
          band={house.band}
          size={compact ? 104 : 152}
          strokeWidth={compact ? 7 : 9}
        >
          <span
            className={`tnum font-semibold leading-none tracking-[-.03em] text-ink ${
              compact ? "text-[33px]" : "text-[46px]"
            }`}
          >
            {house.score}
          </span>
          <span
            className={`font-semibold uppercase tracking-[.1em] text-muted ${
              compact ? "mt-0.5 text-[9px]" : "mt-0.5 text-[11px]"
            }`}
          >
            {compact ? "Score" : "Air score"}
          </span>
        </ScoreArc>

        <div className="min-w-0 flex-1">
          <div className={compact ? "" : "flex items-center gap-2.5"}>
            <h2
              className={`font-semibold tracking-[-.02em] text-ink ${
                compact ? "text-[19px]" : "text-[23px]"
              }`}
              style={{ textWrap: "pretty" }}
            >
              {house.headline}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-ink-2 ${
                compact ? "mt-[7px] px-2.5 py-1 text-[11.5px]" : "px-[11px] py-1 text-xs"
              }`}
              style={{ background: tint(bandColor) }}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: bandColor }}
              />
              {SCORE_BAND_LABEL[house.band]}
            </span>
          </div>
          {!compact && (
            <p
              className="mt-[9px] max-w-[52ch] text-[14.5px] leading-[1.55] text-ink-2"
              style={{ textWrap: "pretty" }}
            >
              {house.advisory}
            </p>
          )}
        </div>
      </div>

      {compact && (
        <p className="mt-4 text-[13.5px] leading-[1.55] text-ink-2" style={{ textWrap: "pretty" }}>
          {house.advisory}
        </p>
      )}

      <div
        className={`grid grid-cols-3 border-t border-hairline ${
          compact ? "mt-4 gap-2 pt-3.5" : "mt-5 gap-0.5 pt-4"
        }`}
      >
        {stats.map((stat) => (
          <div key={stat.label} className={compact ? "" : "pr-4"}>
            <div
              className={`font-semibold uppercase text-muted ${
                compact ? "text-[10px] tracking-[.08em]" : "text-[11px] tracking-[.07em]"
              }`}
            >
              {stat.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={`tnum font-semibold tracking-[-.02em] text-ink ${
                  compact ? "text-[21px]" : "text-[25px]"
                }`}
              >
                {stat.value}
              </span>
              <span className={`text-muted ${compact ? "text-[11px]" : "text-[13px]"}`}>
                {stat.unit}
              </span>
            </div>
            {!compact && <div className="mt-[3px] text-xs text-muted">{stat.note}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

interface Stat {
  label: string;
  value: string;
  unit: string;
  note: string;
}

/** Averages across the rooms that are actually reporting — an offline node
 * must not drag the house average toward its last-known reading. */
function houseStats(rooms: RoomsResponse, config: AppConfig, scale: Scale): Stat[] {
  const online = rooms.rooms.filter((r) => r.node.online);
  const values = (metric: string) =>
    online.map((r) => r.metrics[metric]?.value).filter((v): v is number => v !== null && v !== undefined);

  const temps = values("temperature");
  const humidities = values("humidity");
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const good = config.thresholds.temperature?.ranges?.good;
  const rhGood = config.thresholds.humidity?.ranges?.good;
  const inBand = (metric: string, band?: [number, number]) =>
    band ? values(metric).every((v) => v >= band[0] && v <= band[1]) : false;

  const co2s = online
    .map((r) => ({ name: r.name, value: r.metrics.co2?.value }))
    .filter((r): r is { name: string; value: number } => typeof r.value === "number");
  const highest = co2s.length ? co2s.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  const roomWord = online.length === 1 ? "room" : `all ${online.length} rooms`;

  return [
    {
      label: "Avg temp",
      value: temps.length ? formatValue(displayTemp(mean(temps), scale), 1) : "–",
      unit: tempUnit(scale),
      note: inBand("temperature", good) ? `${roomWord} in band` : "one room outside band",
    },
    {
      label: "Avg humidity",
      value: humidities.length ? formatValue(mean(humidities), 0) : "–",
      unit: "%",
      note: rhGood
        ? `target ${rhGood[0]}–${rhGood[1]}%${inBand("humidity", rhGood) ? "" : " · outside"}`
        : "—",
    },
    {
      label: "Highest CO₂",
      value: highest ? formatValue(highest.value, 0) : "–",
      unit: "ppm",
      note: highest ? highest.name : "no reading",
    },
  ];
}
