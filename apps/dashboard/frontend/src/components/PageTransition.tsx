import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Shared route enter/exit wrapper. Every view renders inside one of these so
 * AnimatePresence mode="wait" in App has a real exit to run — a quick fade-up
 * out, fade-down in. Exit is shorter than enter so navigation feels snappy.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: "easeIn" } }}
    >
      {children}
    </motion.div>
  );
}
