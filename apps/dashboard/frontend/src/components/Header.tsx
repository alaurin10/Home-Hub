import { motion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";

import { useStore } from "../store";
import { LiveDot } from "./LiveDot";

const TABS = [
  { to: "/", label: "Home" },
  { to: "/system", label: "System" },
];

const pillSpring = { type: "spring" as const, stiffness: 420, damping: 34 };

export function Header() {
  const { config, connected, editMode, setEditMode } = useStore();
  const location = useLocation();
  const onHome = location.pathname === "/";

  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 pb-2 pt-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {config?.house_name ?? "Home"}
        </h1>
        <span className="hidden text-sm text-muted sm:inline">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="glass-chrome rounded-full px-3 py-1.5">
          <LiveDot connected={connected} />
        </span>
        <nav className="glass-chrome hidden items-center gap-1 rounded-full p-1 md:flex">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="relative rounded-full px-3.5 py-1.5 text-sm font-medium">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="header-nav-pill"
                      transition={pillSpring}
                      className="absolute inset-0 rounded-full bg-ink"
                    />
                  )}
                  <span
                    className={`relative transition-colors duration-200 ${
                      isActive ? "text-surface" : "text-muted hover:text-ink-2"
                    }`}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {onHome && (
          <button
            onClick={() => setEditMode(!editMode)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              editMode ? "bg-ink text-surface" : "glass-chrome text-ink-2 hover:text-ink"
            }`}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        )}
      </div>
    </header>
  );
}
