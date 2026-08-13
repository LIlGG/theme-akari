import { animate, stagger } from "motion";
import { closeNavigationOverlays, syncActiveNavigation } from "./shell";
import { isAstroClientRouterEnabled } from "../lifecycle/astro";
import { canAnimate, prefersReducedMotion, root } from "../runtime/context";
import { isPlainPrimaryClick } from "../utils/events";

declare global {
  interface Window {
    SearchWidget?: { open: () => void };
  }
}

const PAGE_TRANSITION_KEY = "akari-page-transition";
let pageNavigationPending = false;
let astroCurrentNavigationInitialized = false;

type TransitionState = {
  destination?: string;
  scrollY?: number;
  createdAt?: number;
};

function animatePageIn(page: HTMLElement, animateRoot = true) {
  if (!canAnimate()) {
    page.style.removeProperty("opacity");
    page.style.removeProperty("transform");
    return;
  }

  const heading = page.querySelector<HTMLElement>(
    ".page-intro, .article-hero-copy, .hero-copy, .notfound-card > div:last-child",
  );
  const surface = page.querySelector<HTMLElement>(
    ".hero-scene, .article-hero > img, .archive-stats, .spinning-disc, .door-sign, .notfound-scene",
  );
  const firstItems = page.querySelectorAll<HTMLElement>(
    ".filter-chip, .year-button, .media-tabs button, .category-card, .friend-card, .gallery-item, .post-list article:not([hidden])",
  );

  [heading, surface, ...firstItems].forEach((element) => {
    if (element) {
      element.dataset.pageTransitionAnimated = "";
    }
  });

  if (animateRoot) {
    void animate(
      page,
      { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
      { duration: 0.32, ease: "easeOut" },
    ).finished.then(() => {
      page.style.removeProperty("opacity");
      page.style.removeProperty("transform");
    });
  }

  if (heading) {
    animate(
      heading,
      { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0)"] },
      { duration: 0.48, ease: "easeOut" },
    );
  }
  if (surface) {
    animate(
      surface,
      {
        opacity: [0, 1],
        transform: ["translateY(14px) scale(.985)", "translateY(0) scale(1)"],
      },
      { duration: 0.58, delay: 0.06, type: "spring", bounce: 0.14 },
    );
  }
  if (firstItems.length) {
    animate(
      firstItems,
      { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
      {
        duration: 0.36,
        delay: stagger(0.035, { startDelay: 0.08 }),
        ease: "easeOut",
      },
    );
  }
}

function currentPageLink(event: MouseEvent) {
  if (!isPlainPrimaryClick(event)) {
    return null;
  }
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    "a[data-nav-path], a.brand",
  );
  if (!link || (link.target && link.target !== "_self")) {
    return null;
  }
  const destination = new URL(link.href, window.location.href);
  const current = new URL(window.location.href);
  const samePage =
    destination.origin === current.origin &&
    destination.pathname === current.pathname &&
    destination.search === current.search &&
    !destination.hash;
  return samePage ? link : null;
}

function initAstroCurrentNavigation() {
  if (astroCurrentNavigationInitialized) {
    return;
  }
  astroCurrentNavigationInitialized = true;
  document.addEventListener(
    "click",
    (event) => {
      if (!currentPageLink(event)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      closeNavigationOverlays();
      document
        .querySelector<HTMLElement>("#main-content")
        ?.focus({ preventScroll: true });
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion.matches ? "auto" : "smooth",
      });
    },
    { capture: true },
  );
}

function isTransitionState(value: unknown): value is TransitionState {
  return typeof value === "object" && value !== null;
}

function readTransitionState() {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(PAGE_TRANSITION_KEY) ?? "null",
    );
    return isTransitionState(value) ? value : null;
  } catch {
    return null;
  }
}

