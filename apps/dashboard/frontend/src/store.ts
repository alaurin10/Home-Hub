import { create } from "zustand";

import { getInsights, getJson, getOutdoor, getSettings, openStream } from "./api/client";
import type {
  AppConfig,
  AppSettings,
  Insight,
  Outdoor,
  RoomsResponse,
  StateEvent,
  Threshold,
} from "./api/types";

export type CompareMetric = "temperature" | "humidity" | "co2" | "pm2_5";
export type SettingsTab = "comfort" | "weather" | "score";

// Shared by every chart on the page. Index into RANGES (lib/ranges.ts): the
// hairline in the range control sits between 48h and 7d because that is where
// the backend switches from raw samples to hourly means.
const RANGE_KEY = "home-hub:rangeIdx";

const SNAPSHOT_MS = 60_000;
const OUTDOOR_MS = 10 * 60_000; // weather does not move faster than this
const INSIGHTS_MS = 5 * 60_000; // matches the server's recompute interval

function storedRangeIdx(): number {
  // Explicit null check: Number(null) is 0, which would silently make "3h" the
  // default for every first-time visitor.
  const stored = localStorage.getItem(RANGE_KEY);
  if (stored === null) return 1; // 24h
  const idx = Number(stored);
  return Number.isInteger(idx) && idx >= 0 && idx <= 5 ? idx : 1;
}

interface Store {
  config: AppConfig | null;
  rooms: RoomsResponse | null;
  outdoor: Outdoor | null;
  insights: Insight[];
  settings: AppSettings | null;
  connected: boolean;
  ready: boolean;
  initError: string | null;

  rangeIdx: number;
  compareMetric: CompareMetric;
  settingsOpen: boolean;
  settingsTab: SettingsTab;

  init: () => Promise<void>;
  setRangeIdx: (idx: number) => void;
  setCompareMetric: (metric: CompareMetric) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setThresholds: (thresholds: Record<string, Threshold>) => void;
  setSettings: (settings: AppSettings) => void;
  refreshOutdoor: () => Promise<void>;
  refreshInsights: () => Promise<void>;
  applyEvent: (ev: StateEvent) => void;
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
  outdoor: null,
  insights: [],
  settings: null,
  connected: false,
  ready: false,
  initError: null,

  rangeIdx: storedRangeIdx(),
  compareMetric: "co2",
  settingsOpen: false,
  settingsTab: "comfort",

  init: async () => {
    set({ initError: null });
    let config: AppConfig, rooms: RoomsResponse, settings: AppSettings;
    try {
      [config, rooms, settings] = await Promise.all([
        getJson<AppConfig>("/api/config"),
        getJson<RoomsResponse>("/api/rooms"),
        getSettings(),
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
    set({ config, rooms, settings, ready: true });

    // Outdoor and insights are secondary context: they load after first paint
    // and a failure leaves the rest of the dashboard untouched.
    void get().refreshOutdoor();
    void get().refreshInsights();

    openStream(
      (ev) => get().applyEvent(ev),
      (connected) => set({ connected }),
      () => void get().refreshInsights(),
    );
    // Snapshot refresh as a fallback (fleet status, scores, reconnect gaps)
    setInterval(async () => {
      try {
        set({ rooms: await getJson<RoomsResponse>("/api/rooms") });
      } catch {
        /* transient */
      }
    }, SNAPSHOT_MS);
    setInterval(() => void get().refreshOutdoor(), OUTDOOR_MS);
    // The stream nudges on change; this only covers a dropped socket.
    setInterval(() => void get().refreshInsights(), INSIGHTS_MS);
  },

  setRangeIdx: (idx) => {
    set({ rangeIdx: idx });
    localStorage.setItem(RANGE_KEY, String(idx));
  },

  setCompareMetric: (compareMetric) => set({ compareMetric }),
  openSettings: (tab) => set({ settingsOpen: true, ...(tab ? { settingsTab: tab } : {}) }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),

  // Swap in freshly saved comfort bands so every status color recomputes
  // immediately — no reload, no refetch of /api/config. The scores are
  // server-derived from the same bands, so pull a fresh snapshot too.
  setThresholds: (thresholds) => {
    const config = get().config;
    if (config) set({ config: { ...config, thresholds } });
    void getJson<RoomsResponse>("/api/rooms")
      .then((rooms) => set({ rooms }))
      .catch(() => {});
  },

  setSettings: (settings) => {
    set({ settings });
    void get().refreshOutdoor(); // a new location changes the station
  },

  refreshOutdoor: async () => {
    try {
      set({ outdoor: await getOutdoor() });
    } catch {
      /* the card just stays as it was */
    }
  },

  refreshInsights: async () => {
    try {
      set({ insights: await getInsights() });
    } catch {
      /* keep the previous feed rather than blanking it */
    }
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
    // Only the reading is patched live, never the score: the score is derived
    // server-side from every metric at once, and recomputing it here from one
    // changed entity is exactly the client/server drift the design forbids.
    // The 60s snapshot brings the authoritative number.
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
}));
