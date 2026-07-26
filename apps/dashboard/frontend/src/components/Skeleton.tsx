import type { CSSProperties } from "react";

/** Loading placeholder in the card material; motion-safe keeps the pulse
 * away from reduced-motion users. `style` carries a measured height where the
 * real content's height is a prop rather than a class (charts). */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`glass rounded-3xl motion-safe:animate-pulse ${className}`}
      style={style}
    />
  );
}
