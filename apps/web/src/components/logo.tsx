import { Cog } from "lucide-react";

export function Logo({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Cog aria-hidden className="size-7 text-brand" />
      <div className="leading-tight">
        <p className="text-lg font-bold tracking-tight italic">
          Torque<span className="text-brand">Spec</span>
        </p>
        {subtitle && <p className="text-[11px] text-muted">Painel de Administração · RAG</p>}
      </div>
    </div>
  );
}
