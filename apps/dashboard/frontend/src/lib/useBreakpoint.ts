import { useEffect, useState } from "react";

/** Tailwind's `lg`. One responsive app, not two builds: below this the mobile
 * composition, at and above it the rail layout. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * True at >=lg. Only for things CSS cannot express — chart heights are numeric
 * props to Recharts, not classes. Anything that *can* be a class should be one,
 * so it responds on resize without a re-render.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
