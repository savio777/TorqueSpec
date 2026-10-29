"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, MessagesSquare, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChatBubble, type ChatMessage } from "@/components/chat-message";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatNumber, motorcycleLabel } from "@/lib/format";

const HISTORY_SIZE = 20;
const MAX_QUESTION = 1000;

function Chat() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const manuals = useQuery({
    queryKey: ["manuals", { status: "indexed", page: 1, pageSize: 100 }],
    queryFn: () => api.manuals.list({ status: "indexed", pageSize: 100 }),
  });
  const suggestions = useQuery({ queryKey: ["suggestions"], queryFn: api.rag.suggestions, staleTime: Infinity });

  const manualId = searchParams.get("manualId") ?? manuals.data?.items[0]?.id;
  const manual = manuals.data?.items.find((item) => item.id === manualId);

  const history = useQuery({
    queryKey: ["queries", manualId],
    queryFn: () => api.rag.history({ manualId, pageSize: HISTORY_SIZE }),
    enabled: !!manual,
  });

  // Conversa da sessão atual, por manual. O histórico salvo na API aparece antes dela.
  const [sessions, setSessions] = useState<Record<string, ChatMessage[]>>({});
  const [hiddenHistory, setHiddenHistory] = useState<Record<string, boolean>>({});
  const [question, setQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const session = useMemo(() => (manualId ? (sessions[manualId] ?? []) : []), [manualId, sessions]);
  const messages = useMemo(() => {
    if (!manualId || hiddenHistory[manualId] || !history.data) return session;
    const inSession = new Set(session.flatMap((message) => (message.status === "done" ? [message.response.id] : [])));
    const past: ChatMessage[] = history.data.items
      .filter((item) => !inSession.has(item.id))
      .reverse()
      .map((item) => ({ key: item.id, question: item.question, status: "done", response: item, fromHistory: true }));
    return [...past, ...session];
  }, [manualId, hiddenHistory, history.data, session]);

  const updateSession = (id: string, update: (messages: ChatMessage[]) => ChatMessage[]) =>
    setSessions((current) => ({ ...current, [id]: update(current[id] ?? []) }));

  const ask = useMutation({
    mutationFn: ({ manualId, question }: { manualId: string; question: string; key: string }) => api.rag.ask(manualId, question),
    onSuccess: (response, { manualId, question, key }) => {
      updateSession(manualId, (list) => list.map((m) => (m.key === key ? { key, question, status: "done", response } : m)));
      queryClient.invalidateQueries({ queryKey: ["queries", manualId] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error, { manualId, question, key }) =>
      updateSession(manualId, (list) => list.map((m) => (m.key === key ? { key, question, status: "error", error: errorMessage(error) } : m))),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, ask.isPending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!manualId || trimmed.length < 3 || ask.isPending) return;
    const key = crypto.randomUUID();
    updateSession(manualId, (list) => [...list, { key, question: trimmed, status: "pending" }]);
    ask.mutate({ manualId, question: trimmed, key });
    setQuestion("");
    inputRef.current?.focus();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(question);
    }
  }

  function clearConversation() {
    if (!manualId) return;
    setSessions((current) => ({ ...current, [manualId]: [] }));
    setHiddenHistory((current) => ({ ...current, [manualId]: true }));
  }

  if (manuals.isPending) return <PageLoader />;
  if (manuals.isError) return <Alert>{errorMessage(manuals.error)}</Alert>;
  if (manuals.data.items.length === 0) {
    return (
      <>
        <PageHeader title="Chat RAG" description="Teste as respostas dos manuais indexados." />
        <EmptyState
          icon={<MessagesSquare className="size-8" />}
          title="Nenhum manual indexado"
          description="Envie um PDF e aguarde a indexação para testar perguntas."
          action={
            <Link href="/manuals" className="text-sm text-brand hover:underline">
              Ir para Manuais
            </Link>
          }
        />
      </>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[32rem] flex-col md:h-[calc(100dvh-4rem)]">
      <PageHeader
        title="Chat RAG"
        description="Faça perguntas como um mecânico faria e confira as páginas citadas pela busca híbrida."
        actions={
          <>
            <Select
              aria-label="Manual"
              className="w-72 max-w-full"
              value={manual?.id ?? ""}
              onChange={(e) => router.replace(`${pathname}?manualId=${e.target.value}`)}
            >
              {!manual && <option value="">Manual indisponível — selecione outro</option>}
              {manuals.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {motorcycleLabel(item.motorcycle)}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={clearConversation} disabled={messages.length === 0} title="Limpa a conversa da tela (o histórico continua salvo)">
              <Eraser className="size-4" /> Limpar
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface">
        {manual && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-2.5 text-xs text-muted">
            <span className="font-medium text-fg">{manual.title}</span>
            <span>{motorcycleLabel(manual.motorcycle)}</span>
            <span>{manual.pageCount ?? "?"} páginas</span>
            <span>{formatNumber(manual.chunkCount)} fragmentos</span>
            <Link href={`/manuals/${manual.id}`} className="text-brand hover:underline">
              Inspecionar fragmentos
            </Link>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6" aria-live="polite">
          {!manual ? (
            <EmptyState title="Manual não encontrado ou não indexado" description="Selecione um manual indexado acima." />
          ) : history.isPending && session.length === 0 ? (
            <PageLoader label="Carregando histórico…" />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="size-8" />}
              title="Pergunte algo sobre este manual"
              description="Ex.: torque de aperto, capacidade de óleo, folga de válvulas. As respostas citam a página do PDF."
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((message) => (
                <ChatBubble key={message.key} message={message} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 md:px-6">
          {suggestions.data && suggestions.data.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.data.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  title={suggestion.question}
                  disabled={!manual || ask.isPending}
                  onClick={() => send(suggestion.question)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={question}
              maxLength={MAX_QUESTION}
              disabled={!manual}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo sobre o manual…  (Enter envia, Shift+Enter quebra linha)"
              aria-label="Pergunta"
              className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-border bg-bg px-4 py-2.5 text-sm placeholder:text-subtle focus:border-brand focus:outline-none"
            />
            <Button type="submit" className="h-11 w-11 shrink-0 rounded-xl px-0" disabled={!manual || question.trim().length < 3} loading={ask.isPending} aria-label="Enviar">
              {!ask.isPending && <SendHorizontal className="size-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Chat />
    </Suspense>
  );
}
