import { animate } from "motion";
import {
  canAnimate,
  prefersReducedMotion,
  root,
  run,
} from "../runtime/context";

export function closeNavigationOverlays() {
  const morePanel = document.querySelector<HTMLElement>("[data-more-panel]");
  const moreTrigger = document.querySelector<HTMLButtonElement>(
    "[data-more-trigger]",
  );
  if (morePanel) {
    morePanel.hidden = true;
  }
  moreTrigger?.setAttribute("aria-expanded", "false");

  const mobileMenu = document.querySelector<HTMLElement>("[data-mobile-menu]");
  const mobileTrigger = document.querySelector<HTMLButtonElement>(
    "[data-menu-trigger]",
  );
  const mobileIcon =
    mobileTrigger?.querySelector<HTMLElement>("[data-menu-icon]");
  if (mobileMenu) {
    mobileMenu.hidden = true;
  }
  mobileTrigger?.setAttribute("aria-expanded", "false");
  if (mobileIcon) {
    mobileIcon.className = "i-lucide-menu";
  }
  if (mobileTrigger?.dataset.openLabel) {
    mobileTrigger.setAttribute("aria-label", mobileTrigger.dataset.openLabel);
  }
}

export function syncActiveNavigation() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  document
    .querySelectorAll<HTMLAnchorElement>("[data-nav-path]")
    .forEach((link) => {
      let expected = "/";
      try {
        expected = new URL(
          link.dataset.navPath || link.href || "/",
          window.location.origin,
        ).pathname;
      } catch {
        expected = link.dataset.navPath || "/";
      }
      expected = expected.replace(/\/+$/, "") || "/";
      const active =
        expected === "/"
          ? pathname === "/"
          : pathname === expected || pathname.startsWith(`${expected}/`);
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
}

export function initHeader() {
  const header = document.querySelector<HTMLElement>("[data-header]");
  if (!header) {
    return;
  }

  const sync = () =>
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  sync();
  window.addEventListener("scroll", sync, { passive: true });

  const more = document.querySelector<HTMLElement>("[data-more]");
  const trigger = more?.querySelector<HTMLButtonElement>("[data-more-trigger]");
  const panel = more?.querySelector<HTMLElement>("[data-more-panel]");

  const closeMore = async (instant = false) => {
    if (!trigger || !panel || panel.hidden) {
      return;
    }
    trigger.setAttribute("aria-expanded", "false");
    if (instant || !canAnimate()) {
      panel.hidden = true;
      return;
    }
    const controls = animate(
      panel,
      {
        opacity: [1, 0],
        transform: ["translateY(0) scale(1)", "translateY(-7px) scale(.985)"],
      },
      { duration: 0.15, ease: "easeIn" },
    );
    await controls.finished;
    panel.hidden = true;
    panel.style.removeProperty("opacity");
    panel.style.removeProperty("transform");
  };

  trigger?.addEventListener("click", () => {
    if (!panel) {
      return;
    }
    if (!panel.hidden) {
      void closeMore();
      return;
    }
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    run(
      panel,
      {
        opacity: [0, 1],
        transform: ["translateY(-8px) scale(.98)", "translateY(0) scale(1)"],
      },
      { duration: 0.3, type: "spring", bounce: 0.12 },
    );
  });

  document.addEventListener("click", (event) => {
    if (more && !more.contains(event.target as Node)) {
      void closeMore();
    }
  });

  const menuTrigger = document.querySelector<HTMLButtonElement>(
    "[data-menu-trigger]",
  );
  const menu = document.querySelector<HTMLElement>("[data-mobile-menu]");
  const menuIcon = menuTrigger?.querySelector<HTMLElement>("[data-menu-icon]");

  const setMenuIcon = (open: boolean) => {
    if (!menuIcon) {
      return;
    }
    menuIcon.className = open ? "i-lucide-x" : "i-lucide-menu";
    menuTrigger?.setAttribute(
      "aria-label",
      open
        ? (menuTrigger.dataset.closeLabel ?? "Close menu")
        : (menuTrigger.dataset.openLabel ?? "Open menu"),
    );
  };

  const closeMenu = async (instant = false) => {
    if (!menu || !menuTrigger || menu.hidden) {
      return;
    }
    menuTrigger.setAttribute("aria-expanded", "false");
    setMenuIcon(false);
    if (instant || !canAnimate()) {
      menu.hidden = true;
      return;
    }
    const height = menu.getBoundingClientRect().height;
    const controls = animate(
      menu,
      {
        height: [`${height}px`, "0px"],
        opacity: [1, 0],
        transform: ["translateY(0)", "translateY(-7px)"],
      },
      { duration: 0.2, ease: "easeInOut" },
    );
    await controls.finished;
    menu.hidden = true;
    menu.style.removeProperty("height");
    menu.style.removeProperty("opacity");
    menu.style.removeProperty("transform");
  };

  menuTrigger?.addEventListener("click", () => {
    if (!menu) {
      return;
    }
    if (!menu.hidden) {
      void closeMenu();
      return;
    }
    menu.hidden = false;
    menuTrigger.setAttribute("aria-expanded", "true");
    setMenuIcon(true);
    if (canAnimate()) {
      const height = menu.scrollHeight;
      const controls = animate(
        menu,
        {
          height: ["0px", `${height}px`],
          opacity: [0, 1],
          transform: ["translateY(-8px)", "translateY(0)"],
        },
        { duration: 0.32, type: "spring", bounce: 0.08 },
      );
      void controls.finished
        .then(() => menu.style.removeProperty("height"))
        .catch(() => undefined);
    }
  });

  window
    .matchMedia("(min-width: 1024px)")
    .addEventListener("change", (event) => {
      if (event.matches) {
        void closeMenu(true);
      }
    });

  syncActiveNavigation();
}

export function initTheme() {
  const toggle = document.querySelector<HTMLButtonElement>(
    "[data-theme-toggle]",
  );
  const icon = toggle?.querySelector<HTMLElement>("[data-theme-icon]");
  if (!toggle || !icon) {
    return;
  }

  const sync = () => {
    const dark = root.dataset.theme === "dark";
    icon.className = dark ? "i-lucide-sun" : "i-lucide-moon";
    toggle.setAttribute(
      "aria-label",
      dark
        ? (toggle.dataset.lightLabel ?? "Use light theme")
        : (toggle.dataset.darkLabel ?? "Use dark theme"),
    );
  };

  sync();
  toggle.addEventListener("click", () => {
    const change = () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("akari-theme", root.dataset.theme);
      sync();
    };

    if (document.startViewTransition && !prefersReducedMotion.matches) {
      const transition = document.startViewTransition(change);
      void transition.finished.catch(() => {
        // Navigation or a second toggle can legitimately skip an in-flight transition.
      });
    } else {
      change();
    }

    run(
      toggle,
      { transform: ["rotate(-18deg) scale(.82)", "rotate(0deg) scale(1)"] },
      { duration: 0.45, type: "spring", bounce: 0.26 },
    );
  });
}

