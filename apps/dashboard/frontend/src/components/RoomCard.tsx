import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import type { AppConfig, RoomSnapshot } from "../api/types";
import { statusFor, roomStatus, STATUS_COLOR, type Status } from "../lib/thresholds";
import { Gauge } from "./Gauge";
import { NumberTicker } from "./NumberTicker";
import { Sparkline } from "./charts/Sparkline";
import { StatusChip } from "./StatusChip";

// Warm the lazy RoomView chunk on first hover/focus so the route switch
// never waits on the network (AnimatePresence mode="wait" would show a gap).
let roomViewPreloaded = false;
function preloadRoomView() {
  if (roomViewPreloaded) return;
  roomViewPreloaded = true;
  void import("../views/RoomView");
}

export function RoomCard({
  room,
  config,
  size,
  editMode,
  onToggleSize,
}: {
  room: RoomSnapshot;
  config: AppConfig;
  size: "regular" | "wide";
  editMode: boolean;
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
        onClick={() => !editMode && navigate(`/room/${room.id}`)}
        onPointerEnter={preloadRoomView}
        onFocus={preloadRoomView}
        whileHover={editMode ? undefined : { y: -3, scale: 1.005 }}
        whileTap={editMode ? undefined : { scale: 0.985 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className={`glass relative h-full cursor-pointer rounded-3xl p-5 ${
          editMode ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        {...(editMode ? listeners : {})}
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{room.name}</h2>
            {!room.node.online && (
              <span className="text-xs font-medium" style={{ color: "var(--status-bad)" }}>
                ⚠ offline
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

        {/* Comfort first: temperature leads, humidity rides beside it. */}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="flex items-end gap-5">
            <div>
              <div className="text-[40px] font-semibold leading-none tracking-tight text-ink">
                <NumberTicker value={temp?.value ?? null} digits={1} />
                <span className="ml-0.5 text-lg font-medium text-muted">°F</span>
              </div>
              <div className="mt-1.5 text-xs text-muted">Temperature</div>
            </div>
            <div>
              <div className="text-[26px] font-semibold leading-none tracking-tight text-ink-2">
                <NumberTicker value={rh?.value ?? null} digits={0} />
                <span className="ml-0.5 text-sm font-medium text-muted">%</span>
              </div>
              <div className="mt-1.5 text-xs text-muted">Humidity</div>
            </div>
          </div>
          <Sparkline
            entity={roomCfg.entities.temperature}
            minSpan={2}
            width={size === "wide" ? 420 : 120}
            height={size === "wide" ? 40 : 28}
          />
        </div>

        <footer className="mt-4 flex items-center gap-3 border-t border-hairline pt-3">
          <Gauge
            value={co2?.value ?? null}
            bounds={config.thresholds.co2.bounds}
            size={56}
            status={co2Status}
          >
            <span className="text-[13px] font-semibold leading-none text-ink">
              <NumberTicker value={co2?.value ?? null} />
            </span>
          </Gauge>
          <div className="text-xs leading-tight">
            <div className="font-medium text-ink-2">CO₂</div>
            <div className="text-muted">
              ppm
              {co2 && co2Status !== "good" && co2.value !== null && (
                <span className="text-ink-2"> · ventilate</span>
              )}
            </div>
          </div>
          <AirChips room={room} config={config} />
        </footer>
      </motion.article>
    </div>
  );
}

/** PM2.5/VOC status chips for sensor-rich rooms; rooms without the sensors
 * render nothing (the footer stays a clean gauge-only row, not a gap). */
function AirChips({ room, config }: { room: RoomSnapshot; config: AppConfig }) {
  const chips = (
    [
      ["pm2_5", "PM2.5", room.metrics.pm2_5, 0],
      ["voc", "VOC", room.metrics.voc, 0],
    ] as const
  ).filter(([, , mv]) => mv !== undefined);
  if (!chips.length) return null;

  return (
    <span className="ml-auto flex flex-col items-end gap-1.5 text-xs text-ink-2 sm:flex-row sm:items-center sm:gap-4">
      {chips.map(([metric, label, mv, digits]) => {
        const s: Status = statusFor(config, metric, mv!.value) ?? "good";
        return (
          <span key={metric} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
            {label} <NumberTicker value={mv!.value} digits={digits} />
          </span>
        );
      })}
    </span>
  );
}
