import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import type { AppConfig, RoomSnapshot } from "../api/types";
import { roomStatus, statusFor } from "../lib/thresholds";
import { NumberTicker } from "./NumberTicker";
import { Sparkline } from "./charts/Sparkline";
import { StatusChip } from "./StatusChip";

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

  const status = roomStatus(config, room);
  const co2 = room.metrics.co2;
  const temp = room.metrics.temperature;
  const rh = room.metrics.humidity;
  const pm25 = room.metrics.pm2_5;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`h-full ${isDragging ? "relative z-10 opacity-90" : ""}`}
      {...attributes}
    >
      <motion.article
        layoutId={`room-${room.id}`}
        onClick={() => !editMode && navigate(`/room/${room.id}`)}
        whileHover={editMode ? undefined : { y: -2 }}
        whileTap={editMode ? undefined : { scale: 0.99 }}
        className={`relative h-full cursor-pointer rounded-3xl border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
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
              className="rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2"
            >
              {size === "wide" ? "⇥ Regular" : "⇤ Wide"}
            </button>
          ) : (
            <StatusChip status={status} />
          )}
        </header>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[42px] font-semibold leading-none tracking-tight text-ink">
              <NumberTicker value={co2?.value ?? null} />
            </div>
            <div className="mt-1.5 text-xs text-muted">
              CO₂ ppm
              {co2 && statusFor(config, "co2", co2.value) !== "good" && co2.value !== null && (
                <span className="ml-1 text-ink-2">· ventilate</span>
              )}
            </div>
          </div>
          <Sparkline entity={config.rooms.find((r) => r.id === room.id)!.entities.co2} minSpan={250} />
        </div>

        <footer className="mt-4 flex items-center gap-4 border-t border-hairline pt-3 text-sm text-ink-2">
          <span>
            <NumberTicker value={temp?.value ?? null} digits={1} />
            <span className="text-muted"> °C</span>
          </span>
          <span>
            <NumberTicker value={rh?.value ?? null} digits={0} />
            <span className="text-muted"> %</span>
          </span>
          {pm25 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: `var(--status-${
                    { good: "good", fair: "fair", poor: "poor", bad: "bad" }[
                      statusFor(config, "pm2_5", pm25.value) ?? "good"
                    ]
                  })`,
                }}
              />
              PM2.5 <NumberTicker value={pm25.value} digits={0} />
            </span>
          )}
        </footer>
      </motion.article>
    </div>
  );
}
