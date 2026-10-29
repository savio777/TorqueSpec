"use client";

import { useQuery } from "@tanstack/react-query";
import { Bike, Database, FileText, MessagesSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UsageChart } from "@/components/usage-chart";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";

function StatTile({ label, value, icon, href }: { label: string; value: number; icon: ReactNode; href?: string }) {
  const content = (
    <div className="flex h-full items-start justify-between rounded-xl border border-border bg-surface p-5 transition-colors hover:border-subtle">
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{formatNumber(value)}</p>
      </div>
      <div className="rounded-lg bg-brand-soft p-2 text-brand">{icon}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 30_000 });

  if (stats.isPending) return <PageLoader />;
  if (stats.isError) return <Alert>{errorMessage(stats.error)}</Alert>;

  const { data } = stats;
  const totalManuals = Object.values(data.manuals).reduce((sum, count) => sum + count, 0);
  const tokens30d = data.usageLast30Days.reduce((sum, day) => sum + day.promptTokens + day.completionTokens, 0);
  const queries30d = data.usageLast30Days.reduce((sum, day) => sum + day.queries, 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral da base de manuais e do consumo da LLM." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Modelos de motos" value={data.motorcycles} icon={<Bike className="size-5" />} href="/motorcycles" />
        <StatTile label="Manuais" value={totalManuals} icon={<FileText className="size-5" />} href="/manuals" />
        <StatTile label="Vetores no pgvector" value={data.totalVectors} icon={<Database className="size-5" />} />
        <StatTile label="Perguntas respondidas" value={data.totalQueries} icon={<MessagesSquare className="size-5" />} href="/chat" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Perguntas por dia (últimos 30 dias)" className="lg:col-span-2">
          <div className="px-5 pt-8 pb-5">
            <p className="mb-6 text-sm text-muted">
              <span className="font-medium text-fg tabular-nums">{formatNumber(queries30d)}</span> perguntas ·{" "}
              <span className="font-medium text-fg tabular-nums">{formatNumber(tokens30d)}</span> tokens consumidos
            </p>
            <UsageChart days={data.usageLast30Days} />
          </div>
        </Card>

        <Card title="Manuais por status">
          <ul className="divide-y divide-border/60">
            {(["indexed", "processing", "pending", "failed"] as const).map((status) => (
              <li key={status}>
                <Link href={`/manuals?status=${status}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2">
                  <StatusBadge status={status} />
                  <span className="text-sm font-medium tabular-nums">{formatNumber(data.manuals[status] ?? 0)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
