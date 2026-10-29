import type { ManualStatus } from "@torquespec/shared-types";

const numberFormat = new Intl.NumberFormat("pt-BR");
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const formatNumber = (value: number) => numberFormat.format(value);

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_LABEL: Record<ManualStatus, string> = {
  pending: "Na fila",
  processing: "Processando",
  indexed: "Indexado",
  failed: "Falhou",
};

export const isInProgress = (status: ManualStatus) => status === "pending" || status === "processing";

export const motorcycleLabel = (moto: { brand: string; model: string; year: number }) =>
  `${moto.brand} ${moto.model} ${moto.year}`;
