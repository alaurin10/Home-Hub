import { motion } from "framer-motion";
import { lazy, Suspense, useEffect, useState } from "react";

import { getHistory } from "../api/client";
import type { AppConfig, HistoryPoint } from "../api/types";
import { Page } from "../App";
import { Header } from "../components/Header";
import { HouseCard } from "../components/HouseCard";
import { InsightFeed } from "../components/InsightFeed";
import { OutdoorCard, OutdoorStrip } from "../components/OutdoorCard";
import { PageTransition } from "../components/PageTransition";
import { RoomCard } from "../components/RoomCard";
import { Skeleton } from "../components/Skeleton";
import { useStore } from "../store";

// Recharts is roughly half the bundle and the compare panel is the only thing
// on Home that needs it — below the fold, and absent entirely on mobile. Lazy
// so first paint (score, rooms, insights) still ships without it.
const ComparePanel = lazy(() =>
  import("../components/ComparePanel").then((m) => ({ default: m.ComparePanel })),
);

// The card stagger is a first-impression flourish; returning from a room
// shouldn't replay it.
let gridHasAnimated = false;

// Metrics every card's trend row plots.
export const SPARK_METRICS = ["temperature", "humidity", "co2"] as const;

// 24h, matching the "24h delta" the card prints beside each trend.
const SPARK_HOURS = 24;
const SPARK_REFRESH_MS = 5 * 60 * 1000;

// Module-level cache (same idiom as gridHasAnimated): Home → Room → back
// paints sparklines instantly instead of refetching a window that cannot have
// meaningfully changed.
let sparkCache: { at: number; series: Record<string, HistoryPoint[]> } | null = null;

/** One batched history fetch for every card's trend metrics — replaces N
 * per-card self-polling fetches — refreshed on one interval. */
function useHomeHistory(config: AppConfig | null): Record<string, HistoryPoint[]> | null {
  const [series, setSeries] = useState(sparkCache?.series ?? null);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    const entities = config.rooms.flatMap((r) =>
      SPARK_METRICS.map((m) => r.entities[m]).filter(Boolean),
    );
    const load = () =>
      getHistory(entities, SPARK_HOURS, 144)
        .then((h) => {
          sparkCache = { at: Date.now(), series: h.series };
          if (alive) setSeries(h.series);
        })
        // Sparklines are context, not critical — keep whatever we had.
        .catch(() => {});
    if (!sparkCache || Date.now() - sparkCache.at > SPARK_REFRESH_MS) void load();
    const timer = setInterval(load, SPARK_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [config]);

  return series;
}

export function HomeView() {
  const { config, rooms, outdoor, insights, settings } = useStore();
  const history = useHomeHistory(config);

  useEffect(() => {
    gridHasAnimated = true;
  }, []);

  if (!config || !rooms)
    return (
      <Page>
        <Skeleton className="h-52" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </Page>
    );

  const scale = settings?.scale ?? "F";

  return (
    <Page>
      <PageTransition>
        <div className="flex flex-col gap-5 max-lg:gap-3.5">
          <Header kicker="Overview" title="Today at home" />

          {/* Hero: the score answers "is the house OK" and the outdoor card
              answers "would opening a window help" — the two questions the
              rest of the page is evidence for. */}
          <div className="grid gap-5 max-lg:gap-3.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
            {/* Compact below lg: a 152px arc beside a 23px headline does not
                fit 390px, and the desktop stat strip wraps into nonsense. */}
            <div className="max-lg:hidden">
              <HouseCard rooms={rooms} config={config} scale={scale} />
            </div>
            <div className="lg:hidden">
              <HouseCard rooms={rooms} config={config} scale={scale} compact />
            </div>
            <div className="max-lg:hidden">
              <OutdoorCard outdoor={outdoor} scale={scale} />
            </div>
            <div className="lg:hidden">
              <OutdoorStrip outdoor={outdoor} scale={scale} />
            </div>
          </div>

          <motion.div
            className="grid gap-5 max-lg:gap-3 lg:grid-cols-3"
            initial={gridHasAnimated ? false : "hidden"}
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          >
            {rooms.rooms.map((room) => (
              <motion.div
                key={room.id}
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: { type: "spring", stiffness: 250, damping: 24 },
                  },
                }}
              >
                {/* Compact below lg: the desktop card's three trend columns
                    and chips do not survive a 390px width. */}
                <div className="max-lg:hidden">
                  <RoomCard room={room} config={config} history={history} scale={scale} />
                </div>
                <div className="lg:hidden">
                  <RoomCard room={room} config={config} history={history} scale={scale} compact />
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid min-w-0 gap-5 max-lg:gap-3.5 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
            <div className="max-lg:hidden">
              <Suspense fallback={<Skeleton className="h-[440px]" />}>
                <ComparePanel />
              </Suspense>
            </div>
            <InsightFeed insights={insights} />
          </div>
        </div>
      </PageTransition>
    </Page>
  );
}
