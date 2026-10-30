"use client";

import { CreateMotorcycleInputSchema, type Motorcycle } from "@torquespec/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./toast";
import { Button } from "./ui/button";
import { Alert } from "./ui/card";
import { Field, Input } from "./ui/field";
import { Modal } from "./ui/modal";

type Errors = Partial<Record<"brand" | "model" | "year", string>>;

/** Cria (sem `motorcycle`) ou edita uma moto. Montado com `key` para reiniciar o formulário. */
export function MotorcycleFormModal({ open, motorcycle, onClose }: { open: boolean; motorcycle?: Motorcycle; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [brand, setBrand] = useState(motorcycle?.brand ?? "");
  const [model, setModel] = useState(motorcycle?.model ?? "");
  const [year, setYear] = useState(String(motorcycle?.year ?? new Date().getFullYear()));
  const [errors, setErrors] = useState<Errors>({});

  const save = useMutation({
    mutationFn: (input: { brand: string; model: string; year: number }) =>
      motorcycle ? api.motorcycles.update(motorcycle.id, input) : api.motorcycles.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motorcycles"] });
      queryClient.invalidateQueries({ queryKey: ["manuals"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success(motorcycle ? "Moto atualizada" : "Moto cadastrada");
      onClose();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateMotorcycleInputSchema.safeParse({ brand, model, year: Number(year) });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= key === "year" ? "Ano inválido" : "Campo obrigatório";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={motorcycle ? "Editar moto" : "Nova moto"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="motorcycle-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="motorcycle-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <Field label="Marca" error={errors.brand}>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Yamaha" maxLength={60} autoFocus />
        </Field>
        <Field label="Modelo" error={errors.model}>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="XTZ 250 Lander" maxLength={120} />
        </Field>
        <Field label="Ano" error={errors.year}>
          <Input type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} min={1900} />
        </Field>
      </form>
    </Modal>
  );
}