const SEARCH_MODAL_SELECTOR = "search-modal";
const SEARCH_MODAL_PERSIST_KEY = "akari-search-modal";

type PrepareSearchWidgetOptions = {
  createPlaceholder?: boolean;
};

// PluginSearchWidget creates the modal at runtime and keeps a private reference
// to that instance. Preserve the same element across ClientRouter page swaps.
export function prepareSearchWidget(
  targetDocument: Document,
  { createPlaceholder = false }: PrepareSearchWidgetOptions = {},
) {
  const searchTrigger = targetDocument.querySelector("[data-search]");
  if (!searchTrigger) {
    return false;
  }

  const existingModal =
    targetDocument.querySelector<HTMLElement>(SEARCH_MODAL_SELECTOR);
  if (!existingModal && !createPlaceholder) {
    return false;
  }

  const searchModal =
    existingModal ?? targetDocument.createElement(SEARCH_MODAL_SELECTOR);
  searchModal.setAttribute(
    "data-astro-transition-persist",
    SEARCH_MODAL_PERSIST_KEY,
  );

  if (!searchModal.isConnected) {
    targetDocument.body.append(searchModal);
  }
  return true;
}

export function initSearch() {
  if (!prepareSearchWidget(document)) {
    const observer = new MutationObserver(() => {
      if (prepareSearchWidget(document)) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  document
    .querySelector<HTMLButtonElement>("[data-search]")
    ?.addEventListener("click", () => {
      if (window.SearchWidget) {
        window.SearchWidget.open();
        return;
      }
      window.location.assign("/search");
    });
}
