import { NavLink } from "react-router-dom";

/** Floating glass pill tab bar (iOS 26 style) on phones; hidden on >=md. */
export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center md:hidden">
      <div className="glass-chrome flex w-64 rounded-full px-2 py-1">
        {[
          { to: "/", label: "Home", icon: "⌂" },
          { to: "/system", label: "System", icon: "◎" },
        ].map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `m-0.5 flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-xs font-medium transition-colors ${
                isActive ? "bg-ink text-surface" : "text-muted"
              }`
            }
          >
            <span aria-hidden className="text-base leading-none">
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
