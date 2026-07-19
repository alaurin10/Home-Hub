import { create } from "zustand";

import { getJson, openStream, putLayout } from "./api/client";
import type {
  AppConfig,
  CardLayout,
  Layout,
  RoomsResponse,
  StateEvent,
  Threshold,
} from "./api/types";

interface Store {
  config: AppConfig | null;
  rooms: RoomsResponse | null;
  layout: CardLayout[];
  connected: boolean;
  editMode: boolean;
  ready: boolean;
  initError: string | null;

  init: () => Promise<void>;
  setEditMode: (on: boolean) => void;
  setThresholds: (thresholds: Record<string, Threshold>) => void;
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
// here would let the badge drift out of sync with that check. The string
// diagnostics (esphome_version/ip_address) are also left out: applyEvent
// drops string values, and both effectively never change — the 60s
// /api/rooms poll is plenty.
let nodeEntityIndex: Record<string, [string, "wifi_signal" | "uptime"]> = {};

export const useStore = create<Store>((set, get) => ({
  config: null,
  rooms: null,
  layout: [],
  connected: false,
  editMode: false,
  ready: false,
  initError: null,

  init: async () => {
    set({ initError: null });
    let config: AppConfig, rooms: RoomsResponse, layout: Layout;
    try {
      [config, rooms, layout] = await Promise.all([
        getJson<AppConfig>("/api/config"),
        getJson<RoomsResponse>("/api/rooms"),
        getJson<Layout>("/api/layout"),
      ]);
    } catch (err) {
      // Return before the stream/poll start: a Retry that calls init() again
      // can never stack a second WebSocket or interval.
      set({ initError: err instanceof Error ? err.message : String(err) });
      return;
    }
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

  // Swap in freshly saved comfort bands so every status color recomputes
  // immediately — no reload, no refetch of /api/config.
  setThresholds: (thresholds) => {
    const config = get().config;
    if (config) set({ config: { ...config, thresholds } });
  },

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
