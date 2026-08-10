import { animate, hover, inView } from "motion";
import { canAnimate, canUseRichMotion, root } from "../runtime/context";

export function initReveal(scope: ParentNode = document) {
  if (!canAnimate()) {
    return;
  }
  const cleanups: Array<() => void> = [];

  const heroCopy = scope.querySelector<HTMLElement>("[data-hero-copy]");
  const heroScene = scope.querySelector<HTMLElement>("[data-hero-scene]");
  if (heroCopy && heroCopy.dataset.pageTransitionAnimated === undefined) {
    animate(
      heroCopy,
      { opacity: [0, 1], transform: ["translateY(22px)", "translateY(0)"] },
      { duration: 0.62, ease: "easeOut" },
    );
  }
  if (heroScene && heroScene.dataset.pageTransitionAnimated === undefined) {
    animate(
      heroScene,
      {
        opacity: [0, 1],
        transform: ["translateY(16px) scale(.985)", "translateY(0) scale(1)"],
      },
      { duration: 0.74, delay: 0.08, type: "spring", bounce: 0.12 },
    );
  }

  const revealItems = scope.querySelectorAll<HTMLElement>("[data-reveal]");
  revealItems.forEach((element) => {
    if (element.dataset.pageTransitionAnimated !== undefined) {
      return;
    }
    // Match the MVP: keep below-fold content transparent before it intersects.
    // Starting an opacity keyframe only after intersection briefly paints the
    // final state first, which reads as a flash while scrolling.
    element.dataset.motionReveal = "";
    element.style.opacity = "0";
    cleanups.push(
      inView(
        element,
        () => {
          animate(
            element,
            {
              opacity: [0, 1],
              transform: ["translateY(18px)", "translateY(0)"],
            },
            { duration: 0.5, ease: "easeOut" },
          );
        },
        { amount: 0.12 },
      ),
    );
  });
  return () => cleanups.splice(0).forEach((cleanup) => cleanup());
}

export function initArchiveEntryMotion(scope: ParentNode = document) {
  if (
    !canAnimate() ||
    !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    return;
  }

  const entries = [
    ...scope.querySelectorAll<HTMLElement>(".archive-entry"),
  ].filter((entry) => entry.dataset.archiveMotionInitialized !== "true");
  entries.forEach((entry) => {
    entry.dataset.archiveMotionInitialized = "true";
    hover(entry, (element) => {
      animate(
        element,
        { transform: "translateY(-4px)" },
        { duration: 0.3, type: "spring", stiffness: 360, damping: 28 },
      );
      return () => {
        animate(
          element,
          { transform: "translateY(0)" },
          { duration: 0.32, type: "spring", stiffness: 360, damping: 28 },
        );
      };
    });
  });
}

