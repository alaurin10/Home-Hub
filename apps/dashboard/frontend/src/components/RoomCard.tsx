import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import type { AppConfig, HistoryPoint, RoomSnapshot } from "../api/types";
import { formatValue, signedDelta } from "../lib/format";
import { displayTemp, tempUnit, type Scale } from "../lib/scale";
import {
  METRIC_LABEL,
  SCORE_BAND_LABEL,
  statusFor,
  STATUS_COLOR,
  tint,
  type Status,
} from "../lib/thresholds";
import { BandBar } from "./BandBar";
import { NumberTicker } from "./NumberTicker";
import { ScoreArc } from "./ScoreArc";
import { Sparkline } from "./charts/Sparkline";

// Warm the lazy RoomView chunk on first hover/focus so the route switch never
// waits on the network (AnimatePresence mode="wait" would show a gap).
let roomViewPreloaded = false;
function preloadRoomView() {
  if (roomViewPreloaded) return;
  roomViewPreloaded = true;
  void import("../views/RoomView");
}

// minSpan per metric keeps a flat night from rendering as noise (see Sparkline).
const TRENDS: { metric: string; label: string; minSpan: number; digits: number }[] = [
  { metric: "temperature", label: "Temp", minSpan: 2, digits: 1 },
  { metric: "humidity", label: "Humidity", minSpan: 4, digits: 0 },
  { metric: "co2", label: "CO₂", minSpan: 80, digits: 0 },
];

function firstLast(points: HistoryPoint[] | null | undefined): [number, number] | null {
  const usable = points?.filter((p) => typeof (p.v ?? p.mean) === "number");
  if (!usable || usable.length < 2) return null;
  const value = (p: HistoryPoint) => (p.v ?? p.mean) as number;
  return [value(usable[0]), value(usable[usable.length - 1])];
}

/**
 * A room, at a glance.
 *
 * The readings stack vertically instead of sharing one cramped footer row:
 * temperature and humidity lead, CO₂ becomes a banded bar with its thresholds
 * marked, and all three trends show at once rather than rotating on an
 * eight-second timer — a card you glance at should not make you wait to see
 * the metric you came for.
 */
