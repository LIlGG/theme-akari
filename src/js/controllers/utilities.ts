import { animate, hover } from "motion";
import {
  canAnimate,
  prefersReducedMotion,
  root,
  run,
} from "../runtime/context";

export function initUtilities() {
  const button = document.querySelector<HTMLButtonElement>("[data-back-top]");
  if (!button) {
    return;
  }

  let visible = false;
  let frameRequested = false;
  let visibilitySequence = 0;

  const setVisible = (nextVisible: boolean) => {
    if (visible === nextVisible) {
      return;
    }
    visible = nextVisible;
    const sequence = ++visibilitySequence;

    if (nextVisible) {
      button.hidden = false;
      button.dataset.visible = "";
      run(
        button,
        {
          opacity: [0, 1],
          transform: ["translateY(14px) scale(.94)", "translateY(0) scale(1)"],
        },
        { duration: 0.42, type: "spring", bounce: 0.18 },
      );
      return;
    }

    delete button.dataset.visible;
    if (!canAnimate()) {
      button.hidden = true;
      return;
    }
    void animate(
      button,
      {
        opacity: [1, 0],
        transform: ["translateY(0) scale(1)", "translateY(10px) scale(.96)"],
      },
      { duration: 0.18, ease: "easeIn" },
    ).finished.then(() => {
      if (!visible && sequence === visibilitySequence) {
        button.hidden = true;
      }
    });
  };

  const update = () => {
    frameRequested = false;
    const scrollable = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const progress =
      scrollable > 0
        ? Math.min(1, Math.max(0, window.scrollY / scrollable))
        : 0;
    button.style.setProperty("--back-top-progress", `${progress * 360}deg`);
    setVisible(window.scrollY > Math.min(560, window.innerHeight * 0.68));
  };

  const requestUpdate = () => {
    if (frameRequested) {
      return;
    }
    frameRequested = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  new ResizeObserver(requestUpdate).observe(document.documentElement);
  update();

  if (canAnimate()) {
    hover(button, (element) => {
      run(
        element,
        { transform: "translateY(-3px) scale(1.02)" },
        { duration: 0.22, ease: "easeOut" },
      );
      return () => {
        run(
          element,
          { transform: "translateY(0) scale(1)" },
          { duration: 0.24, type: "spring", bounce: 0.12 },
        );
      };
    });
  }

  button.addEventListener("click", () => {
    run(
      button,
      { transform: ["scale(.94)", "scale(1)"] },
      { duration: 0.32, type: "spring", bounce: 0.24 },
    );
    document
      .querySelector<HTMLElement>("#main-content")
      ?.focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    });
  });
}

export function initImageFallbacks(scope: ParentNode = document) {
  const images = scope.querySelectorAll<HTMLImageElement>(
    "img:not([data-lightbox-image]):not([data-runtime-image])",
  );

  images.forEach((image) => {
    const markUnavailable = () => {
      if (
        image.dataset.fallbackSrc &&
        image.dataset.fallbackAttempted !== "true"
      ) {
        image.dataset.fallbackAttempted = "true";
        image.src = image.dataset.fallbackSrc;
        image.removeAttribute("srcset");
        return;
      }
      if (image.dataset.fallbackApplied === "true") {
        return;
      }
      image.dataset.fallbackApplied = "true";

      const container = image.parentElement;
      if (container?.classList.contains("friend-avatar-stack")) {
        image.classList.add("is-media-unavailable");
        image.hidden = true;
        image.setAttribute("aria-hidden", "true");
        container.classList.add("has-initial-fallback");
        return;
      }

      image.classList.add("is-media-unavailable");
      if (!container) {
        return;
      }
      container.classList.add("has-media-fallback");

      const fallback = document.createElement("span");
      fallback.className = "ak-image-fallback";
      fallback.setAttribute("role", "img");
      fallback.setAttribute(
        "aria-label",
        root.dataset.imageErrorLabel ?? "Image unavailable",
      );
      fallback.innerHTML =
        '<span class="i-lucide-image-off" aria-hidden="true"></span>';
      image.insertAdjacentElement("afterend", fallback);
    };

    image.addEventListener("error", markUnavailable);
    if (image.complete && image.naturalWidth === 0) {
      markUnavailable();
    }
  });
}
