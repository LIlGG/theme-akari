import {
  isChineseLocale,
  replaceTemplateTokens,
  softlyUpdateText,
} from "../runtime/context";
import { hydrateReadingTimes } from "../services/reading-time";
import {
  isAbortError,
  requestHalo,
  requestHaloDocument,
  walkHaloDocuments,
} from "../services/halo-http";
import { initLiveWeather } from "./home-weather";

type ArchiveSnapshot = {
  posts: number;
  years: number;
  earliestYear: number | null;
};

async function fetchArchiveSnapshot(
  startUrl: string,
  signal?: AbortSignal,
): Promise<ArchiveSnapshot> {
  const cacheKey = `akari.archive-snapshot.v3:${startUrl}`;
  const cached = readArchiveSnapshot(cacheKey);
  if (cached) {
    return cached;
  }

  const years = new Set<string>();
  let posts = 0;
  const walkResult = await walkHaloDocuments(startUrl, {
    signal,
    visit: (parsed) => {
      const results = parsed.querySelector<HTMLElement>(
        "[data-archive-results]",
      );
      if (!results) {
        throw new Error("Archive snapshot response did not contain results");
      }
      posts = Math.max(
        posts,
        Number.parseInt(results.dataset.total ?? "0", 10) || 0,
      );
      for (const section of results.querySelectorAll<HTMLElement>(
        "[data-archive-year-section]",
      )) {
        if (section.dataset.archiveYear) {
          years.add(section.dataset.archiveYear);
        }
      }
      return results.querySelector<HTMLAnchorElement>(
        "[data-load-more-archives]",
      )?.href;
    },
  });
  const numericYears = [...years].map(Number).filter(Number.isFinite);
  const snapshot = {
    posts,
    years: years.size,
    earliestYear: numericYears.length ? Math.min(...numericYears) : null,
  };
  if (!walkResult.nextUrl) {
    writeArchiveSnapshot(cacheKey, snapshot);
  }
  return snapshot;
}

function readArchiveSnapshot(cacheKey: string) {
  try {
    const cached = JSON.parse(
      window.sessionStorage.getItem(cacheKey) ?? "null",
    ) as ArchiveSnapshot | null;
    if (
      cached &&
      Number.isFinite(cached.posts) &&
      Number.isFinite(cached.years) &&
      (cached.earliestYear === null || Number.isFinite(cached.earliestYear))
    ) {
      return cached;
    }
  } catch {
    // Continue with fresh data.
  }
  return null;
}

function writeArchiveSnapshot(cacheKey: string, snapshot: ArchiveSnapshot) {
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures.
  }
}

async function updatePhotoCount(photoCount: HTMLElement, signal?: AbortSignal) {
  const photosUrl =
    photoCount.closest<HTMLAnchorElement>("a[href]")?.href ?? "/photos";
  const parsed = await requestHaloDocument(photosUrl, {
    signal,
  });
  signal?.throwIfAborted();
  const total = Number.parseInt(
    parsed.querySelector<HTMLElement>("[data-photo-continuation]")?.dataset
      .total ?? "0",
    10,
  );
  softlyUpdateText(
    photoCount,
    replaceTemplateTokens(photoCount.dataset.countTemplate ?? "__COUNT__", {
      COUNT: total,
    }),
  );
}

async function updateArchiveCount(
  archiveMeta: HTMLElement,
  signal?: AbortSignal,
) {
  const snapshot = await fetchArchiveSnapshot(
    archiveMeta.dataset.archiveUrl ?? "/archives",
    signal,
  );
  const configuredPosts = Number.parseInt(
    archiveMeta.dataset.postCount ?? "0",
    10,
  );
  softlyUpdateText(
    archiveMeta,
    replaceTemplateTokens(
      archiveMeta.dataset.countTemplate ?? "__POSTS__ · __YEARS__",
      {
        POSTS: Math.max(configuredPosts, snapshot.posts),
        YEARS: snapshot.years,
      },
    ),
  );
}

