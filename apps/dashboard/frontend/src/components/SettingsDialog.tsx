import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getThresholds, putSettings, putThresholds } from "../api/client";
import type { Threshold } from "../api/types";
import { formatValue } from "../lib/format";
import { displayTemp, tempUnit } from "../lib/scale";
import {
  METRIC_LABEL,
  SCORE_BAND_LABEL,
  statusFor,
  STATUS_COLOR,
  STATUS_LABEL,
} from "../lib/thresholds";
import { useStore, type SettingsTab } from "../store";

// Only the comfort metrics are tunable: CO₂ and the particulate/VOC bands are
// health limits, not personal preference, so they stay in config.yaml.
const COMFORT: { metric: "temperature" | "humidity"; unit: string; fair: number; poor: number }[] = [
  // Fair and poor widen automatically around the good band the user sets —
  // asking someone to keep three nested windows consistent by hand is how the
  // old dialog produced validation errors.
  { metric: "temperature", unit: "°F", fair: 3, poor: 7 },
  { metric: "humidity", unit: "%", fair: 5, poor: 10 },
];

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "comfort", label: "Comfort" },
  { id: "weather", label: "Weather" },
  { id: "score", label: "Air score" },
];

const SAVE_DEBOUNCE_MS = 400;

type GoodBands = Record<string, [number, number]>;

const widen = ([lo, hi]: [number, number], fair: number, poor: number) => ({
  good: [lo, hi] as [number, number],
  fair: [lo - fair, hi + fair] as [number, number],
  poor: [lo - poor, hi + poor] as [number, number],
});

