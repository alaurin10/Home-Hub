import { Page } from "../App";
import { ComparePanel, buildSeries, seriesValues, useCompareHistory } from "../components/ComparePanel";
import { Header } from "../components/Header";
import { PageTransition } from "../components/PageTransition";
import { formatValue } from "../lib/format";
import { scaleOf } from "../lib/scale";
import { METRIC_DIGITS, METRIC_LABEL } from "../lib/thresholds";
import { useStore } from "../store";

/** The full-width compare screen: the same panel the Home page carries, plus a
 * Now/Avg/Peak summary per room. */
export function CompareView() {
  const { config, compareMetric, rangeIdx, settings } = useStore();
  const loaded = useCompareHistory(compareMetric, rangeIdx);
  const scale = scaleOf(settings);
  const series = buildSeries(loaded, config, compareMetric, scale);
  const kind = loaded?.resp.kind ?? "raw";
  const digits = METRIC_DIGITS[compareMetric] ?? 0;

  return (
    <Page>
      <PageTransition>
        <div className="flex flex-col gap-5 max-lg:gap-3.5">
          <Header kicker="Analysis" title="Compare rooms" />
          <ComparePanel height={420} mobileHeight={240} title={`${METRIC_LABEL[compareMetric]} — all rooms`} />

          <div className="grid gap-5 max-lg:gap-2.5 lg:grid-cols-3">
            {series.map((s) => {
              const values = seriesValues(s, kind);
              const stats = values.length
                ? [
                    { label: "Now", value: values[values.length - 1] },
                    { label: "Avg", value: values.reduce((a, b) => a + b, 0) / values.length },
                    { label: "Peak", value: Math.max(...values) },
                  ]
                : [];
              return (
                <section
                  key={s.name}
                  className="glass rounded-[22px] p-[20px_22px] max-lg:rounded-[20px] max-lg:p-[16px_18px]"
                >
                  <div className="flex items-center gap-[9px]">
                    <span
                      aria-hidden
                      className="inline-block h-[2.5px] w-[18px] rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="text-sm font-semibold text-ink">{s.name}</span>
                  </div>
                  <div className="mt-3.5 grid grid-cols-3 gap-3">
                    {stats.map((stat) => (
                      <div key={stat.label}>
                        <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-muted">
                          {stat.label}
                        </div>
                        <div className="tnum mt-1 text-[19px] font-semibold text-ink">
                          {formatValue(stat.value, digits)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </PageTransition>
    </Page>
  );
}
