import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";

/** Floating glass pill tab bar (iOS 26 style) on phones; hidden on >=md.
 * The active pill slides between tabs with a spring. */
export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center md:hidden">
      <div className="glass-chrome flex w-64 rounded-full px-1.5 py-1.5">
        {[
          { to: "/", label: "Home", icon: "⌂" },
          { to: "/system", label: "System", icon: "◎" },
        ].map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="relative flex-1 rounded-full">
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="tabbar-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-ink"
                  />
                )}
                <span
                  className={`relative flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors duration-200 ${
                    isActive ? "text-surface" : "text-muted"
                  }`}
                >
                  <span aria-hidden className="text-base leading-none">
                    {tab.icon}
                  </span>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
