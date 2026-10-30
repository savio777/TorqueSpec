"use client";

import type { AdminStats } from "@torquespec/shared-types";
import { useState } from "react";
import { formatNumber } from "@/lib/format";

type Day = AdminStats["usageLast30Days"][number];

const HEIGHT = 160;
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Barras de perguntas por dia (série única), com tooltip por barra e tabela acessível. */
export function UsageChart({ days }: { days: Day[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((day) => day.queries));
  const active = hovered === null ? undefined : days[hovered];

  return (
    <div>
      <div className="relative" onMouseLeave={() => setHovered(null)}>
        {/* grade recessiva: linha de base + linha do máximo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-subtle tabular-nums">
          {formatNumber(max)}
        </span>
        <div className="flex items-end gap-[2px] border-b border-border" style={{ height: HEIGHT }}>
          {days.map((day, index) => (
            <button
              key={day.day}
              type="button"
              aria-label={`${dayLabel(day.day)}: ${day.queries} perguntas`}
              onMouseEnter={() => setHovered(index)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              className="group flex h-full flex-1 items-end focus-visible:outline-none"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${
                  hovered === index ? "bg-brand" : "bg-brand/70 group-focus-visible:bg-brand"
                }`}
                style={{ height: day.queries === 0 ? 0 : Math.max(3, (day.queries / max) * HEIGHT) }}
              />
            </button>
          ))}
        </div>
        {active && hovered !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((hovered + 0.5) / days.length) * 100}%` }}
          >
            <p className="font-medium">{dayLabel(active.day)}</p>
            <p className="text-muted">
              <span className="text-fg tabular-nums">{formatNumber(active.queries)}</span> perguntas
            </p>
            <p className="text-muted">
              <span className="text-fg tabular-nums">{formatNumber(active.promptTokens + active.completionTokens)}</span> tokens
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-subtle">
        <span>{days[0] && dayLabel(days[0].day)}</span>
        <span>{days.at(-1) && dayLabel(days.at(-1)!.day)}</span>
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-fg">Ver tabela</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-subtle">
                <th className="py-1 font-medium">Dia</th>
                <th className="py-1 text-right font-medium">Perguntas</th>
                <th className="py-1 text-right font-medium">Tokens (prompt)</th>
                <th className="py-1 text-right font-medium">Tokens (resposta)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {days.map((day) => (
                <tr key={day.day} className="border-t border-border/60">
                  <td className="py-1">{dayLabel(day.day)}</td>
                  <td className="py-1 text-right">{formatNumber(day.queries)}</td>
                  <td className="py-1 text-right">{formatNumber(day.promptTokens)}</td>
                  <td className="py-1 text-right">{formatNumber(day.completionTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
