import { Page } from "../App";
import { Header } from "../components/Header";
import { NodeCard } from "../components/NodeCard";
import { PageTransition } from "../components/PageTransition";
import { Skeleton } from "../components/Skeleton";
import { useStore } from "../store";

export function SystemView() {
  const { rooms, config } = useStore();
  if (!rooms || !config)
    return (
      <Page>
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </Page>
    );

  const healthy = !rooms.fleet.problem;
  const reporting = rooms.rooms.length - rooms.fleet.stale_nodes.length;

  return (
    <Page>
      <PageTransition>
        <div className="flex flex-col gap-5 max-lg:gap-3.5">
          <Header kicker="Diagnostics" title="Sensor fleet" />
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: healthy ? "var(--status-good)" : "var(--status-bad)" }}
            />
            {healthy
              ? `${reporting} of ${rooms.rooms.length} reporting`
              : `${rooms.fleet.stale_nodes.length} node(s) down`}
          </span>
          <div className="grid gap-5 max-lg:gap-3.5 lg:grid-cols-3">
            {rooms.rooms.map((room) => (
              <NodeCard
                key={room.id}
                room={room}
                entities={Object.values(config.rooms.find((r) => r.id === room.id)?.entities ?? {})}
              />
            ))}
          </div>
        </div>
      </PageTransition>
    </Page>
  );
}
