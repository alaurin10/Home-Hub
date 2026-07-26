/** Temperature scale is a *display* preference and nothing more.
 *
 * Everything upstream — the API, history, thresholds, the score — stays in °F,
 * the unit the nodes report. Converting anywhere but at the point of rendering
 * would mean thresholds in one unit and readings in another, which is how a
 * comfort band silently becomes wrong. So: convert here, at the last moment,
 * and never write a converted value back into the store.
 */
import type { AppSettings } from "../api/types";

export type Scale = "F" | "C";

export const f_to_c = (f: number) => ((f - 32) * 5) / 9;

/** Convert a °F value for display under the active scale. */
export function displayTemp(fahrenheit: number, scale: Scale): number {
  return scale === "C" ? f_to_c(fahrenheit) : fahrenheit;
}

/** A °F *difference* — no 32° offset, only the ratio. */
export function displayTempDelta(fahrenheitDelta: number, scale: Scale): number {
  return scale === "C" ? (fahrenheitDelta * 5) / 9 : fahrenheitDelta;
}

export const tempUnit = (scale: Scale) => (scale === "C" ? "°C" : "°F");

export const scaleOf = (settings: AppSettings | null): Scale => settings?.scale ?? "F";

/** True when a metric's values are temperatures and so need conversion. */
export const isTemperatureMetric = (metric: string) =>
  metric === "temperature" || metric === "dew_point";
