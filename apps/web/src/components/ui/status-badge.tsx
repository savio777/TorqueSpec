import type { ManualStatus } from "@torquespec/shared-types";
import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { STATUS_LABEL } from "@/lib/format";

const STYLES: Record<ManualStatus, { className: string; Icon: typeof Clock }> = {
  pending: { className: "border-subtle/40 text-muted", Icon: Clock },
  processing: { className: "border-warn/40 bg-warn/10 text-amber-300", Icon: LoaderCircle },
  indexed: { className: "border-ok/40 bg-ok/10 text-green-300", Icon: CircleCheck },
  failed: { className: "border-danger/40 bg-danger/10 text-red-300", Icon: CircleAlert },
};

export function StatusBadge({ status, progress }: { status: ManualStatus; progress?: number }) {
  const { className, Icon } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>
      <Icon aria-hidden className={`size-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {STATUS_LABEL[status]}
      {status === "processing" && progress !== undefined && <span className="tabular-nums">{progress}%</span>}
    </span>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}
