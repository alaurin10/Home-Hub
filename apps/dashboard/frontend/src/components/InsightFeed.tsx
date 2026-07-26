import { useState } from "react";

import type { Insight } from "../api/types";
import { tint } from "../lib/thresholds";

const ROLE_COLOR: Record<string, string> = {
  good: "var(--status-good)",
  fair: "var(--status-fair)",
  poor: "var(--status-poor)",
  series_1: "var(--series-1)",
  series_2: "var(--series-2)",
  muted: "var(--muted)",
};

const KIND_BADGE: Record<string, string> = {
  action: "Do now",
  likely: "Likely",
  measured: "Measured",
};

/**
 * "What happened today".
 *
 * Every row carries the evidence that produced it, one tap away. That is the
 * point of the feature, not a nicety: a hedged guess the reader can audit is
 * useful, and the same guess with no way to check it is not.
 */
export function InsightFeed({
  insights,
  compact = false,
}: {
  insights: Insight[];
  compact?: boolean;
}) {
  // Rows expand independently — someone comparing two claims should see both,
  // so this deliberately does not accordion-close the others.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section className={`glass ${compact ? "rounded-[24px] p-[18px_20px]" : "rounded-[26px] p-[24px_26px]"}`}>
      <div className="flex items-baseline justify-between gap-2.5">
        <h2
          className={`font-semibold uppercase text-muted ${
            compact ? "text-[11px] tracking-[.08em]" : "text-[13px] tracking-[.04em]"
          }`}
        >
          What happened today
        </h2>
        {insights.length > 0 && (
          <span className={`text-muted ${compact ? "text-[11px]" : "text-[11.5px]"}`}>
            tap for evidence
          </span>
        )}
      </div>

      {insights.length === 0 ? (
        // A rule that does not fire produces nothing, so an empty feed is a
        // real state and says what it means rather than showing filler.
        <p className="mt-3 text-[12.5px] leading-[1.5] text-muted" style={{ textWrap: "pretty" }}>
          Nothing stood out in the last 24 hours — no cooking spike, no window event, nothing out
          of band long enough to mention.
        </p>
      ) : (
        <div className={`flex flex-col ${compact ? "mt-2" : "mt-3"}`}>
          {insights.map((insight) => {
            const color = ROLE_COLOR[insight.color_role] ?? "var(--muted)";
            const expanded = open.has(insight.id);
            return (
              <button
                key={insight.id}
                type="button"
                onClick={() => toggle(insight.id)}
                aria-expanded={expanded}
                className={`block w-full rounded-t-[10px] border-b border-hairline text-left transition-colors hover:bg-surface-2 ${
                  compact ? "px-1 py-[11px]" : "px-2 py-3"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-[7px] py-0.5 font-semibold uppercase tracking-[.05em] text-ink-2 ${
                      compact ? "text-[9.5px]" : "text-[10px]"
                    }`}
                    style={{ background: tint(color, 15) }}
                  >
                    {KIND_BADGE[insight.kind] ?? insight.kind}
                  </span>
                  <span
                    className={`tnum ml-auto text-muted ${compact ? "text-[11px]" : "text-[11.5px]"}`}
                  >
                    {insight.when}
                  </span>
                </div>
                <div
                  className={`mt-[7px] leading-[1.45] text-ink ${compact ? "text-[13px]" : "text-[13.5px]"}`}
                  style={{ textWrap: "pretty" }}
                >
                  {insight.text}
                </div>
                {expanded && (
                  <div
                    className="mt-2.5 flex flex-col gap-1.5 pl-[11px]"
                    style={{ borderLeft: `2px solid ${color}` }}
                  >
                    {insight.evidence.map((line) => (
                      <div
                        key={line}
                        className={`tnum leading-[1.5] text-ink-2 ${compact ? "text-[11.5px]" : "text-xs"}`}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
