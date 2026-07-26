import { motion } from "framer-motion";
import { Columns2, House, Radio } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

const TABS = [
  { to: "/", label: "Home", Icon: House },
  { to: "/compare", label: "Compare", Icon: Columns2 },
  { to: "/system", label: "System", Icon: Radio },
];

/** Floating glass pill tab bar on phones; the rail replaces it at >=lg. */
export function TabBar() {
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-20 flex justify-center lg:hidden">
      <div className="glass-chrome flex w-[302px] gap-0.5 rounded-full p-1.5">
        {TABS.map(({ to, label, Icon }) => {
          // Room detail belongs to Home, so the Home tab stays lit inside it.
          const active =
            location.pathname === to || (to === "/" && location.pathname.startsWith("/room/"));
          return (
            <NavLink key={to} to={to} className="relative flex-1 rounded-full">
              {active && (
                <motion.span
                  layoutId="tabbar-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-ink"
                />
              )}
              <span
                className={`relative flex flex-col items-center gap-[3px] py-[9px] text-[11px] font-medium transition-colors duration-200 ${
                  active ? "text-surface" : "text-muted"
                }`}
              >
                <Icon size={15} strokeWidth={2} aria-hidden />
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
