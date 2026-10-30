import { LoaderCircle } from "lucide-react";

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <LoaderCircle aria-hidden className={`animate-spin ${className}`} />;
}

export function PageLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}