export function SettingsDialog() {
  const { settingsOpen, settingsTab, closeSettings, setSettingsTab } = useStore();

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-center overflow-hidden p-6 max-lg:items-end max-lg:p-0 lg:items-center"
          style={{
            background: "color-mix(in srgb, var(--page) 55%, transparent)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeSettings}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="glass flex max-h-[84%] w-full flex-col overflow-hidden rounded-[24px] p-[28px_30px_30px] lg:w-[660px] max-lg:max-h-[78%] max-lg:rounded-[26px_26px_0_0] max-lg:p-[22px_20px_26px]"
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[19px] font-semibold tracking-[-.02em] text-ink">Settings</h2>
                <div className="mt-1 text-xs text-muted">
                  Saved for the whole household · applies to every screen
                </div>
              </div>
              <button
                onClick={closeSettings}
                aria-label="Close"
                className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-2 text-ink-2"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </header>

            <div className="mt-4 flex gap-[3px] self-start rounded-full bg-surface-2 p-[3px]">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`rounded-full px-[15px] py-[7px] text-[12.5px] font-medium transition-colors ${
                    settingsTab === tab.id ? "bg-ink text-surface" : "text-muted hover:text-ink-2"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-[18px] min-h-0 overflow-auto">
              {settingsTab === "comfort" && <ComfortTab />}
              {settingsTab === "weather" && <WeatherTab />}
              {settingsTab === "score" && <ScoreTab />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Escape closes, matching the backdrop click. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

// --- Comfort --------------------------------------------------------------

function ComfortTab() {
  const { config, rooms, settings, setThresholds, closeSettings } = useStore();
  useEscape(closeSettings);

  const [good, setGood] = useState<GoodBands | null>(null);
  const [defaults, setDefaults] = useState<Record<string, Threshold> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    getThresholds()
      .then((res) => {
        if (!alive) return;
        setDefaults(res.defaults);
        const next: GoodBands = {};
        for (const { metric } of COMFORT) {
          const band = res.thresholds[metric]?.ranges?.good;
          if (band) next[metric] = [band[0], band[1]];
        }
        setGood(next);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Every change re-renders the preview immediately and saves on a trailing
  // debounce: holding the − button should not fire eight PUTs.
  const save = (next: GoodBands) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const payload = Object.fromEntries(
        COMFORT.filter((c) => next[c.metric]).map((c) => [
          c.metric,
          { ranges: widen(next[c.metric], c.fair, c.poor) },
        ]),
      );
      putThresholds(payload)
        .then((res) => {
          setError(null);
          setThresholds(res.thresholds);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, SAVE_DEBOUNCE_MS);
  };

  const nudge = (metric: string, edge: 0 | 1, by: number) => {
    if (!good) return;
    const band: [number, number] = [...good[metric]];
    band[edge] = Math.round((band[edge] + by) * 10) / 10;
    // A band needs at least a degree of width, or "comfortable" stops meaning
    // anything and the backend's nesting check rejects the save anyway.
    if (band[0] > band[1] - 1) return;
    const next = { ...good, [metric]: band };
    setGood(next);
    save(next);
  };

  const reset = () => {
    if (!defaults) return;
    const next: GoodBands = {};
    for (const { metric } of COMFORT) {
      const band = defaults[metric]?.ranges?.good;
      if (band) next[metric] = [band[0], band[1]];
    }
    setGood(next);
    save(next);
  };

  if (!good || !config) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      <p className="mb-4 text-[13px] leading-[1.6] text-ink-2" style={{ textWrap: "pretty" }}>
        These are the bands the dashboard calls comfortable. Fair and poor widen automatically
        around them, and every status dot, room score and house score re-reads from here.
      </p>

      {COMFORT.map(({ metric, unit }) => (
        <div key={metric} className="mt-4 border-t border-hairline pt-3.5 first:mt-0">
          <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
            {METRIC_LABEL[metric]}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {([0, 1] as const).map((edge) => (
              <div
                key={edge}
                className="flex min-w-[190px] flex-1 items-center justify-between gap-3 rounded-[14px] border border-hairline p-[10px_12px]"
              >
                <span className="text-[12.5px] text-ink-2">
                  {edge === 0 ? "Comfortable from" : "up to"}
                </span>
                <span className="inline-flex items-center gap-[9px]">
                  <StepButton label={`Decrease ${metric}`} onClick={() => nudge(metric, edge, -1)}>
                    <Minus size={14} strokeWidth={2} />
                  </StepButton>
                  <span className="tnum min-w-[44px] text-center text-base font-semibold text-ink">
                    {formatValue(good[metric][edge], 0)}
                    <span className="ml-0.5 text-[11px] font-normal text-muted">{unit}</span>
                  </span>
                  <StepButton label={`Increase ${metric}`} onClick={() => nudge(metric, edge, 1)}>
                    <Plus size={14} strokeWidth={2} />
                  </StepButton>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-4 border-t border-hairline pt-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
          Right now, that reads
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          {rooms?.rooms.map((room) => {
            const t = room.metrics.temperature?.value ?? null;
            const h = room.metrics.humidity?.value ?? null;
            const ts = statusFor(config, "temperature", t);
            const hs = statusFor(config, "humidity", h);
            const scale = settings?.scale ?? "F";
            return (
              <div key={room.id} className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
                <span className="flex-1">{room.name}</span>
                <span className="tnum inline-flex items-center gap-1.5">
                  <Dot status={ts} />
                  {t === null ? "–" : formatValue(displayTemp(t, scale), 1)} {tempUnit(scale)} ·{" "}
                  {ts ? STATUS_LABEL[ts] : "–"}
                </span>
                <span className="tnum inline-flex items-center gap-1.5">
                  <Dot status={hs} />
                  {formatValue(h, 0)} % · {hs ? STATUS_LABEL[hs] : "–"}
                </span>
              </div>
            );
          })}
        </div>
        <button
          onClick={reset}
          className="mt-3.5 rounded-full border border-hairline px-3.5 py-[7px] text-[12.5px] font-medium text-ink-2"
        >
          Reset to defaults
        </button>
        {error && (
          <p className="mt-3 text-xs font-medium" style={{ color: "var(--status-bad)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface-2 text-ink-2"
    >
      {children}
    </button>
  );
}

function Dot({ status }: { status: ReturnType<typeof statusFor> }) {
  return (
    <span
      aria-hidden
      className="h-[7px] w-[7px] rounded-full"
      style={{ background: status ? STATUS_COLOR[status] : "var(--muted)" }}
    />
  );
}

// --- Weather --------------------------------------------------------------

function WeatherTab() {
  const { settings, setSettings, closeSettings } = useStore();
  useEscape(closeSettings);
  const [draft, setDraft] = useState(settings?.location ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async (location: string, scale: "F" | "C") => {
    setSaving(true);
    setError(null);
    try {
      setSettings(await putSettings({ location, scale }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const scale = settings?.scale ?? "F";
  const resolved = settings?.station;
  const unresolved = Boolean(settings?.location) && !resolved;

  return (
    <div>
      <p className="mb-4 text-[13px] leading-[1.6] text-ink-2" style={{ textWrap: "pretty" }}>
        There is no outdoor node in the fleet, so outdoor readings come from the nearest public
        weather station and air-quality monitor. Set the location they are matched against — a town
        and state, or raw <span className="tnum">latitude, longitude</span>.
      </p>
      <div className="flex flex-col gap-3.5 border-t border-hairline pt-3.5">
        <label className="flex flex-col gap-[7px]">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
            Location
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== settings?.location && void commit(draft, scale)}
            onKeyDown={(e) => e.key === "Enter" && void commit(draft, scale)}
            placeholder="Cambridge, MA"
            className="rounded-xl border border-hairline bg-surface-2 p-[11px_13px] text-sm text-ink"
          />
        </label>

        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-hairline p-[12px_14px]">
          <div>
            <div className="text-[12.5px] text-ink-2">Matched station</div>
            <div className="tnum mt-[3px] text-xs text-muted">
              {saving ? "Matching…" : (resolved ?? "Nothing matched yet")}
            </div>
          </div>
          {/* The resolved station is shown back so a typo is visible rather
              than quietly leaving the outdoor card blank. */}
          <span
            className="text-xs"
            style={{ color: resolved ? "var(--status-good)" : "var(--muted)" }}
          >
            {resolved ? "● reporting" : "○ not set"}
          </span>
        </div>
        {unresolved && (
          <p className="text-xs" style={{ color: "var(--status-fair)" }}>
            Couldn't match "{settings?.location}" to a place. Try adding a state or country, or
            enter coordinates.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-ink-2">Temperature scale</span>
          <span className="flex gap-[3px] rounded-full bg-surface-2 p-[3px]">
            {(["F", "C"] as const).map((option) => (
              <button
                key={option}
                onClick={() => void commit(settings?.location ?? "", option)}
                className={`rounded-full px-[15px] py-1.5 text-[12.5px] font-medium transition-colors ${
                  scale === option ? "bg-ink text-surface" : "text-muted hover:text-ink-2"
                }`}
              >
                °{option}
              </button>
            ))}
          </span>
        </div>
        {error && (
          <p className="text-xs font-medium" style={{ color: "var(--status-bad)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Air score ------------------------------------------------------------

function ScoreTab() {
  const { rooms, closeSettings } = useStore();
  useEscape(closeSettings);

  const scored = rooms?.rooms.filter((r) => r.score) ?? [];
  const worst = scored.length
    ? scored.reduce((a, b) => (b.score!.value < a.score!.value ? b : a))
    : null;

  return (
    <div>
      <p className="mb-3.5 text-[13px] leading-[1.6] text-ink-2" style={{ textWrap: "pretty" }}>
        A room starts at 100 and loses points for every reading past its comfortable band —
        distance from the band times a weight, so a reading that is barely out costs almost nothing
        and one far out costs a lot. Nothing is capped per metric; a single bad number can carry the
        whole score down.
      </p>

      {worst?.score ? (
        <>
          <div className="border-t border-hairline pt-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
                Worked through — {worst.name}
              </span>
              <span className="text-[12.5px] text-muted">
                100 →{" "}
                <span className="tnum text-[17px] font-semibold text-ink">{worst.score.value}</span>
              </span>
            </div>
            {/* Rendered straight from the API's parts. Re-deriving the
                arithmetic here is exactly how an explanation drifts from the
                number it is explaining. */}
            <div className="mt-3 flex flex-col gap-[11px]">
              {worst.score.parts.map((part) => (
                <div key={part.metric}>
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-[12.5px] text-ink-2">
                      {part.label} <span className="text-muted">— {part.detail}</span>
                    </span>
                    <span className="tnum text-[13px] font-semibold text-ink">
                      {part.penalty > 0.05 ? `−${part.penalty.toFixed(1)}` : "0"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, part.penalty * 3)}%`,
                        background:
                          part.penalty > 12
                            ? "var(--status-poor)"
                            : part.penalty > 3
                              ? "var(--status-fair)"
                              : "var(--status-good)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-hairline pt-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
              House score
            </div>
            <p className="mt-2 text-[13px] leading-[1.6] text-ink-2">
              House score = 55% of the worst room (
              <span className="tnum">{Math.min(...scored.map((r) => r.score!.value))}</span>) + 45%
              of the {scored.length}-room average (
              <span className="tnum">
                {Math.round(
                  scored.reduce((a, r) => a + r.score!.value, 0) / scored.length,
                )}
              </span>
              ) = <span className="tnum">{rooms?.house.score}</span>.
            </p>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">
              Weighted toward the worst room on purpose — one stuffy bedroom should not average away
              behind two clean ones. 90+ {SCORE_BAND_LABEL.excellent} · 75+ {SCORE_BAND_LABEL.good}{" "}
              · 55+ {SCORE_BAND_LABEL.fair} · below that {SCORE_BAND_LABEL.poor}.
            </p>
          </div>
        </>
      ) : (
        <p className="border-t border-hairline pt-3.5 text-[13px] text-muted">
          No room is reporting enough to score right now.
        </p>
      )}
    </div>
  );
}
