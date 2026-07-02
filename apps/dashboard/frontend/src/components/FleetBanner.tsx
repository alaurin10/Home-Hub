import { AnimatePresence, motion } from "framer-motion";

import { useStore } from "../store";

/** Slides in only when the fleet has a problem; invisible when healthy. */
export function FleetBanner() {
  const rooms = useStore((s) => s.rooms);
  const problem = rooms?.fleet.problem ?? false;
  const stale = rooms?.fleet.stale_nodes ?? [];

  return (
    <AnimatePresence>
      {problem && (
        <motion.div
          initial={{ opacity: 0, y: -12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -12, height: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="mx-auto max-w-5xl px-5"
        >
          <div
            className="mt-2 flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium"
            style={{
              borderColor: "var(--status-bad)",
              background: "color-mix(in srgb, var(--status-bad) 8%, var(--surface))",
              color: "var(--ink)",
            }}
          >
            <span aria-hidden>⚠</span>
            Sensor problem: {stale.join(", ")} not reporting
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
