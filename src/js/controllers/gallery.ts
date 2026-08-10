import { initImageFallbacks } from "./utilities";
import { initHtmlContinuation } from "./html-continuation";

type GalleryLayoutController = {
  observer: ResizeObserver;
  refresh: () => void;
};

const galleryLayoutObservers = new WeakMap<
  HTMLElement,
  GalleryLayoutController
>();

export function initGalleryLayout(scope: ParentNode = document) {
  const grids = scope.querySelectorAll<HTMLElement>("[data-gallery-grid]");
  grids.forEach((grid) => {
    const existingController = galleryLayoutObservers.get(grid);
    if (existingController) {
      existingController.refresh();
      return;
    }

    let items = [...grid.querySelectorAll<HTMLElement>(".gallery-item")];
    const spans: number[] = [];
    let frame = 0;

    const layout = () => {
      frame = 0;
      const styles = window.getComputedStyle(grid);
      const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
      const rowGap = Number.parseFloat(styles.rowGap) || 14;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const image = item.querySelector<HTMLImageElement>("img");
        const ratio =
          image?.naturalWidth && image.naturalHeight
            ? image.naturalWidth / image.naturalHeight
            : 4 / 3;
        const targetHeight = item.getBoundingClientRect().width / ratio;
        spans[index] = Math.max(
          1,
          Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap)),
        );
      }

      for (let index = 0; index < items.length; index += 1) {
        items[index].style.gridRowEnd = `span ${spans[index]}`;
      }
      grid.classList.add("is-masonry-ready");
    };

    const schedule = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(layout);
    };

    const bindImages = () => {
      for (let index = 0; index < items.length; index += 1) {
        const image = items[index].querySelector<HTMLImageElement>("img");
        if (!image || image.dataset.galleryLayoutBound === "true") {
          continue;
        }
        image.dataset.galleryLayoutBound = "true";
        if (image.complete) {
          continue;
        }
        image.addEventListener("load", schedule, { once: true });
        image.addEventListener("error", schedule, { once: true });
      }
    };

    const refresh = () => {
      items = [...grid.querySelectorAll<HTMLElement>(".gallery-item")];
      spans.length = items.length;
      bindImages();
      schedule();
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(grid);
    galleryLayoutObservers.set(grid, { observer, refresh });
    refresh();
  });
}

export function disposeGalleryLayouts(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>("[data-gallery-grid]").forEach((grid) => {
    const controller = galleryLayoutObservers.get(grid);
    controller?.observer.disconnect();
    galleryLayoutObservers.delete(grid);
  });
}

export function initPhotoLoadMore(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  initHtmlContinuation({
    scope,
    signal,
    rootSelector: "[data-photo-results]",
    initializedAttribute: "data-photo-load-initialized",
    listSelector: "[data-gallery-grid]",
    itemSelector: ".gallery-item",
    continuationSelector: "[data-photo-continuation]",
    buttonSelector: "[data-load-more-photos]",
    countSelector: "[data-visible-photo-count]",
    endSelector: "[data-photo-load-end]",
    labelSelector: "[data-photo-load-label]",
    iconSelector: "[data-photo-load-icon]",
    requestHeader: "Akari-Append-Navigation",
    missingContentMessage: "Photo continuation did not contain a gallery",
    fallbackErrorMessage: "Unable to load more photos.",
    animation: {
      from: "translateY(14px) scale(.985)",
      delay: 0.035,
      duration: 0.42,
    },
    afterAppend: (root, list) => {
      initGalleryLayout(root);
      initImageFallbacks(list);
    },
  });
}
