import { NodeCard } from "../components/NodeCard";
import { PageTransition } from "../components/PageTransition";
import { Skeleton } from "../components/Skeleton";
import { useStore } from "../store";

export function SystemView() {
  const rooms = useStore((s) => s.rooms);
  if (!rooms)
    return (
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 md:pb-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </main>
    );

  const healthy = !rooms.fleet.problem;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 md:pb-10">
      <PageTransition>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Sensor fleet</h1>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: healthy ? "var(--status-good)" : "var(--status-bad)" }}
            />
            {healthy ? "All nodes reporting" : `${rooms.fleet.stale_nodes.length} node(s) down`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rooms.rooms.map((room) => (
            <NodeCard key={room.id} room={room} />
          ))}
        </div>
      </PageTransition>
    </main>
  );
}
