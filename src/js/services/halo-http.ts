export type HaloRequestError = Error & {
  data?: Record<string, unknown>;
  requireCaptcha?: boolean;
  status?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function requestHalo<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data: unknown = contentType.includes("json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(
      isRecord(data) && "detail" in data
        ? String(data.detail)
        : response.statusText || `Halo request failed with ${response.status}`,
    ) as HaloRequestError;
    error.status = response.status;
    error.data = isRecord(data) ? data : undefined;
    error.requireCaptcha = response.headers.has("X-Require-Captcha");
    throw error;
  }

  return data as T;
}

export async function requestHaloDocument(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "text/html",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Halo document request failed with ${response.status}`);
  }
  return new DOMParser().parseFromString(await response.text(), "text/html");
}

type DocumentWalkOptions = {
  signal?: AbortSignal;
  headers?: HeadersInit;
  maxPages?: number;
  visit: (document: Document, url: string) => string | null | undefined;
};

export async function walkHaloDocuments(
  startUrl: string,
  options: DocumentWalkOptions,
) {
  const visited = new Set<string>();
  let nextUrl: string | null = new URL(startUrl, window.location.origin).href;
  const maxPages = options.maxPages ?? 60;
  while (nextUrl && visited.size < maxPages) {
    options.signal?.throwIfAborted();
    if (visited.has(nextUrl)) {
      break;
    }
    visited.add(nextUrl);
    const parsed = await requestHaloDocument(nextUrl, {
      signal: options.signal,
      headers: options.headers,
    });
    const candidate = options.visit(parsed, nextUrl);
    nextUrl = candidate
      ? new URL(candidate, window.location.origin).href
      : null;
  }
  return {
    nextUrl,
    pagesVisited: visited.size,
  };
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
