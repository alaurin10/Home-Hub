import { Columns2, House, Radio, Settings as SettingsIcon } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { formatValue } from "../lib/format";
import { displayTemp, scaleOf } from "../lib/scale";
import { SCORE_BAND_COLOR } from "../lib/thresholds";
import { useStore } from "../store";
import { LiveDot } from "./LiveDot";

const NAV = [
  { to: "/", label: "Home", Icon: House },
  { to: "/compare", label: "Compare", Icon: Columns2 },
  { to: "/system", label: "System", Icon: Radio },
];

/**
 * The desktop rail (>=lg). Persistent because the room list is the app's real
 * index: on a 1920px screen there is room to keep every room one click away
 * instead of making the reader go home first.
 */
export function Rail() {
  const { config, rooms, settings, connected, openSettings } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const scale = scaleOf(settings);
  const nodeCount = config?.rooms.length ?? 0;

  return (
    <aside
      className="flex h-full w-[236px] flex-none flex-col border-r border-hairline p-[28px_20px]"
      style={{
        boxSizing: "border-box",
        background: "color-mix(in srgb, var(--surface) 34%, transparent)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
      }}
    >
      <div className="flex items-center gap-[11px] p-[0_8px_26px]">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-ink text-sm font-semibold text-surface">
          H
        </span>
        <div className="leading-[1.25]">
          <div className="text-sm font-semibold tracking-[-.01em] text-ink">
            {config?.house_name ?? "Home Hub"}
          </div>
          <div className="text-[11px] text-muted">
            {nodeCount} node{nodeCount === 1 ? "" : "s"}
            {config?.mode === "demo" ? " · demo" : ""}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-[3px]">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex w-full items-center gap-[11px] rounded-[11px] p-[10px_12px] text-sm font-medium ${
                // Room detail is a child of Home, so the rail keeps Home lit
                // rather than showing nothing selected.
                isActive || (to === "/" && location.pathname.startsWith("/room/"))
                  ? "bg-ink text-surface"
                  : "text-muted hover:text-ink-2"
              }`
            }
          >
            <span className="flex w-[18px] justify-center">
              <Icon size={18} strokeWidth={2} />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-[26px] p-[0_12px_10px] text-[10.5px] font-semibold uppercase tracking-[.09em] text-muted">
        Rooms
      </div>
      <div className="flex flex-col gap-0.5">
        {rooms?.rooms.map((room) => {
          const open = location.pathname === `/room/${room.id}`;
          const temp = room.metrics.temperature?.value ?? null;
          const color = room.score
            ? (SCORE_BAND_COLOR[room.score.band] ?? "var(--muted)")
            : "var(--status-bad)";
          return (
            <button
              key={room.id}
              onClick={() => navigate(`/room/${room.id}`)}
              className={`flex w-full items-center gap-2.5 rounded-[11px] p-[9px_12px] text-left text-[13.5px] text-ink-2 hover:bg-surface-2 ${
                open ? "bg-surface-2" : ""
              }`}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{ background: color }}
              />
              <span className="flex-1 truncate">{room.name}</span>
              <span className="tnum text-[12.5px] text-muted">
                {temp === null ? "–" : `${formatValue(displayTemp(temp, scale), 0)}°`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-hairline p-[14px_12px_0]">
        <LiveDot connected={connected} />
        <button
          onClick={() => openSettings()}
          className="flex items-center gap-1.5 p-[2px_4px] text-[13px] text-muted hover:text-ink-2"
        >
          <SettingsIcon size={14} strokeWidth={2} />
          Settings
        </button>
      </div>
    </aside>
  );
}
