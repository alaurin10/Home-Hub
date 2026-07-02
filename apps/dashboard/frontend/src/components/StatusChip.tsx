import { STATUS_COLOR, STATUS_LABEL, type Status } from "../lib/thresholds";

/** Status = colored dot + text label, never color alone. */
export function StatusChip({ status, label }: { status: Status | null; label?: string }) {
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
