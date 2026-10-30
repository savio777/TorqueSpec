"use client";

import type { AskResponse, Citation, QueryHistoryItem } from "@torquespec/shared-types";
import { Bot, ChevronDown, CircleAlert, CircleCheck, FileText } from "lucide-react";
import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Spinner } from "./ui/spinner";

export type ChatMessage =
  | { key: string; question: string; status: "pending" }
  | { key: string; question: string; status: "error"; error: string }
  | { key: string; question: string; status: "done"; response: AskResponse | QueryHistoryItem; fromHistory?: boolean };

/** Mesmo padrão que a API usa para extrair as páginas citadas ("pág. 12", "página 3"…). */
const PAGE_PATTERN = /\bp[áa]g(?:ina|s)?\.?\s*(\d{1,5})\b/gi;

function chunkHref(manualId: string, citation: Citation) {
  return `/manuals/${manualId}?pageNumber=${citation.page}&chunk=${citation.chunkId}`;
}

/** Destaca as referências de página na resposta, ligando-as ao fragmento citado. */
function AnswerText({ text, manualId, citations }: { text: string; manualId: string; citations: Citation[] }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(PAGE_PATTERN)) {
    const index = match.index ?? 0;
    parts.push(text.slice(last, index));
    const citation = citations.find((item) => item.page === Number(match[1]));
    parts.push(
      citation ? (
        <Link key={index} href={chunkHref(manualId, citation)} className="rounded bg-brand-soft px-1 font-medium text-brand hover:underline">
          {match[0]}
        </Link>
      ) : (
        // Página citada que não veio da busca: a API a descartou como possível alucinação.
        <span key={index} title="Página não encontrada no contexto recuperado" className="rounded bg-warn/10 px-1 text-amber-300 line-through decoration-amber-300/60">
          {match[0]}
        </span>
      ),
    );
    last = index + match[0].length;
  }
  parts.push(text.slice(last));
  return <p className="leading-relaxed whitespace-pre-wrap">{parts.map((part, i) => <Fragment key={i}>{part}</Fragment>)}</p>;
}

function Citations({ manualId, citations }: { manualId: string; citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border/60 pt-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ChevronDown aria-hidden className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {citations.length} {citations.length === 1 ? "citação" : "citações"}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {citations.map((citation) => (
            <li key={citation.chunkId} className="rounded-lg border border-border bg-bg/60 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <Link href={chunkHref(manualId, citation)} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
                  <FileText aria-hidden className="size-3.5" /> pág. {citation.page}
                </Link>
                <span className="text-subtle tabular-nums">
                  chunk {citation.chunkId} · score {citation.score.toFixed(4)}
                </span>
              </div>
              <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">{citation.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-surface-2 px-4 py-2.5 text-sm">{message.question}</div>

      <div className="flex max-w-[92%] gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Bot aria-hidden className="size-4" />
        </div>
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-brand/30 bg-surface px-4 py-3 text-sm">
          {message.status === "pending" && (
            <span className="inline-flex items-center gap-2 text-muted">
              <Spinner className="size-4" /> Buscando no manual…
            </span>
          )}
          {message.status === "error" && (
            <span className="inline-flex items-start gap-2 text-red-300">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {message.error}
            </span>
          )}
          {message.status === "done" && <Answer response={message.response} fromHistory={message.fromHistory} />}
        </div>
      </div>
    </div>
  );
}

function Answer({ response, fromHistory }: { response: AskResponse | QueryHistoryItem; fromHistory?: boolean }) {
  return (
    <>
      <AnswerText text={response.answer} manualId={response.manualId} citations={response.citations} />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle">
        {response.grounded ? (
          <span className="inline-flex items-center gap-1 text-green-300">
            <CircleCheck aria-hidden className="size-3.5" /> Com citação
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <CircleAlert aria-hidden className="size-3.5" /> Sem citação válida
          </span>
        )}
        <span>{response.model}</span>
        {"latencyMs" in response && (
          <>
            <span className="tabular-nums">{formatNumber(response.latencyMs)} ms</span>
            <span className="tabular-nums">
              {formatNumber(response.usage.promptTokens)} + {formatNumber(response.usage.completionTokens)} tokens
            </span>
          </>
        )}
        {fromHistory && <span>{formatDateTime(response.createdAt)}</span>}
      </div>
      <Citations manualId={response.manualId} citations={response.citations} />
    </>
  );
}