export function initMotionDetails(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  if (!canAnimate()) {
    return;
  }
  const cleanups: Array<() => void> = [];

  const revealElements = scope.querySelectorAll<HTMLElement>(
    ".article-afterword > *, .archive-month, .tag-drawer, .friend-note, .message-wall > *, .about-facts",
  );
  revealElements.forEach((element) => {
    element.dataset.motionReveal = "";
    cleanups.push(
      inView(
        element,
        () => {
          animate(
            element,
            {
              opacity: [0, 1],
              transform: ["translateY(18px)", "translateY(0)"],
            },
            { duration: 0.5, ease: "easeOut" },
          );
        },
        { amount: 0.12 },
      ),
    );
  });

  const finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  if (finePointer) {
    scope
      .querySelectorAll<HTMLElement>(".room-card, .friend-card, .paper-note")
      .forEach((target) =>
        cleanups.push(
          hover(target, (element) => {
            animate(
              element,
              { transform: "translateY(-4px)" },
              { duration: 0.3, type: "spring", stiffness: 360, damping: 28 },
            );
            return () => {
              animate(
                element,
                { transform: "translateY(0)" },
                { duration: 0.32, type: "spring", stiffness: 360, damping: 28 },
              );
            };
          }),
        ),
      );

    initArchiveEntryMotion();

    scope
      .querySelectorAll<HTMLElement>(".gallery-item")
      .forEach((target) =>
        cleanups.push(
          hover(target, (element) => {
            const image = element.querySelector("img");
            animate(
              element,
              { transform: "translateY(-3px)" },
              { duration: 0.3, type: "spring", bounce: 0.08 },
            );
            if (image) {
              animate(
                image,
                { transform: "scale(1.035)" },
                { duration: 0.42, ease: "easeOut" },
              );
            }
            return () => {
              animate(
                element,
                { transform: "translateY(0)" },
                { duration: 0.32, type: "spring", bounce: 0.04 },
              );
              if (image) {
                animate(
                  image,
                  { transform: "scale(1)" },
                  { duration: 0.42, ease: "easeOut" },
                );
              }
            };
          }),
        ),
      );
  }

  if (!canUseRichMotion() || !finePointer) {
    return () => cleanups.splice(0).forEach((cleanup) => cleanup());
  }

  const heroScene = scope.querySelector<HTMLElement>(".hero-scene");
  const heroPhoto = heroScene?.querySelector<HTMLElement>(".scene-photo");
  const heroCharacter =
    heroScene?.querySelector<HTMLElement>(".hero-character");
  if (!heroScene || !heroPhoto || !heroCharacter) {
    return () => cleanups.splice(0).forEach((cleanup) => cleanup());
  }

  let parallaxFrame = 0;
  let pointerX = 0;
  let pointerY = 0;

  heroScene.addEventListener(
    "pointermove",
    (event) => {
      const rect = heroScene.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width - 0.5;
      pointerY = (event.clientY - rect.top) / rect.height - 0.5;
      if (parallaxFrame) {
        return;
      }
      parallaxFrame = window.requestAnimationFrame(() => {
        animate(
          heroPhoto,
          {
            transform: `scale(1.045) translate(${pointerX * -9}px, ${pointerY * -7}px)`,
          },
          { duration: 0.5, ease: "easeOut" },
        );
        animate(
          heroCharacter,
          {
            transform: `translate(${pointerX * 13}px, ${pointerY * 7}px) rotate(${pointerX * 1.2}deg)`,
          },
          { duration: 0.42, type: "spring", stiffness: 180, damping: 24 },
        );
        parallaxFrame = 0;
      });
    },
    { signal },
  );

  heroScene.addEventListener(
    "pointerleave",
    () => {
      animate(
        heroPhoto,
        { transform: "scale(1.04) translate(0px, 0px)" },
        { duration: 0.5, ease: "easeOut" },
      );
      animate(
        heroCharacter,
        { transform: "translate(0px, 0px) rotate(0deg)" },
        { duration: 0.5, type: "spring", bounce: 0.12 },
      );
    },
    { signal },
  );

  return () => {
    if (parallaxFrame) {
      window.cancelAnimationFrame(parallaxFrame);
    }
    cleanups.splice(0).forEach((cleanup) => cleanup());
  };
}

export function prepareProseMedia(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  scope
    .querySelectorAll<HTMLImageElement>("[data-prose] img")
    .forEach((image) => {
      image.loading = image.loading || "lazy";
      image.decoding = "async";
      if (image.closest("a, button")) {
        return;
      }

      const caption = image
        .closest("figure")
        ?.querySelector("figcaption")
        ?.textContent?.trim();
      image.dataset.lightboxTrigger = "";
      image.dataset.lightboxSrc = image.currentSrc || image.src;
      image.dataset.lightboxCaption = caption || image.alt || "";
      image.classList.add("is-lightbox-ready");
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            image.click();
          }
        },
        { signal },
      );
    });
}

export function prepareArticleTables(scope: ParentNode = document) {
  scope
    .querySelectorAll<HTMLTableElement>(
      "[data-prose] table:not([data-akari-table])",
    )
    .forEach((table) => {
      const frame = document.createElement("div");
      frame.className = "article-table-frame";
      frame.setAttribute("role", "region");
      frame.setAttribute("tabindex", "0");
      frame.setAttribute(
        "aria-label",
        table.getAttribute("aria-label") ||
          root.dataset.tableScrollLabel ||
          "Scrollable table",
      );
      table.dataset.akariTable = "true";
      table.before(frame);
      frame.append(table);
    });
}

export function removeEmptyAboutProse(scope: ParentNode = document) {
  const prose = scope.querySelector<HTMLElement>("[data-about-prose]");
  if (!prose) {
    return;
  }
  const clone = prose.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("script, style, noscript, template")
    .forEach((element) => element.remove());
  const meaningfulMedia = clone.querySelector(
    "img, video, audio, iframe, table, pre, blockquote, hr",
  );
  const text =
    clone.textContent?.replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, "") ?? "";
  if (!text && !meaningfulMedia) {
    prose.remove();
  }
}
