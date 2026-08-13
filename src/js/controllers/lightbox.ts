import { animate } from "motion";
import { canAnimate, run } from "../runtime/context";

export function initLightbox() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-lightbox]");
  const image = dialog?.querySelector<HTMLImageElement>(
    "[data-lightbox-image]",
  );
  const caption = dialog?.querySelector<HTMLElement>("[data-lightbox-caption]");
  const previous = dialog?.querySelector<HTMLButtonElement>(
    "[data-lightbox-previous]",
  );
  const next = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-next]");
  if (!dialog || !image || !caption) {
    return;
  }
  if (dialog.dataset.lightboxInitialized === "true") {
    return;
  }
  dialog.dataset.lightboxInitialized = "true";

  let currentIndex = 0;
  let returnFocus: HTMLElement | null = null;
  const getTriggers = () => [
    ...document.querySelectorAll<HTMLElement>("[data-lightbox-trigger]"),
  ];

  const show = (index: number, direction = 1) => {
    const triggers = getTriggers();
    if (!triggers.length) {
      return;
    }
    currentIndex = (index + triggers.length) % triggers.length;
    const trigger = triggers[currentIndex];
    image.src = trigger.dataset.lightboxSrc ?? "";
    image.alt = trigger.dataset.lightboxCaption ?? "";
    caption.textContent = trigger.dataset.lightboxCaption ?? "";
    previous?.toggleAttribute("hidden", triggers.length < 2);
    next?.toggleAttribute("hidden", triggers.length < 2);

    if (triggers.length > 1) {
      const adjacent =
        triggers[
          (currentIndex + direction + triggers.length) % triggers.length
        ];
      const adjacentSource = adjacent.dataset.lightboxSrc;
      if (adjacentSource) {
        const preload = new Image();
        preload.src = adjacentSource;
      }
    }

    run(
      image,
      {
        opacity: [0, 1],
        transform: [
          `translateX(${direction * 22}px) scale(.985)`,
          "translateX(0) scale(1)",
        ],
      },
      { duration: 0.34, type: "spring", bounce: 0.08 },
    );
  };

  document.addEventListener("click", (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-lightbox-trigger]",
    );
    if (!trigger) {
      return;
    }
    const triggers = getTriggers();
    const index = triggers.indexOf(trigger);
    if (index < 0) {
      return;
    }

    returnFocus = trigger;
    show(index);
    dialog.showModal();
    run(
      dialog,
      { opacity: [0, 1], transform: ["scale(.975)", "scale(1)"] },
      { duration: 0.28, type: "spring", bounce: 0.08 },
    );
  });

  const close = async () => {
    if (!dialog.open) {
      return;
    }
    if (canAnimate()) {
      await animate(
        dialog,
        { opacity: [1, 0], transform: ["scale(1)", "scale(.985)"] },
        { duration: 0.14 },
      ).finished;
    }
    dialog.close();
    image.removeAttribute("src");
    returnFocus?.focus({ preventScroll: true });
  };

  previous?.addEventListener("click", () => {
    show(currentIndex - 1, -1);
    run(
      previous.firstElementChild ?? previous,
      { scale: [0.9, 1] },
      { duration: 0.24, type: "spring", bounce: 0.18 },
    );
  });
  next?.addEventListener("click", () => {
    show(currentIndex + 1, 1);
    run(
      next.firstElementChild ?? next,
      { scale: [0.9, 1] },
      { duration: 0.24, type: "spring", bounce: 0.18 },
    );
  });
  dialog
    .querySelector("[data-lightbox-close]")
    ?.addEventListener("click", () => void close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      void close();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (
      !dialog.open ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    show(
      currentIndex + (event.key === "ArrowLeft" ? -1 : 1),
      event.key === "ArrowLeft" ? -1 : 1,
    );
  });
}
