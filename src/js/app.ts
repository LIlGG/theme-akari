import { installAstroLifecycle } from "./lifecycle/astro";
import {
  disposePageFeatures,
  mountPageFeatures,
  preloadPageFeatures,
} from "./lifecycle/page-features";
import { preparePageMotion } from "./lifecycle/motion-preparation";
import { root } from "./runtime/context";
import {
  initPageTransitions,
  syncAstroDocumentState,
} from "./controllers/navigation";
import {
  closeNavigationOverlays,
  initHeader,
  initSearch,
  initTheme,
} from "./controllers/shell";
import { initUtilities } from "./controllers/utilities";

root.classList.add("motion-ready");

let persistentPlayerPromise: Promise<unknown> | null = null;
const loadPersistentPlayer = () => {
  persistentPlayerPromise ??= import("./persistent-player").then((module) =>
    module.initPersistentPlayer(),
  );
  return persistentPlayerPromise;
};

window.addEventListener(
  "akari:player:request",
  () => void loadPersistentPlayer(),
  { once: true },
);
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(() => void loadPersistentPlayer(), {
    timeout: 1200,
  });
} else {
  globalThis.setTimeout(() => void loadPersistentPlayer(), 320);
}

initPageTransitions();
initHeader();
initTheme();
initSearch();
initUtilities();

const waitWithin = async (task: Promise<unknown>, milliseconds: number) => {
  let timer = 0;
  await Promise.race([
    task,
    new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, milliseconds);
    }),
  ]);
  window.clearTimeout(timer);
};

const primeComments = async (scope: ParentNode, signal?: AbortSignal) => {
  if (
    !scope.querySelector(
      "[data-akari-guestbook], [data-akari-article-comments]",
    )
  ) {
    return;
  }
  const { primeCommentPage } = await import("./services/comment-prime");
  await primeCommentPage(scope, signal);
};

const mountCurrentPage = () =>
  mountPageFeatures().finally(() => root.classList.remove("motion-stage"));

// Stage visual motion synchronously, then mount the initial document once.
// Route features remain split into independent modules; their import begins
// immediately instead of waiting until Astro reports an already-visible page.
preparePageMotion(document);
void primeComments(document);
void mountCurrentPage();

installAstroLifecycle({
  beforePreparation: closeNavigationOverlays,
  prepareDocument: async (newDocument, signal) => {
    preparePageMotion(newDocument);
    await waitWithin(
      Promise.all([
        preloadPageFeatures(newDocument),
        primeComments(newDocument, signal),
      ]),
      650,
    );
  },
  beforeSwap: disposePageFeatures,
  afterSwap: () => {
    syncAstroDocumentState();
    void mountCurrentPage();
  },
});
