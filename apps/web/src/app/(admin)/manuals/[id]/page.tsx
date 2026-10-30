"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader } from "@/components/ui/spinner";
import { ProgressBar, StatusBadge } from "@/components/ui/status-badge";
import { api, errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime, formatNumber, isInProgress, motorcycleLabel } from "@/lib/format";

const PAGE_SIZE = 20;

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function ManualDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageNumber = Number(searchParams.get("pageNumber")) || undefined;
  const highlight = Number(searchParams.get("chunk")) || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [pageInput, setPageInput] = useState(pageNumber ? String(pageNumber) : "");

  const setParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  const manual = useQuery({
    queryKey: ["manuals", id],
    queryFn: () => api.manuals.get(id),
    refetchInterval: (query) => (query.state.data && isInProgress(query.state.data.status) ? 2000 : false),
  });
  const chunks = useQuery({
    queryKey: ["manuals", id, "chunks", { pageNumber, page }],
    queryFn: () => api.manuals.chunks(id, { pageNumber, page, pageSize: PAGE_SIZE }),
    enabled: manual.data?.status === "indexed",
  });

  function filterByPage(event: FormEvent) {
    event.preventDefault();
    setParams({ pageNumber: pageInput.trim() || undefined, page: undefined, chunk: undefined });
  }

  if (manual.isPending) return <PageLoader />;
  if (manual.isError) return <Alert>{errorMessage(manual.error)}</Alert>;
  const data = manual.data;

  return (
    <>
      <Link href="/manuals" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Manuais
      </Link>
      <PageHeader
        title={data.title}
        description={motorcycleLabel(data.motorcycle)}
        actions={
          data.status === "indexed" && (
            <Link
              href={`/chat?manualId=${data.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-solid px-4 text-sm font-medium text-white hover:bg-brand-solid-hover"
            >
              <MessagesSquare className="size-4" /> Testar no chat
            </Link>
          )
        }
      />

      <Card className="mb-6">
        <dl className="grid gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <Info label="Status">
            <StatusBadge status={data.status} progress={data.progress} />
          </Info>
          <Info label="Arquivo">
            <span className="block truncate" title={data.originalFilename}>
              {data.originalFilename}
            </span>
          </Info>
          <Info label="Tamanho">{formatBytes(data.fileSizeBytes)}</Info>
          <Info label="Páginas">{data.pageCount ?? "—"}</Info>
          <Info label="Fragmentos">{formatNumber(data.chunkCount)}</Info>
          <Info label="Indexado em">{data.indexedAt ? formatDateTime(data.indexedAt) : "—"}</Info>
        </dl>
        {data.status === "processing" && (
          <div className="px-5 pb-5">
            <ProgressBar value={data.progress} />
          </div>
        )}
        {data.status === "failed" && data.error && (
          <div className="px-5 pb-5">
            <Alert>{data.error}</Alert>
          </div>
        )}
      </Card>

      <Card
        title="Fragmentos (chunks)"
        actions={
          data.status === "indexed" && (
            <form onSubmit={filterByPage} className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={data.pageCount ?? undefined}
                placeholder="Página do PDF"
                aria-label="Filtrar por página do PDF"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                controlSize="sm"
                className="w-36"
              />
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {pageNumber && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPageInput("");
                    setParams({ pageNumber: undefined, page: undefined, chunk: undefined });
                  }}
                >
                  Limpar
                </Button>
              )}
            </form>
          )
        }
      >
        {data.status !== "indexed" ? (
          <EmptyState icon={<Layers className="size-8" />} title="Fragmentos disponíveis após a indexação" />
        ) : chunks.isPending ? (
          <PageLoader />
        ) : chunks.isError ? (
          <div className="p-5">
            <Alert>{errorMessage(chunks.error)}</Alert>
          </div>
        ) : chunks.data.items.length === 0 ? (
          <EmptyState icon={<Layers className="size-8" />} title={pageNumber ? `Nenhum fragmento na pág. ${pageNumber}` : "Nenhum fragmento"} />
        ) : (
          <>
            <ol className="divide-y divide-border/60">
              {chunks.data.items.map((chunk) => (
                <li
                  key={chunk.id}
                  className={`px-5 py-4 ${chunk.id === highlight ? "bg-brand-soft ring-1 ring-brand/50 ring-inset" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="font-medium text-brand">pág. {chunk.pageNumber}</span>
                    <span>#{chunk.chunkIndex}</span>
                    <span>id {chunk.id}</span>
                    <span>~{formatNumber(chunk.tokenEstimate)} tokens</span>
                  </div>
                  <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg/90">{chunk.content}</p>
                </li>
              ))}
            </ol>
            <Pagination
              page={chunks.data.page}
              pageSize={chunks.data.pageSize}
              total={chunks.data.total}
              onChange={(next) => setParams({ page: String(next) })}
            />
          </>
        )}
      </Card>
    </>
  );
}

export default function ManualDetailPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ManualDetail />
    </Suspense>
  );
}
