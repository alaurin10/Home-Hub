import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { AppConfig, HistoryPoint, RoomSnapshot } from "../api/types";
import { statusFor, roomStatus, STATUS_COLOR, type Status } from "../lib/thresholds";
import { NumberTicker } from "./NumberTicker";
import { RotatingSparkline } from "./charts/RotatingSparkline";
import { StatusChip } from "./StatusChip";

// Warm the lazy RoomView chunk on first hover/focus so the route switch
// never waits on the network (AnimatePresence mode="wait" would show a gap).
let roomViewPreloaded = false;
function preloadRoomView() {
  if (roomViewPreloaded) return;
  roomViewPreloaded = true;
  void import("../views/RoomView");
}

// minSpan per metric keeps a flat night from rendering as noise (see Sparkline).
const SPARK_SLOTS: { metric: string; label: string; minSpan: number }[] = [
  { metric: "temperature", label: "Temperature", minSpan: 2 },
  { metric: "humidity", label: "Humidity", minSpan: 4 },
  { metric: "co2", label: "CO₂", minSpan: 80 },
];

/** Caption under a reading: status dot + label (never color alone). */
function MetricCaption({ status, children }: { status: Status | null; children: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
      {status && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      )}
      {children}
    </div>
  );
}

export function RoomCard({
  room,
  config,
  size,
  editMode,
  history,
  onToggleSize,
}: {
  room: RoomSnapshot;
  config: AppConfig;
  size: "regular" | "wide";
  editMode: boolean;
  history: Record<string, HistoryPoint[]> | null;
  onToggleSize: () => void;
}) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.id,
    disabled: !editMode,
  });

  const roomCfg = config.rooms.find((r) => r.id === room.id)!;
  const status = roomStatus(config, room);
  const co2 = room.metrics.co2;
  const temp = room.metrics.temperature;
  const rh = room.metrics.humidity;
  const co2Status = statusFor(config, "co2", co2?.value ?? null);

  const open = () => !editMode && navigate(`/room/${room.id}`);
  const slots = SPARK_SLOTS.map((s) => ({
    ...s,
    points: history?.[roomCfg.entities[s.metric]] ?? null,
  }));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`h-full ${isDragging ? "relative z-10 opacity-90" : ""}`}
      // Sortable ARIA only applies while reordering is possible; outside edit
      // mode it would mark every card aria-disabled (they're clickable links).
      {...(editMode ? attributes : {})}
    >
      <motion.article
        onClick={open}
        onKeyDown={(e) => {
          if (editMode || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault(); // Space must not scroll the page
          open();
        }}
        {...(editMode ? {} : { role: "button", tabIndex: 0, "aria-label": `${room.name} details` })}
        onPointerEnter={preloadRoomView}
        onFocus={preloadRoomView}
        whileHover={editMode ? undefined : { y: -3, scale: 1.005 }}
        whileTap={editMode ? undefined : { scale: 0.985 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className={`glass relative h-full cursor-pointer rounded-3xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-2)] ${
          editMode ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        {...(editMode ? listeners : {})}
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{room.name}</h2>
            {!room.node.online && (
              <span className="text-xs font-medium" style={{ color: "var(--status-bad)" }}>
                <span aria-hidden>⚠ </span>offline
              </span>
            )}
          </div>
          {editMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSize();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="glass-chrome rounded-full px-2.5 py-1 text-xs font-medium text-ink-2"
            >
              {size === "wide" ? "⇥ Regular" : "⇤ Wide"}
            </button>
          ) : (
            <StatusChip status={status} />
          )}
        </header>

        {/* Comfort first: temperature leads; humidity and CO₂ ride beside it. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <div className="text-[40px] font-semibold leading-none tracking-tight text-ink">
              <NumberTicker value={temp?.value ?? null} digits={1} />
              <span className="ml-0.5 text-lg font-medium text-muted">°F</span>
            </div>
            <MetricCaption status={statusFor(config, "temperature", temp?.value ?? null)}>
              Temperature
            </MetricCaption>
          </div>
          <div>
            <div className="text-[26px] font-semibold leading-none tracking-tight text-ink-2">
              <NumberTicker value={rh?.value ?? null} digits={0} />
              <span className="ml-0.5 text-sm font-medium text-muted">%</span>
            </div>
            <MetricCaption status={statusFor(config, "humidity", rh?.value ?? null)}>
              Humidity
            </MetricCaption>
          </div>
          <div>
            <div className="text-[26px] font-semibold leading-none tracking-tight text-ink-2">
              <NumberTicker value={co2?.value ?? null} />
              <span className="ml-0.5 text-sm font-medium text-muted">ppm</span>
            </div>
            <MetricCaption status={co2Status}>
              CO₂
              {co2Status && co2Status !== "good" && <span className="text-ink-2"> · ventilate</span>}
            </MetricCaption>
          </div>
        </div>

        {/* The freed footer space hosts the trend: one sparkline rotating
            through the metrics above (label crossfades with its curve). */}
        <div className="mt-4">
          <RotatingSparkline slots={slots} height={size === "wide" ? 40 : 28} stretch />
        </div>

        <AirChips room={room} config={config} />
      </motion.article>
    </div>
  );
}

/** PM2.5/VOC status chips for sensor-rich rooms; rooms without the sensors
 * render nothing — not even the footer hairline. */
function AirChips({ room, config }: { room: RoomSnapshot; config: AppConfig }) {
  const chips = (
    [
      ["pm2_5", "PM2.5", room.metrics.pm2_5, 0],
      ["voc", "VOC", room.metrics.voc, 0],
    ] as const
  ).filter(([, , mv]) => mv !== undefined);
  if (!chips.length) return null;

  return (
    <footer className="mt-4 flex items-center gap-4 border-t border-hairline pt-3 text-xs text-ink-2">
      {chips.map(([metric, label, mv, digits]) => {
        const s: Status = statusFor(config, metric, mv!.value) ?? "good";
        return (
          <span key={metric} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
            {label} <NumberTicker value={mv!.value} digits={digits} />
          </span>
        );
      })}
    </footer>
  );
}
