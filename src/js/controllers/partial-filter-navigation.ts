import { animate, stagger } from "motion";
import { canAnimate } from "../runtime/context";
import { isAbortError, requestHaloDocument } from "../services/halo-http";
import { isPlainPrimaryClick } from "../utils/events";

type HistoryMode = "push" | "none";

type PartialFilterOptions = {
  filterLinkSelector: string;
  resultsSelector: string;
  itemSelector: string;
  isDestination: (url: URL) => boolean;
  getFilters: (url: URL) => HTMLElement;
  syncActiveFilter: (url: URL) => void;
  afterSwap: (results: HTMLElement) => void;
  historyState: Record<string, boolean>;
};

function resetResultStyles(results: HTMLElement) {
  results.style.removeProperty("opacity");
  results.style.removeProperty("transform");
}

async function animateResultExit(results: HTMLElement) {
  if (!canAnimate()) {
    return;
  }
  await animate(
    results,
    { opacity: [1, 0], transform: ["translateY(0)", "translateY(-6px)"] },
    { duration: 0.12, ease: "easeIn" },
  ).finished;
}

function prepareResultItems(items: NodeListOf<HTMLElement>) {
  if (!canAnimate()) {
    return;
  }
  for (const item of items) {
    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";
  }
}

function animateResultItems(items: NodeListOf<HTMLElement>) {
  if (!canAnimate() || items.length === 0) {
    return;
  }
  animate(
    items,
    { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
    { duration: 0.3, delay: stagger(0.035), ease: "easeOut" },
  );
}

export function initPartialFilterNavigation(options: PartialFilterOptions) {
  if (!document.querySelector(options.resultsSelector)) {
    return null;
  }
  const lifecycle = new AbortController();
  let requestSequence = 0;
  let requestController: AbortController | null = null;
  lifecycle.signal.addEventListener("abort", () => requestController?.abort(), {
    once: true,
  });

  const navigate = async (destination: URL, historyMode: HistoryMode) => {
    const currentResults = document.querySelector<HTMLElement>(
      options.resultsSelector,
    );
    if (!currentResults) {
      window.location.assign(destination.href);
      return;
    }
    requestController?.abort();
    requestController = new AbortController();
    const sequence = ++requestSequence;
    const filters = options.getFilters(destination);
    filters.classList.add("is-filtering");
    filters.setAttribute("aria-busy", "true");
    currentResults.setAttribute("aria-busy", "true");

    try {
      const parsed = await requestHaloDocument(destination.href, {
        signal: requestController.signal,
        headers: { "X-Requested-With": "Akari-Partial-Navigation" },
      });
      const nextResults = parsed.querySelector<HTMLElement>(
        options.resultsSelector,
      );
      if (!nextResults) {
        throw new Error("Partial response did not contain a results region");
      }
      if (sequence !== requestSequence) {
        return;
      }
      const nextItems = nextResults.querySelectorAll<HTMLElement>(
        options.itemSelector,
      );
      await animateResultExit(currentResults);
      if (sequence !== requestSequence) {
        resetResultStyles(currentResults);
        return;
      }
      prepareResultItems(nextItems);
      currentResults.replaceWith(nextResults);
      options.syncActiveFilter(destination);
      if (parsed.title) {
        document.title = parsed.title;
      }
      if (historyMode === "push") {
        history.pushState(options.historyState, "", destination.href);
      }
      options.afterSwap(nextResults);
      animateResultItems(nextItems);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error(error);
      window.location.assign(destination.href);
    } finally {
      if (sequence === requestSequence) {
        filters.classList.remove("is-filtering");
        filters.removeAttribute("aria-busy");
        document
          .querySelector<HTMLElement>(options.resultsSelector)
          ?.removeAttribute("aria-busy");
      }
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!isPlainPrimaryClick(event)) {
        return;
      }
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        options.filterLinkSelector,
      );
      if (!link || (link.target && link.target !== "_self")) {
        return;
      }
      const destination = new URL(link.href, window.location.href);
      if (!options.isDestination(destination)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (destination.href !== window.location.href) {
        void navigate(destination, "push");
      }
    },
    { capture: true, signal: lifecycle.signal },
  );

  window.addEventListener(
    "popstate",
    () => {
      const destination = new URL(window.location.href);
      if (options.isDestination(destination)) {
        void navigate(destination, "none");
      }
    },
    { signal: lifecycle.signal },
  );
  return lifecycle;
}
