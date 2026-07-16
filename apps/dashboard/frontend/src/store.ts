import { create } from "zustand";

import { getJson, openStream, putLayout } from "./api/client";
import type {
  AppConfig,
  CardLayout,
  Layout,
  RoomsResponse,
  StateEvent,
} from "./api/types";

interface Store {
  config: AppConfig | null;
  rooms: RoomsResponse | null;
  layout: CardLayout[];
  connected: boolean;
  editMode: boolean;
  ready: boolean;

  init: () => Promise<void>;
  setEditMode: (on: boolean) => void;
  applyEvent: (ev: StateEvent) => void;
  moveCard: (from: number, to: number) => void;
  toggleSize: (id: string) => void;
}

// entity_id -> [roomId, metric] index built from config for O(1) live updates
let entityIndex: Record<string, [string, string]> = {};
// entity_id -> [roomId, "wifi_signal" | "uptime"] — node diagnostics are
// numeric like metrics but live in RoomSnapshot.node, not .metrics, so they
// get their own index/patch path. "status" is deliberately excluded: the
// online flag also depends on CO2 staleness (a 10-minute window), which is
// evaluated server-side on each /api/rooms call — patching status alone
// here would let the badge drift out of sync with that check.
let nodeEntityIndex: Record<string, [string, "wifi_signal" | "uptime"]> = {};

export const useStore = create<Store>((set, get) => ({
  config: null,
  rooms: null,
  layout: [],
  connected: false,
  editMode: false,
  ready: false,

  init: async () => {
    const [config, rooms, layout] = await Promise.all([
      getJson<AppConfig>("/api/config"),
      getJson<RoomsResponse>("/api/rooms"),
      getJson<Layout>("/api/layout"),
    ]);
    entityIndex = {};
    nodeEntityIndex = {};
    for (const room of config.rooms) {
      for (const [metric, entity] of Object.entries(room.entities)) {
        entityIndex[entity] = [room.id, metric];
      }
      for (const field of ["wifi_signal", "uptime"] as const) {
        const entity = room.node[field];
        if (entity) nodeEntityIndex[entity] = [room.id, field];
      }
    }
    set({ config, rooms, layout: layout.cards, ready: true });

    openStream(
      (ev) => get().applyEvent(ev),
      (connected) => set({ connected }),
    );
    // Snapshot refresh as a fallback (fleet status, reconnect gaps)
    setInterval(async () => {
      try {
        set({ rooms: await getJson<RoomsResponse>("/api/rooms") });
      } catch {
        /* transient */
      }
    }, 60000);
  },

  setEditMode: (on) => set({ editMode: on }),

  applyEvent: (ev) => {
    const rooms = get().rooms;
    if (!rooms || typeof ev.value === "string") return;
    const value = ev.value;
    const ts = ev.ts;

    const nodeLocated = nodeEntityIndex[ev.entity_id];
    if (nodeLocated) {
      const [roomId, field] = nodeLocated;
      set({
        rooms: {
          ...rooms,
          rooms: rooms.rooms.map((room) =>
            room.id === roomId ? { ...room, node: { ...room.node, [field]: value } } : room,
          ),
        },
      });
      return;
    }

    const located = entityIndex[ev.entity_id];
    if (!located) return;
    const [roomId, metric] = located;
    set({
      rooms: {
        ...rooms,
        rooms: rooms.rooms.map((room) =>
          room.id === roomId && room.metrics[metric]
            ? {
                ...room,
                metrics: {
                  ...room.metrics,
                  [metric]: { ...room.metrics[metric], value, ts },
                },
              }
            : room,
        ),
      },
    });
  },

  moveCard: (from, to) => {
    const layout = [...get().layout];
    const [card] = layout.splice(from, 1);
    layout.splice(to, 0, card);
    set({ layout });
    void putLayout({ cards: layout });
  },

  toggleSize: (id) => {
    const layout = get().layout.map((c): CardLayout =>
      c.id === id ? { ...c, size: c.size === "wide" ? "regular" : "wide" } : c,
    );
    set({ layout });
    void putLayout({ cards: layout });
  },
}));
