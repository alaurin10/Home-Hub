import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { getHistory } from "../api/client";
import type { AppConfig, HistoryPoint } from "../api/types";
import { PageTransition } from "../components/PageTransition";
import { RoomCard } from "../components/RoomCard";
import { Skeleton } from "../components/Skeleton";
import { useStore } from "../store";

// The card stagger is a first-impression flourish; returning from a room
// shouldn't replay it (or stack its transforms on dnd-kit's).
let gridHasAnimated = false;

// Metrics every card's rotating sparkline cycles through.
export const SPARK_METRICS = ["temperature", "humidity", "co2"] as const;

const SPARK_HOURS = 3;
const SPARK_REFRESH_MS = 5 * 60 * 1000;

// Module-level cache (same idiom as gridHasAnimated): Home → Room → back
// paints sparklines instantly instead of refetching a 3h window that can't
// have meaningfully changed.
let sparkCache: { at: number; series: Record<string, HistoryPoint[]> } | null = null;

/** One batched 3h history fetch for every card's sparkline metrics —
 * replaces N per-card self-polling fetches — refreshed on one interval. */
function useHomeHistory(config: AppConfig | null): Record<string, HistoryPoint[]> | null {
  const [series, setSeries] = useState(sparkCache?.series ?? null);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    const entities = config.rooms.flatMap((r) =>
      SPARK_METRICS.map((m) => r.entities[m]).filter(Boolean),
    );
    const load = () =>
      getHistory(entities, SPARK_HOURS, 120)
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
  const { config, rooms, layout, editMode, moveCard, toggleSize } = useStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const history = useHomeHistory(config);

  useEffect(() => {
    gridHasAnimated = true;
  }, []);

  if (!config || !rooms)
    return (
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 md:pb-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </main>
    );

  const byId = Object.fromEntries(rooms.rooms.map((r) => [r.id, r]));
  const cards = layout.filter((c) => byId[c.id]);

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    moveCard(
      cards.findIndex((c) => c.id === active.id),
      cards.findIndex((c) => c.id === over.id),
    );
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 md:pb-10">
      <PageTransition>
        {editMode && (
          <p className="mb-3 text-sm text-muted">Drag cards to reorder · toggle width per card</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
            <motion.div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2"
              initial={gridHasAnimated ? false : "hidden"}
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            >
              {cards.map((card) => (
                <motion.div
                  key={card.id}
                  variants={{
                    hidden: { opacity: 0, y: 14 },
                    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 250, damping: 24 } },
                  }}
                  className={card.size === "wide" ? "sm:col-span-2" : ""}
                >
                  <RoomCard
                    room={byId[card.id]}
                    config={config}
                    size={card.size}
                    editMode={editMode}
                    history={history}
                    onToggleSize={() => toggleSize(card.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </SortableContext>
        </DndContext>
      </PageTransition>
    </main>
  );
}
