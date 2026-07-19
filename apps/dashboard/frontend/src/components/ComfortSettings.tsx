import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { getThresholds, putThresholds } from "../api/client";
import type { Threshold } from "../api/types";
import { STATUS_COLOR, STATUS_LABEL, METRIC_LABEL } from "../lib/thresholds";
import { useStore } from "../store";

// Only the comfort metrics are tunable here — CO₂ and the particulate/VOC
// bands are health limits, not personal preference, so they stay in config.
const COMFORT_METRICS = ["temperature", "humidity"] as const;
const BANDS = ["good", "fair", "poor"] as const;
type Band = (typeof BANDS)[number];

// Draft keeps values as strings so a field can be empty mid-edit without
// snapping to 0; parsing back to numbers happens at validate/save time.
type BandDraft = Record<Band, [string, string]>;
type Draft = Record<string, BandDraft>;

const toDraft = (t: Threshold): BandDraft => {
  const r = t.ranges!;
  return {
    good: [String(r.good[0]), String(r.good[1])],
    fair: [String(r.fair[0]), String(r.fair[1])],
    poor: [String(r.poor[0]), String(r.poor[1])],
  };
};

/** Parse a band draft to numbers, enforcing the same nesting rule the backend
 * checks (good within fair within poor). Returns the ranges or an error. */
function parseBands(
  draft: BandDraft,
): { ranges: Record<Band, [number, number]> } | { error: string } {
  const nums = {} as Record<Band, [number, number]>;
  for (const band of BANDS) {
    const lo = Number(draft[band][0]);
    const hi = Number(draft[band][1]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi))
      return { error: `${STATUS_LABEL[band]} needs two numbers` };
    if (lo > hi) return { error: `${STATUS_LABEL[band]} low must be ≤ high` };
    nums[band] = [lo, hi];
  }
  const { good, fair, poor } = nums;
  if (!(poor[0] <= fair[0] && fair[0] <= good[0] && good[1] <= fair[1] && fair[1] <= poor[1]))
    return { error: "Bands must nest: Good inside Fair inside Poor" };
  return { ranges: nums };
}

function BandRow({
  band,
  values,
  unit,
  onChange,
}: {
  band: Band;
  values: [string, string];
  unit: string;
  onChange: (idx: 0 | 1, value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-16 items-center gap-1.5 text-xs font-medium text-ink-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[band] }} />
        {STATUS_LABEL[band]}
      </span>
      {([0, 1] as const).map((idx) => (
        <label key={idx} className="flex items-center gap-1 text-xs text-muted">
          <span className="w-8">{idx === 0 ? "Low" : "High"}</span>
          <input
            type="number"
            inputMode="decimal"
            value={values[idx]}
            onChange={(e) => onChange(idx, e.target.value)}
            className="w-16 rounded-lg border border-hairline bg-surface px-2 py-1 text-right text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ink-2)]"
          />
          <span className="w-6 text-muted">{unit}</span>
        </label>
      ))}
    </div>
  );
}

export function ComfortSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setThresholds = useStore((s) => s.setThresholds);
  const [defaults, setDefaults] = useState<Record<string, Threshold> | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load fresh on open: effective values seed the fields, defaults back "Reset".
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    getThresholds()
      .then((res) => {
        if (!alive) return;
        setDefaults(res.defaults);
        const next: Draft = {};
        for (const m of COMFORT_METRICS) {
          if (res.thresholds[m]?.ranges) next[m] = toDraft(res.thresholds[m]);
        }
        setDraft(next);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [open]);

  // Escape closes, matching the backdrop click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const metrics = COMFORT_METRICS.filter((m) => draft[m]);
  const parsed = metrics.map((m) => [m, parseBands(draft[m])] as const);
  const firstError = parsed.find(([, r]) => "error" in r);

  const setField = (metric: string, band: Band, idx: 0 | 1, value: string) =>
    setDraft((d) => {
      const bandVals: [string, string] = [...d[metric][band]] as [string, string];
      bandVals[idx] = value;
      return { ...d, [metric]: { ...d[metric], [band]: bandVals } };
    });

  const resetMetric = (metric: string) => {
    const def = defaults?.[metric];
    if (def?.ranges) setDraft((d) => ({ ...d, [metric]: toDraft(def) }));
  };

  const save = async () => {
    setError(null);
    const payload: Record<string, { ranges: Record<Band, [number, number]> }> = {};
    for (const [metric, result] of parsed) {
      if ("error" in result) {
        setError(`${METRIC_LABEL[metric]}: ${result.error}`);
        return;
      }
      payload[metric] = { ranges: result.ranges };
    }
    setSaving(true);
    try {
      const res = await putThresholds(payload);
      setThresholds(res.thresholds);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[10vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Comfort settings"
            className="glass w-full max-w-md rounded-3xl p-6"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Comfort settings</h2>
                <p className="mt-1 text-xs text-muted">
                  Set the temperature and humidity bands. Each nests inside the next; outside Poor
                  reads as {STATUS_LABEL.bad.toLowerCase()}.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="glass-chrome rounded-full px-2.5 py-1 text-sm text-ink-2"
              >
                ✕
              </button>
            </div>

            {!defaults && !error && <p className="mt-6 text-sm text-muted">Loading…</p>}

            <div className="mt-5 space-y-6">
              {metrics.map((metric) => {
                const unit = defaults?.[metric]?.unit ?? "";
                return (
                  <section key={metric}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">{METRIC_LABEL[metric]}</h3>
                      <button
                        onClick={() => resetMetric(metric)}
                        className="text-xs font-medium text-muted hover:text-ink-2"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="space-y-2">
                      {BANDS.map((band) => (
                        <BandRow
                          key={band}
                          band={band}
                          unit={unit}
                          values={draft[metric][band]}
                          onChange={(idx, value) => setField(metric, band, idx, value)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {(error || firstError) && (
              <p className="mt-4 text-xs font-medium" style={{ color: "var(--status-bad)" }}>
                {error ?? (firstError && "error" in firstError[1] ? firstError[1].error : "")}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="glass-chrome rounded-full px-4 py-1.5 text-sm font-medium text-ink-2"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !!firstError || !metrics.length}
                className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-surface disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
