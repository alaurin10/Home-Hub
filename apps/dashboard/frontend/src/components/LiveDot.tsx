import { motion, useReducedMotion } from "framer-motion";

/** Connection indicator: quiet green dot with a soft pulse while live. */
export function LiveDot({ connected }: { connected: boolean }) {
  const reduced = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={connected ? "Live" : "Reconnecting"}>
      <span className="relative flex h-2 w-2">
        {connected && !reduced && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full"
            style={{ background: "var(--status-good)" }}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: connected ? "var(--status-good)" : "var(--muted)" }}
        />
      </span>
      {connected ? "Live" : "Offline"}
    </span>
  );
}
