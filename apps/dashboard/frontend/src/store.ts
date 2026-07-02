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
    for (const room of config.rooms) {
      for (const [metric, entity] of Object.entries(room.entities)) {
        entityIndex[entity] = [room.id, metric];
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
    const located = entityIndex[ev.entity_id];
    const rooms = get().rooms;
    if (!located || !rooms || typeof ev.value === "string") return;
    const value = ev.value;
    const ts = ev.ts;
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
