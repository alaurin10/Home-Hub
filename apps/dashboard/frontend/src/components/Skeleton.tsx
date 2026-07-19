/** Loading placeholder in the card material; motion-safe keeps the pulse
 * away from reduced-motion users. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`glass rounded-3xl motion-safe:animate-pulse ${className}`} />;
}