async function updateGuestbookCount(
  guestbookMeta: HTMLElement,
  signal?: AbortSignal,
) {
  const guestbookUrl = guestbookMeta.dataset.guestbookUrl;
  if (!guestbookUrl) {
    return;
  }
  const parsed = await requestHaloDocument(guestbookUrl, { signal });
  const guestbook = parsed.querySelector<HTMLElement>("[data-akari-guestbook]");
  if (!guestbook?.dataset.commentName) {
    throw new Error("Guestbook subject metadata was unavailable");
  }
  const query = new URLSearchParams({
    group: guestbook.dataset.commentGroup ?? "content.halo.run",
    version: guestbook.dataset.commentVersion ?? "v1alpha1",
    kind: guestbook.dataset.commentKind ?? "SinglePage",
    name: guestbook.dataset.commentName,
    page: "1",
    size: "1",
    withReplies: "false",
  });
  const payload = await requestHalo<{ total?: number }>(
    `/apis/api.halo.run/v1alpha1/comments?${query}`,
    {
      signal,
    },
  );
  const total = Number.isFinite(payload.total) ? (payload.total ?? 0) : 0;
  softlyUpdateText(
    guestbookMeta,
    replaceTemplateTokens(guestbookMeta.dataset.countTemplate ?? "__COUNT__", {
      COUNT: total,
    }),
  );
}

function runOptionalUpdate(task: Promise<void>, warning: string) {
  void task.catch((error: unknown) => {
    if (!isAbortError(error)) {
      console.warn(warning, error);
    }
  });
}

function initHomeCounts(signal?: AbortSignal) {
  const photoCount = document.querySelector<HTMLElement>(
    "[data-home-photo-count]",
  );
  const archiveMeta = document.querySelector<HTMLElement>(
    "[data-home-archive-meta]",
  );
  const guestbookMeta = document.querySelector<HTMLElement>(
    "[data-home-guestbook-meta]",
  );
  if (photoCount) {
    runOptionalUpdate(
      updatePhotoCount(photoCount, signal),
      "Akari photo count could not be updated",
    );
  }
  if (archiveMeta) {
    runOptionalUpdate(
      updateArchiveCount(archiveMeta, signal),
      "Akari archive count could not be updated",
    );
  }
  if (guestbookMeta) {
    runOptionalUpdate(
      updateGuestbookCount(guestbookMeta, signal),
      "Akari guestbook count could not be updated",
    );
  }
}

export function initHomeDynamicData(signal?: AbortSignal) {
  if (!document.querySelector(".home-view")) {
    return;
  }
  void initLiveWeather(signal);
  void hydrateReadingTimes(document, "[data-home-reading-time]", signal);
  initHomeCounts(signal);
}

function joinCategoryNames(names: string[]) {
  if (!names.length) {
    return "";
  }
  if (!isChineseLocale()) {
    return new Intl.ListFormat(document.documentElement.lang || "en", {
      style: "long",
      type: "conjunction",
    }).format(names);
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]}与${names[1]}`;
  }
  return `${names.slice(0, -1).join("、")}与${names.at(-1)}`;
}

export function initPostsIntro(signal?: AbortSignal) {
  const intro = document.querySelector<HTMLElement>("[data-posts-intro]");
  const summary = intro?.querySelector<HTMLElement>("[data-posts-summary]");
  if (!intro || !summary) {
    return;
  }
  if (summary.dataset.summarySource === "page") {
    return;
  }

  const categoryNames = [
    ...intro.querySelectorAll<HTMLElement>("[data-posts-category]"),
  ]
    .map((category) => ({
      name: category.dataset.categoryName?.trim() ?? "",
      count: Number.parseInt(category.dataset.categoryCount ?? "0", 10) || 0,
    }))
    .filter((category) => category.name)
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name),
    )
    .slice(0, 3)
    .map((category) => category.name);
  const categories =
    joinCategoryNames(categoryNames) ||
    intro.dataset.emptyCategories ||
    "Stories";
  const posts = Number.parseInt(intro.dataset.postCount ?? "0", 10) || 0;
  const withoutYear =
    intro.dataset.summaryWithoutYearTemplate ?? "__CATEGORIES__ · __POSTS__";
  const update = (template: string, year?: number | null) => {
    softlyUpdateText(
      summary,
      replaceTemplateTokens(template, {
        CATEGORIES: categories,
        POSTS: posts,
        YEAR: year ?? "",
      }),
    );
  };

  update(withoutYear);
  void fetchArchiveSnapshot(intro.dataset.archiveUrl ?? "/archives", signal)
    .then((snapshot) => {
      if (!snapshot.earliestYear) {
        return;
      }
      update(
        intro.dataset.summaryTemplate ?? withoutYear,
        snapshot.earliestYear,
      );
    })
    .catch((error) => {
      if (!isAbortError(error)) {
        console.warn(
          "Akari posts summary could not read the archive seasons",
          error,
        );
      }
    });
}
