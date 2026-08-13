import { root } from "../runtime/context";
import { initGalleryLayout, initPhotoLoadMore } from "./gallery";
import { initImageFallbacks } from "./utilities";
import { initPartialFilterNavigation } from "./partial-filter-navigation";
import { initPostList } from "./posts";

let postFilterLifecycle: AbortController | null = null;
let photoGroupLifecycle: AbortController | null = null;

const normalizePath = (url: URL) => url.pathname.replace(/\/+$/, "") || "/";

export function initPostFilterNavigation() {
  postFilterLifecycle?.abort();
  const filterRows = [
    ...document.querySelectorAll<HTMLElement>("[data-post-filters]"),
  ];
  if (filterRows.length === 0) {
    return;
  }

  const rowContainsDestination = (row: HTMLElement, destination: URL) =>
    [...row.querySelectorAll<HTMLAnchorElement>("a[href]")].some((link) => {
      const linkUrl = new URL(link.href, window.location.href);
      return (
        linkUrl.origin === destination.origin &&
        normalizePath(linkUrl) === normalizePath(destination)
      );
    });

  const getFilterMode = (url: URL): "tag" | "category" => {
    if (url.searchParams.get("filter") === "tags") {
      return "tag";
    }
    const matchingRow = filterRows.find((row) =>
      rowContainsDestination(row, url),
    );
    return matchingRow?.dataset.postFilterMode === "tag" ? "tag" : "category";
  };

  const getFilters = (url: URL) => {
    const mode = getFilterMode(url);
    root.dataset.postFilterMode = mode;
    return (
      filterRows.find((row) => row.dataset.postFilterMode === mode) ??
      filterRows[0]
    );
  };

  const isPostsLanding = (url: URL) =>
    filterRows.some((row) => {
      const postsUrl = row.dataset.postsUrl;
      if (!postsUrl) {
        return false;
      }
      return (
        normalizePath(new URL(postsUrl, window.location.href)) ===
        normalizePath(url)
      );
    });

  const isDestination = (url: URL) =>
    url.origin === window.location.origin &&
    (isPostsLanding(url) ||
      filterRows.some((row) => rowContainsDestination(row, url)));

  postFilterLifecycle = initPartialFilterNavigation({
    filterLinkSelector: "[data-post-filters] a[href]",
    resultsSelector: "[data-post-results]",
    itemSelector: ".post-list article:not([hidden])",
    isDestination,
    getFilters,
    syncActiveFilter: (destination) => {
      const filters = getFilters(destination);
      for (const link of filters.querySelectorAll<HTMLAnchorElement>(
        "a[href]",
      )) {
        const linkUrl = new URL(link.href, window.location.href);
        const samePath = normalizePath(linkUrl) === normalizePath(destination);
        const active =
          samePath &&
          (!isPostsLanding(destination) ||
            getFilterMode(linkUrl) === getFilterMode(destination));
        link.classList.toggle("is-active", active);
        link.toggleAttribute("aria-current", active);
        if (active) {
          link.setAttribute("aria-current", "page");
        }
      }
    },
    afterSwap: (results) => {
      initPostList();
      initImageFallbacks(results);
    },
    historyState: { akariPostFilter: true },
  });
}

export function initPhotoGroupNavigation() {
  photoGroupLifecycle?.abort();
  const filters = document.querySelector<HTMLElement>("[data-photo-filters]");
  if (!filters) {
    return;
  }
  const photosUrl = filters.dataset.photosUrl;
  if (!photosUrl) {
    return;
  }
  const photosDestination = new URL(photosUrl, window.location.href);
  const isDestination = (url: URL) =>
    url.origin === photosDestination.origin &&
    normalizePath(url) === normalizePath(photosDestination);

  photoGroupLifecycle = initPartialFilterNavigation({
    filterLinkSelector: "[data-photo-filters] a[href]",
    resultsSelector: "[data-photo-results]",
    itemSelector: ".gallery-item",
    isDestination,
    getFilters: () => filters,
    syncActiveFilter: (destination) => {
      const activeGroup = destination.searchParams.get("group") ?? "";
      for (const link of filters.querySelectorAll<HTMLAnchorElement>(
        "a[href]",
      )) {
        const linkUrl = new URL(link.href, window.location.href);
        const active =
          (linkUrl.searchParams.get("group") ?? "") === activeGroup;
        link.classList.toggle("is-active", active);
        link.toggleAttribute("aria-current", active);
        if (active) {
          link.setAttribute("aria-current", "page");
        }
      }
    },
    afterSwap: (results) => {
      initGalleryLayout(results);
      initPhotoLoadMore(results);
      initImageFallbacks(results);
    },
    historyState: { akariPhotoGroup: true },
  });
}

export function disposeFilterFeatures() {
  postFilterLifecycle?.abort();
  photoGroupLifecycle?.abort();
}
