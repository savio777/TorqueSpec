"use client";

import { ManualStatusSchema, type Manual } from "@torquespec/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, MessagesSquare, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ManualUpload } from "@/components/manual-upload";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader } from "@/components/ui/spinner";
import { ProgressBar, StatusBadge } from "@/components/ui/status-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { formatBytes, formatNumber, isInProgress, motorcycleLabel, STATUS_LABEL } from "@/lib/format";

const PAGE_SIZE = 20;

function ManualsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const motorcycleId = searchParams.get("motorcycleId") ?? undefined;
  const statusParam = ManualStatusSchema.safeParse(searchParams.get("status"));
  const status = statusParam.success ? statusParam.data : undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [deleting, setDeleting] = useState<Manual>();

  const setParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  const motorcycles = useQuery({ queryKey: ["motorcycles"], queryFn: api.motorcycles.list });
  const manuals = useQuery({
    queryKey: ["manuals", { motorcycleId, status, page }],
    queryFn: () => api.manuals.list({ motorcycleId, status, page, pageSize: PAGE_SIZE }),
    // Enquanto houver manual na fila/processando, acompanha o progresso do worker.
    refetchInterval: (query) => (query.state.data?.items.some((manual) => isInProgress(manual.status)) ? 2000 : false),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["manuals"] });
    queryClient.invalidateQueries({ queryKey: ["motorcycles"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const reindex = useMutation({
    mutationFn: (id: string) => api.manuals.reindex(id),
    onSuccess: (manual) => {
      invalidate();
      toast.success(`Reindexação de "${manual.title}" agendada`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.manuals.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Manual removido");
      setDeleting(undefined);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader title="Manuais" description="Envie PDFs, acompanhe a indexação e teste as respostas no chat RAG." />

      <div className="flex flex-col gap-6">
        {motorcycles.data && motorcycles.data.length === 0 ? (
          <Alert tone="info">
            Cadastre uma moto em{" "}
            <Link href="/motorcycles" className="underline">
              Modelos de Motos
            </Link>{" "}
            antes de enviar manuais.
          </Alert>
        ) : (
          <ManualUpload motorcycles={motorcycles.data ?? []} />
        )}

        <Card
          title="Manuais cadastrados"
          actions={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Filtrar por moto"
                controlSize="sm"
                className="w-auto"
                value={motorcycleId ?? ""}
                onChange={(e) => setParams({ motorcycleId: e.target.value || undefined, page: undefined })}
              >
                <option value="">Todas as motos</option>
                {motorcycles.data?.map((moto) => (
                  <option key={moto.id} value={moto.id}>
                    {motorcycleLabel(moto)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filtrar por status"
                controlSize="sm"
                className="w-auto"
                value={status ?? ""}
                onChange={(e) => setParams({ status: e.target.value || undefined, page: undefined })}
              >
                <option value="">Todos os status</option>
                {ManualStatusSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
          }
        >
          {manuals.isPending ? (
            <PageLoader />
          ) : manuals.isError ? (
            <div className="p-5">
              <Alert>{errorMessage(manuals.error)}</Alert>
            </div>
          ) : manuals.data.items.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8" />}
              title="Nenhum manual encontrado"
              description={motorcycleId || status ? "Ajuste os filtros para ver outros manuais." : "Envie o primeiro PDF acima."}
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Manual</Th>
                    <Th>Moto</Th>
                    <Th>Páginas</Th>
                    <Th>Fragmentos</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {manuals.data.items.map((manual) => (
                    <tr key={manual.id} className="hover:bg-surface-2/50">
                      <Td className="max-w-56">
                        <Link href={`/manuals/${manual.id}`} className="block truncate font-medium hover:text-brand">
                          {manual.title}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {manual.originalFilename} · {formatBytes(manual.fileSizeBytes)}
                        </span>
                      </Td>
                      <Td>{motorcycleLabel(manual.motorcycle)}</Td>
                      <Td className="tabular-nums">{manual.pageCount ?? "—"}</Td>
                      <Td className="tabular-nums">{formatNumber(manual.chunkCount)}</Td>
                      <Td>
                        <StatusBadge status={manual.status} progress={manual.progress} />
                        {manual.status === "processing" && <ProgressBar value={manual.progress} className="mt-2 w-28" />}
                        {manual.status === "failed" && manual.error && (
                          <p className="mt-1 max-w-48 truncate text-xs text-red-300" title={manual.error}>
                            {manual.error}
                          </p>
                        )}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {manual.status === "indexed" && (
                          <Link
                            href={`/chat?manualId=${manual.id}`}
                            aria-label={`Testar ${manual.title} no chat`}
                            title="Testar no chat"
                            className="inline-flex h-8 items-center rounded-lg px-3 text-muted hover:bg-surface-2 hover:text-fg"
                          >
                            <MessagesSquare className="size-4" />
                          </Link>
                        )}
                        <Link
                          href={`/manuals/${manual.id}`}
                          aria-label={`Inspecionar fragmentos de ${manual.title}`}
                          title="Inspecionar fragmentos"
                          className="inline-flex h-8 items-center rounded-lg px-3 text-muted hover:bg-surface-2 hover:text-fg"
                        >
                          <Search className="size-4" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Reindexar"
                          aria-label={`Reindexar ${manual.title}`}
                          disabled={isInProgress(manual.status) || (reindex.isPending && reindex.variables === manual.id)}
                          onClick={() => reindex.mutate(manual.id)}
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Excluir" aria-label={`Excluir ${manual.title}`} onClick={() => setDeleting(manual)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={manuals.data.page}
                pageSize={manuals.data.pageSize}
                total={manuals.data.total}
                onChange={(next) => setParams({ page: String(next) })}
              />
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Excluir manual"
        loading={remove.isPending}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        message={
          deleting && (
            <>
              Excluir <strong className="text-fg">{deleting.title}</strong>? O PDF, os {formatNumber(deleting.chunkCount)} fragmentos e o
              histórico de perguntas deste manual serão removidos.
            </>
          )
        }
      />
    </>
  );
}

export default function ManualsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ManualsContent />
    </Suspense>
  );
}
