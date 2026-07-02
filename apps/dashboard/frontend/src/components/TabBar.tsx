import { NavLink } from "react-router-dom";

/** Bottom navigation on phones; hidden on >=md where the header nav shows. */
export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md">
        {[
          { to: "/", label: "Home", icon: "⌂" },
          { to: "/system", label: "System", icon: "◎" },
        ].map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                isActive ? "text-ink" : "text-muted"
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
