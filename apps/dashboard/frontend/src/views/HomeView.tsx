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
import { useEffect } from "react";

import { PageTransition } from "../components/PageTransition";
import { RoomCard } from "../components/RoomCard";
import { useStore } from "../store";

// The card stagger is a first-impression flourish; returning from a room
// shouldn't replay it (or stack its transforms on dnd-kit's).
let gridHasAnimated = false;

export function HomeView() {
  const { config, rooms, layout, editMode, moveCard, toggleSize } = useStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    gridHasAnimated = true;
  }, []);

  if (!config || !rooms) return null;

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