export function RoomCard({
  room,
  config,
  history,
  scale,
  compact = false,
}: {
  room: RoomSnapshot;
  config: AppConfig;
  history: Record<string, HistoryPoint[]> | null;
  scale: Scale;
  /** Mobile: a shorter card, single sparkline, no chips. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const roomCfg = config.rooms.find((r) => r.id === room.id)!;
  const co2 = room.metrics.co2?.value ?? null;
  const temp = room.metrics.temperature?.value ?? null;
  const rh = room.metrics.humidity?.value ?? null;
  const co2Status = statusFor(config, "co2", co2);
  const score = room.score;
  const offline = !room.node.online;

  const open = () => navigate(`/room/${room.id}`);
  const sensorNote = Object.keys(roomCfg.entities).length > 5 ? "full sensor set" : "comfort + CO₂";

  return (
    <motion.article
      onClick={open}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // Space must not scroll the page
        open();
      }}
      role="button"
      tabIndex={0}
      aria-label={`${room.name} details`}
      onPointerEnter={preloadRoomView}
      onFocus={preloadRoomView}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={`glass relative h-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-2)] ${
        compact ? "rounded-[24px] p-[18px_20px]" : "rounded-[26px] p-[24px_26px_22px]"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`font-semibold tracking-[-.01em] text-ink ${compact ? "text-base" : "text-[16.5px]"}`}>
            {room.name}
          </h2>
          <div className="mt-[5px] flex items-center gap-[7px] text-[12.5px] text-muted">
            {offline ? (
              <>
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ background: "var(--status-bad)" }}
                />
                Offline · last known readings
              </>
            ) : (
              <>
                {score && (
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] rounded-full"
                    style={{ background: STATUS_COLOR[bandStatus(score.band)] }}
                  />
                )}
                {score ? `${SCORE_BAND_LABEL[score.band]} · ${sensorNote}` : sensorNote}
              </>
            )}
          </div>
        </div>
        {/* No arc for an offline room: a stale score is worse than no score. */}
        {score && !compact && (
          <ScoreArc value={score.value} band={score.band} size={58} strokeWidth={5.5}>
            <span className="tnum text-[17px] font-semibold text-ink">{score.value}</span>
          </ScoreArc>
        )}
        {score && compact && (
          <span className="inline-flex items-baseline gap-[5px] text-[11.5px] text-muted">
            <span className="tnum text-[15px] font-semibold text-ink-2">{score.value}</span>
            score ›
          </span>
        )}
      </header>

      <div className={`flex items-end gap-[22px] ${compact ? "mt-3.5" : "mt-5"}`}>
        <div>
          <div
            className={`tnum font-semibold tracking-[-.035em] text-ink ${
              compact ? "text-[40px] leading-[.94]" : "text-[52px] leading-[.92]"
            }`}
          >
            <NumberTicker value={temp === null ? null : displayTemp(temp, scale)} digits={1} />
            <span
              className={`ml-0.5 font-medium text-muted ${compact ? "text-base" : "text-xl"}`}
            >
              {tempUnit(scale)}
            </span>
          </div>
          <div
            className={`mt-2 font-semibold uppercase tracking-[.07em] text-muted ${
              compact ? "text-[10.5px]" : "text-xs"
            }`}
          >
            {compact ? "Temp" : "Temperature"}
          </div>
        </div>
        <div className="pb-1">
          <div
            className={`tnum font-semibold leading-none tracking-[-.025em] text-ink-2 ${
              compact ? "text-[26px]" : "text-[30px]"
            }`}
          >
            <NumberTicker value={rh} digits={0} />
            <span className={`ml-px font-medium text-muted ${compact ? "text-xs" : "text-sm"}`}>%</span>
          </div>
          <div
            className={`mt-2 font-semibold uppercase tracking-[.07em] text-muted ${
              compact ? "text-[10.5px]" : "text-xs"
            }`}
          >
            Humidity
          </div>
        </div>
        {compact && (
          <div className="ml-auto w-[76px]">
            <Sparkline
              points={history?.[roomCfg.entities.temperature] ?? null}
              width={76}
              height={34}
              minSpan={2}
              color="var(--baseline)"
              stretch
            />
          </div>
        )}
      </div>

      <div className={compact ? "mt-4 border-t border-hairline pt-[13px]" : "mt-[22px]"}>
        <div className="flex items-baseline justify-between">
          <span
            className={`font-semibold uppercase tracking-[.07em] text-muted ${
              compact ? "text-[10.5px]" : "text-xs"
            }`}
          >
            CO₂
          </span>
          <span className={`text-muted ${compact ? "text-xs" : "text-sm"}`}>
            <span className={`tnum font-semibold text-ink ${compact ? "text-base" : "text-xl"}`}>
              <NumberTicker value={co2} digits={0} />
            </span>{" "}
            ppm
          </span>
        </div>
        <div className={compact ? "mt-2" : "mt-[9px]"}>
          <BandBar
            value={co2}
            bounds={config.thresholds.co2?.bounds ?? []}
            status={co2Status}
            height={compact ? 7 : 8}
            showScale={!compact}
          />
        </div>
      </div>

      {!compact && (
        <div className="mt-5 grid grid-cols-3 gap-3.5 border-t border-hairline pt-4">
          {TRENDS.map((trend) => {
            const points = history?.[roomCfg.entities[trend.metric]] ?? null;
            const ends = firstLast(points);
            const isTemp = trend.metric === "temperature";
            const raw = ends ? ends[1] - ends[0] : null;
            const delta =
              raw === null ? null : isTemp && scale === "C" ? (raw * 5) / 9 : raw;
            return (
              <div key={trend.metric}>
                <div className="flex items-baseline justify-between text-[11px] text-muted">
                  <span>{trend.label}</span>
                  <span className="tnum text-ink-2">
                    {delta === null ? "–" : signedDelta(delta, trend.digits)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Sparkline
                    points={points}
                    width={147}
                    height={30}
                    minSpan={trend.minSpan}
                    color={
                      trend.metric === "co2" && co2Status
                        ? STATUS_COLOR[co2Status]
                        : "var(--baseline)"
                    }
                    stretch
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!compact && <AirChips room={room} config={config} />}
    </motion.article>
  );
}

/** A score band maps onto the four status colors; "excellent" shares good's. */
function bandStatus(band: string): Status {
  return band === "excellent" ? "good" : (band as Status);
}

/** PM2.5/VOC chips for sensor-rich rooms; rooms without the sensors render
 * nothing rather than an empty row. */
function AirChips({ room, config }: { room: RoomSnapshot; config: AppConfig }) {
  const chips = (["pm2_5", "voc"] as const)
    .map((metric) => ({ metric, mv: room.metrics[metric] }))
    .filter((c) => c.mv !== undefined);
  if (!chips.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {chips.map(({ metric, mv }) => {
        const status: Status = statusFor(config, metric, mv.value) ?? "good";
        return (
          <span
            key={metric}
            className="inline-flex items-center gap-[7px] rounded-full px-[11px] py-[5px] text-xs font-medium text-ink-2"
            style={{ background: tint(STATUS_COLOR[status]) }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: STATUS_COLOR[status] }}
            />
            {METRIC_LABEL[metric]} {formatValue(mv.value, metric === "pm2_5" ? 1 : 0)}
          </span>
        );
      })}
    </div>
  );
}
