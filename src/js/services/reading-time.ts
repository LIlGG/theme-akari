import { replaceTemplateTokens, softlyUpdateText } from "../runtime/context";
import { isAbortError, requestHaloDocument } from "./halo-http";

const READING_CACHE_PREFIX = "akari.reading-time.v1:";

export function estimateReadingMinutes(
  container: ParentNode | null,
  fallbackText = "",
) {
  const clone =
    container instanceof Element
      ? (container.cloneNode(true) as Element)
      : null;
  clone
    ?.querySelectorAll("script, style, noscript, .tag-row")
    .forEach((element) => element.remove());
  const code = clone
    ? [...clone.querySelectorAll("pre")]
        .map((element) => element.textContent ?? "")
        .join(" ")
    : "";
  clone?.querySelectorAll("pre").forEach((element) => element.remove());
  const prose = `${clone?.textContent ?? ""} ${fallbackText}`
    .replace(/\s+/g, " ")
    .trim();
  const cjk =
    prose.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    )?.length ?? 0;
  const words =
    prose
      .replace(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
        " ",
      )
      .match(/[\p{Letter}\p{Number}]+(?:['’.-][\p{Letter}\p{Number}]+)*/gu)
      ?.length ?? 0;
  const codeWords = code.match(/[\p{Letter}\p{Number}_$-]+/gu)?.length ?? 0;
  const media =
    container instanceof Element
      ? container.querySelectorAll("img, video, audio, iframe").length
      : 0;
  const seconds =
    (cjk / 500) * 60 + (words / 220) * 60 + (codeWords / 100) * 60 + media * 8;
  return Math.max(1, Math.ceil(seconds / 60));
}

function cachedMinutes(cacheKey: string) {
  const cached = Number.parseInt(
    window.sessionStorage.getItem(cacheKey) ?? "",
    10,
  );
  return Number.isFinite(cached) && cached > 0 ? cached : null;
}

function cacheMinutes(cacheKey: string, minutes: number) {
  try {
    window.sessionStorage.setItem(cacheKey, String(minutes));
  } catch {
    // Reading time still remains available when storage is disabled.
  }
}

async function fetchReadingMinutes(row: HTMLElement, signal?: AbortSignal) {
  const readingUrl = new URL(
    row.dataset.readingUrl ?? "",
    window.location.origin,
  ).href;
  const cacheKey = `${READING_CACHE_PREFIX}${readingUrl}`;
  const cached = cachedMinutes(cacheKey);
  if (cached !== null) {
    return cached;
  }
  const parsed = await requestHaloDocument(readingUrl, {
    signal,
    headers: { "X-Requested-With": "Akari-Reading-Time" },
  });
  const minutes = estimateReadingMinutes(parsed.querySelector("[data-prose]"));
  cacheMinutes(cacheKey, minutes);
  return minutes;
}

async function resolveReadingMinutes(
  row: HTMLElement,
  value: HTMLElement,
  signal?: AbortSignal,
) {
  const minutes = Number(value.dataset.configuredMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes;
  }
  try {
    return await fetchReadingMinutes(row, signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return estimateReadingMinutes(null, row.dataset.readingFallback ?? "");
  }
}

async function hydrateReadingTime(row: HTMLElement, signal?: AbortSignal) {
  const value = row.querySelector<HTMLElement>("[data-reading-minutes]");
  if (!value) {
    return;
  }
  row.dataset.readingResolved = "pending";
  try {
    const minutes = await resolveReadingMinutes(row, value, signal);
    if (signal?.aborted) {
      return;
    }
    const template = row.dataset.readingTemplate ?? "__MINUTES__ MIN";
    softlyUpdateText(
      value,
      replaceTemplateTokens(template, { MINUTES: Math.round(minutes) }),
    );
    row.dataset.readingResolved = "true";
  } catch (error) {
    if (isAbortError(error)) {
      row.dataset.readingResolved = "false";
      return;
    }
    throw error;
  }
}

export async function hydrateReadingTimes(
  scope: ParentNode,
  selector: string,
  signal?: AbortSignal,
) {
  const rows = [...scope.querySelectorAll<HTMLElement>(selector)].filter(
    (row) => row.dataset.readingResolved !== "true",
  );
  await Promise.allSettled(rows.map((row) => hydrateReadingTime(row, signal)));
}