function restoreLegacyEntry(page: HTMLElement, main: HTMLElement | null) {
  const entryState = readTransitionState();
  sessionStorage.removeItem(PAGE_TRANSITION_KEY);
  const locationKey = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const validEntry =
    entryState?.destination === locationKey &&
    typeof entryState.createdAt === "number" &&
    Date.now() - entryState.createdAt < 10000;
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const entering =
    root.classList.contains("akari-page-enter-pending") &&
    (validEntry || navigation?.type === "back_forward");
  if (!entering) {
    root.classList.remove("akari-page-enter-pending");
    return;
  }
  const requestedScroll = validEntry ? (entryState?.scrollY ?? 0) : 0;
  const startScroll = Number.isFinite(requestedScroll)
    ? Math.max(0, requestedScroll)
    : 0;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: startScroll, behavior: "auto" });
  root.style.scrollBehavior = previousScrollBehavior;
  animatePageIn(page, false);
  root.classList.remove("akari-page-enter-pending");
  window.requestAnimationFrame(() => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    });
  });
  window.setTimeout(() => main?.focus({ preventScroll: true }), 360);
}

function legacyNavigationTarget(event: MouseEvent) {
  if (!isPlainPrimaryClick(event)) {
    return null;
  }
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    "a[href]",
  );
  if (
    !link ||
    link.hasAttribute("download") ||
    link.dataset.noPageTransition !== undefined ||
    (link.target && link.target !== "_self")
  ) {
    return null;
  }
  const destination = new URL(link.href, window.location.href);
  const internal =
    destination.origin === window.location.origin &&
    /^https?:$/.test(destination.protocol);
  return internal ? { link, destination } : null;
}

function handleCurrentLegacyPage(page: HTMLElement, main: HTMLElement | null) {
  if (pageNavigationPending) {
    return;
  }
  closeNavigationOverlays();
  page.style.opacity = "0";
  page.style.transform = "translateY(8px)";
  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
  });
  animatePageIn(page);
  window.setTimeout(
    () => main?.focus({ preventScroll: true }),
    canAnimate() ? 360 : 0,
  );
}

function navigateLegacyDocument(destination: URL) {
  if (pageNavigationPending) {
    return;
  }
  pageNavigationPending = true;
  closeNavigationOverlays();
  sessionStorage.setItem(
    PAGE_TRANSITION_KEY,
    JSON.stringify({
      destination: `${destination.pathname}${destination.search}${destination.hash}`,
      scrollY: window.scrollY,
      createdAt: Date.now(),
    }),
  );
  window.location.assign(destination.href);
}

function initLegacyPageTransitions(
  page: HTMLElement,
  main: HTMLElement | null,
) {
  restoreLegacyEntry(page, main);
  document.addEventListener(
    "click",
    (event) => {
      const target = legacyNavigationTarget(event);
      if (!target) {
        return;
      }
      const { link, destination } = target;
      const sameDocumentHash =
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        Boolean(destination.hash) &&
        destination.hash !== window.location.hash;
      if (sameDocumentHash) {
        return;
      }
      const currentNavLink =
        destination.pathname === window.location.pathname &&
        !destination.hash &&
        (destination.href === window.location.href ||
          link.matches("[data-nav-path], .brand"));
      event.preventDefault();
      if (currentNavLink) {
        handleCurrentLegacyPage(page, main);
        return;
      }
      navigateLegacyDocument(destination);
    },
    { capture: true },
  );
}

export function initPageTransitions() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  if (isAstroClientRouterEnabled()) {
    initAstroCurrentNavigation();
    return;
  }
  const page = document.querySelector<HTMLElement>("[data-page]");
  if (!page) {
    return;
  }
  initLegacyPageTransitions(
    page,
    document.querySelector<HTMLElement>("#main-content"),
  );
}

export function syncAstroDocumentState() {
  const storedTheme = localStorage.getItem("akari-theme");
  const fallbackTheme = root.dataset.defaultTheme || "system";
  root.dataset.theme =
    storedTheme ||
    (fallbackTheme === "system"
      ? matchMedia("(prefers-color-scheme:dark)").matches
        ? "dark"
        : "light"
      : fallbackTheme);
  root.classList.add("motion-ready");

  const currentUrl = new URL(window.location.href);
  root.dataset.postFilterMode =
    currentUrl.searchParams.get("filter") === "tags" ||
    root.dataset.templateId === "tag"
      ? "tag"
      : "category";
  pageNavigationPending = false;
  closeNavigationOverlays();
  syncActiveNavigation();
}
