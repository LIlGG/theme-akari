export type PageFeatureCleanup = () => void;

export type PageFeatureContext = {
  page: HTMLElement;
  pageId: string;
  signal: AbortSignal;
};

export type PageFeatureModule = {
  mount: (
    context: PageFeatureContext,
  ) => void | PageFeatureCleanup | Promise<void | PageFeatureCleanup>;
};

type PageFeatureDefinition = {
  id: string;
  matches: (page: HTMLElement) => boolean;
  load: () => Promise<PageFeatureModule>;
};

const has = (selector: string) => (page: HTMLElement) =>
  page.matches(selector) || Boolean(page.querySelector(selector));

const pageIs =
  (...pageIds: string[]) =>
  (page: HTMLElement) =>
    pageIds.includes(page.dataset.page ?? "");

// Keep this registry declarative. Every literal import() becomes an independent
// Vite chunk, while shared dependencies are still deduplicated automatically.
const features: PageFeatureDefinition[] = [
  {
    id: "content",
    matches: () => true,
    load: () => import("../pages/content"),
  },
  {
    id: "home",
    matches: pageIs("home"),
    load: () => import("../pages/home"),
  },
  {
    id: "posts",
    matches: pageIs("posts", "category", "tag", "author"),
    load: () => import("../pages/posts"),
  },
  {
    id: "photos",
    matches: pageIs("photos"),
    load: () => import("../pages/photos"),
  },
  {
    id: "moments",
    matches: pageIs("moments", "moment"),
    load: () => import("../pages/moments"),
  },
  {
    id: "archives",
    matches: pageIs("archives"),
    load: () => import("../pages/archives"),
  },
  {
    id: "article",
    matches: pageIs("post", "media-post"),
    load: () => import("../pages/article"),
  },
  {
    id: "media-room",
    matches: pageIs("media"),
    load: () => import("../pages/media-room"),
  },
  {
    id: "audio",
    matches: has("[data-audio-toggle]"),
    load: () => import("../features/audio"),
  },
  {
    id: "lightbox",
    matches: has("[data-lightbox-trigger]"),
    load: () => import("../features/lightbox"),
  },
  {
    id: "article-comments",
    matches: has("[data-akari-article-comments]"),
    load: () => import("../features/article-comments"),
  },
  {
    id: "guestbook",
    matches: has("[data-akari-guestbook]"),
    load: () => import("../features/guestbook"),
  },
];

const activeCleanups: PageFeatureCleanup[] = [];
let activeController: AbortController | null = null;
let activeMount: Promise<void> | null = null;
let activePage: HTMLElement | null = null;
let generation = 0;

function matchedFeatures(scope: ParentNode) {
  const page = scope.querySelector<HTMLElement>("[data-page]");
  if (!page) {
    return [];
  }
  return features.filter((feature) => feature.matches(page));
}

export async function preloadPageFeatures(scope: ParentNode) {
  await Promise.allSettled(
    matchedFeatures(scope).map((feature) => feature.load()),
  );
}

export function disposePageFeatures() {
  generation += 1;
  activeController?.abort();
  activeController = null;
  activeMount = null;
  activePage = null;
  activeCleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.warn("Akari page feature cleanup failed", error);
      }
    });
}

export function mountPageFeatures() {
  const page = document.querySelector<HTMLElement>("[data-page]");
  if (!page) {
    return Promise.resolve();
  }
  if (page === activePage && activeMount) {
    return activeMount;
  }

  disposePageFeatures();
  activePage = page;
  activeMount = mountPage(page);
  return activeMount;
}

async function mountPage(page: HTMLElement) {
  const currentGeneration = generation;
  const controller = new AbortController();
  activeController = controller;
  const context: PageFeatureContext = {
    page,
    pageId: page.dataset.page ?? "page",
    signal: controller.signal,
  };
  const matched = matchedFeatures(document);
  const loaded = await Promise.allSettled(
    matched.map(async (feature) => ({
      feature,
      module: await feature.load(),
    })),
  );

  if (
    controller.signal.aborted ||
    currentGeneration !== generation ||
    page !== document.querySelector<HTMLElement>("[data-page]")
  ) {
    return;
  }

  for (const result of loaded) {
    if (result.status === "rejected") {
      console.error("Akari page feature failed to load", result.reason);
      continue;
    }
    try {
      const cleanup = await result.value.module.mount(context);
      if (typeof cleanup === "function") {
        activeCleanups.push(cleanup);
      }
    } catch (error) {
      console.error(
        `Akari page feature \"${result.value.feature.id}\" failed to mount`,
        error,
      );
    }
  }
}
