"use client";

import type { Motorcycle } from "@torquespec/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatBytes, motorcycleLabel } from "@/lib/format";
import { useToast } from "./toast";
import { Button } from "./ui/button";
import { Alert, Card } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { ProgressBar } from "./ui/status-badge";

const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 100);

export function ManualUpload({ motorcycles }: { motorcycles: Motorcycle[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [motorcycleId, setMotorcycleId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [validation, setValidation] = useState<string>();

  const upload = useMutation({
    mutationFn: (input: { file: File; motorcycleId: string; title?: string }) => api.manuals.upload(input, setProgress),
    onSuccess: (manual) => {
      queryClient.invalidateQueries({ queryKey: ["manuals"] });
      queryClient.invalidateQueries({ queryKey: ["motorcycles"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`"${manual.title}" enviado — a indexação começou`);
      setFile(undefined);
      setTitle("");
      setProgress(0);
    },
    onError: () => setProgress(0),
  });

  function pick(candidate: File | undefined) {
    setValidation(undefined);
    upload.reset();
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".pdf") && candidate.type !== "application/pdf") {
      setValidation("Apenas arquivos PDF são aceitos");
      return;
    }
    if (candidate.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setValidation(`O PDF excede ${MAX_UPLOAD_MB} MB`);
      return;
    }
    setFile(candidate);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!upload.isPending) pick(event.dataTransfer.files[0]);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!motorcycleId) return setValidation("Selecione a moto do manual");
    if (!file) return setValidation("Selecione o PDF");
    upload.mutate({ file, motorcycleId, title: title.trim() || undefined });
  }

  const error = validation ?? (upload.isError ? errorMessage(upload.error) : undefined);

  return (
    <Card title="Upload de PDF">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border border-dashed px-5 py-6 transition-colors ${
            dragging ? "border-brand bg-brand-soft" : "border-border bg-bg/40"
          }`}
        >
          {file ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <FileUp aria-hidden className="size-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <span className="text-xs text-muted tabular-nums">{formatBytes(file.size)}</span>
                {!upload.isPending && (
                  <button type="button" onClick={() => setFile(undefined)} aria-label="Remover arquivo" className="text-muted hover:text-fg">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {upload.isPending && (
                <div className="flex items-center gap-3">
                  <ProgressBar value={progress} className="flex-1" />
                  <span className="w-20 text-right text-xs text-muted tabular-nums">
                    {progress < 100 ? `${progress}%` : "Validando…"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2 text-center">
              <FileUp aria-hidden className="size-7 text-subtle" />
              <span className="text-sm">
                Arraste o manual aqui ou <span className="text-brand underline">escolha um arquivo</span>
              </span>
              <span className="text-xs text-muted">.pdf, máx. {MAX_UPLOAD_MB} MB</span>
            </button>
          )}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => {
              pick(e.target.files?.[0]);
              // Limpa a seleção para que escolher o mesmo PDF de novo dispare `change`.
              e.target.value = "";
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Moto">
            <Select value={motorcycleId} onChange={(e) => setMotorcycleId(e.target.value)} disabled={upload.isPending}>
              <option value="">Selecione…</option>
              {motorcycles.map((moto) => (
                <option key={moto.id} value={moto.id}>
                  {motorcycleLabel(moto)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Título (opcional)" hint="Padrão: nome do arquivo">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={upload.isPending} />
          </Field>
        </div>

        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" loading={upload.isPending} disabled={!file || !motorcycleId}>
            Enviar e indexar
          </Button>
        </div>
      </form>
    </Card>
  );
}
