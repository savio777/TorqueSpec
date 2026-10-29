"use client";

import type { Motorcycle } from "@torquespec/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MotorcycleFormModal } from "@/components/motorcycle-form";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { Table, Td, Th } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, motorcycleLabel } from "@/lib/format";

type FormState = { open: false } | { open: true; motorcycle?: Motorcycle };

export default function MotorcyclesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const motorcycles = useQuery({ queryKey: ["motorcycles"], queryFn: api.motorcycles.list });
  const [form, setForm] = useState<FormState>({ open: false });
  const [deleting, setDeleting] = useState<Motorcycle>();

  const remove = useMutation({
    mutationFn: (id: string) => api.motorcycles.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motorcycles"] });
      queryClient.invalidateQueries({ queryKey: ["manuals"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Moto removida");
      setDeleting(undefined);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const newButton = (
    <Button onClick={() => setForm({ open: true })}>
      <Plus className="size-4" /> Nova moto
    </Button>
  );

  return (
    <>
      <PageHeader title="Modelos de Motos" description="Cadastre os modelos aos quais os manuais serão vinculados." actions={newButton} />

      <Card>
        {motorcycles.isPending ? (
          <PageLoader />
        ) : motorcycles.isError ? (
          <div className="p-5">
            <Alert>{errorMessage(motorcycles.error)}</Alert>
          </div>
        ) : motorcycles.data.length === 0 ? (
          <EmptyState icon={<Bike className="size-8" />} title="Nenhuma moto cadastrada" description="Cadastre um modelo para começar a enviar manuais." action={newButton} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Marca</Th>
                <Th>Modelo</Th>
                <Th>Ano</Th>
                <Th>Manuais</Th>
                <Th>Cadastro</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {motorcycles.data.map((moto) => (
                <tr key={moto.id} className="hover:bg-surface-2/50">
                  <Td className="font-medium">{moto.brand}</Td>
                  <Td>{moto.model}</Td>
                  <Td className="tabular-nums">{moto.year}</Td>
                  <Td>
                    <Link href={`/manuals?motorcycleId=${moto.id}`} className="text-brand hover:underline">
                      {moto.manualCount} {moto.manualCount === 1 ? "manual" : "manuais"}
                    </Link>
                  </Td>
                  <Td className="text-muted">{formatDateTime(moto.createdAt)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, motorcycle: moto })} aria-label={`Editar ${motorcycleLabel(moto)}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(moto)} aria-label={`Excluir ${motorcycleLabel(moto)}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {form.open && (
        <MotorcycleFormModal key={form.motorcycle?.id ?? "new"} open motorcycle={form.motorcycle} onClose={() => setForm({ open: false })} />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Excluir moto"
        loading={remove.isPending}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        message={
          deleting && (
            <>
              Excluir <strong className="text-fg">{motorcycleLabel(deleting)}</strong>?
              {deleting.manualCount > 0 && (
                <> Os {deleting.manualCount} manuais vinculados, seus fragmentos e PDFs também serão removidos.</>
              )}{" "}
              Esta ação não pode ser desfeita.
            </>
          )
        }
      />
    </>
  );
}
