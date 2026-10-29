import type {
  AdminStats,
  AskResponse,
  AuthResponse,
  CreateMotorcycleInput,
  ErrorResponse,
  LoginInput,
  Manual,
  ManualChunk,
  ManualStatus,
  Motorcycle,
  QueryHistoryItem,
  Suggestion,
  UpdateMotorcycleInput,
  User,
} from "@torquespec/shared-types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333").replace(/\/$/, "");

const TOKEN_KEY = "torquespec.token";

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Erro no formato padrão da API: `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

/** Chamado quando a API responde 401 (token expirado/inválido). */
let onUnauthorized: (() => void) | undefined;
export const setUnauthorizedHandler = (handler: (() => void) | undefined) => {
  onUnauthorized = handler;
};

function toApiError(status: number, body: unknown): ApiError {
  const error = (body as Partial<ErrorResponse> | null)?.error;
  if (error) return new ApiError(status, error.code, error.message, error.details);
  return new ApiError(status, "HTTP_ERROR", `Falha na requisição (HTTP ${status})`);
}

function handleUnauthorized(status: number, path: string) {
  if (status === 401 && !path.startsWith("/v1/auth/login")) {
    tokenStore.clear();
    onUnauthorized?.();
  }
}

type Query = Record<string, string | number | undefined>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", `Não foi possível conectar à API em ${API_URL}`);
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    handleUnauthorized(response.status, path);
    throw toApiError(response.status, body);
  }
  return body as T;
}

/**
 * Upload multipart com progresso de envio — `fetch` não expõe o progresso do corpo,
 * então aqui usamos XMLHttpRequest.
 */
function uploadManual(
  input: { file: File; motorcycleId: string; title?: string },
  onProgress?: (percent: number) => void,
): Promise<Manual> {
  const form = new FormData();
  // Os campos de texto vão antes do arquivo para a API lê-los sem precisar bufferizar o PDF.
  form.append("motorcycleId", input.motorcycleId);
  if (input.title) form.append("title", input.title);
  form.append("file", input.file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl("/v1/manuals"));
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", `Não foi possível conectar à API em ${API_URL}`));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as Manual);
      handleUnauthorized(xhr.status, "/v1/manuals");
      reject(toApiError(xhr.status, xhr.response));
    };
    xhr.send(form);
  });
}

export const api = {
  login: (input: LoginInput) => request<AuthResponse>("POST", "/v1/auth/login", { body: input }),
  me: () => request<User>("GET", "/v1/auth/me"),

  stats: () => request<AdminStats>("GET", "/v1/admin/stats"),

  motorcycles: {
    list: () => request<Motorcycle[]>("GET", "/v1/motorcycles"),
    create: (input: CreateMotorcycleInput) => request<Motorcycle>("POST", "/v1/motorcycles", { body: input }),
    update: (id: string, input: UpdateMotorcycleInput) =>
      request<Motorcycle>("PATCH", `/v1/motorcycles/${id}`, { body: input }),
    remove: (id: string) => request<void>("DELETE", `/v1/motorcycles/${id}`),
  },

  manuals: {
    list: (query: { page?: number; pageSize?: number; motorcycleId?: string; status?: ManualStatus } = {}) =>
      request<Paginated<Manual>>("GET", "/v1/manuals", { query }),
    get: (id: string) => request<Manual>("GET", `/v1/manuals/${id}`),
    upload: uploadManual,
    reindex: (id: string) => request<Manual>("POST", `/v1/manuals/${id}/reindex`),
    remove: (id: string) => request<void>("DELETE", `/v1/manuals/${id}`),
    chunks: (id: string, query: { page?: number; pageSize?: number; pageNumber?: number } = {}) =>
      request<Paginated<ManualChunk>>("GET", `/v1/manuals/${id}/chunks`, { query }),
  },

  rag: {
    ask: (manualId: string, question: string) =>
      request<AskResponse>("POST", `/v1/manuals/${manualId}/ask`, { body: { question } }),
    history: (query: { manualId?: string; page?: number; pageSize?: number } = {}) =>
      request<Paginated<QueryHistoryItem>>("GET", "/v1/queries", { query }),
    suggestions: () => request<Suggestion[]>("GET", "/v1/suggestions"),
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erro inesperado";
}
