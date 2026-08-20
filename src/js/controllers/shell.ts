import { animate } from "motion";
import {
  canAnimate,
  prefersReducedMotion,
  root,
  run,
} from "../runtime/context";

function setSubmenuTriggerState(trigger: HTMLButtonElement, open: boolean) {
  trigger.setAttribute("aria-expanded", String(open));
  const parentLabel = trigger.dataset.parentLabel;
  const actionLabel = open
    ? trigger.dataset.closeLabel
    : trigger.dataset.openLabel;
  if (parentLabel && actionLabel) {
    trigger.setAttribute("aria-label", `${parentLabel} · ${actionLabel}`);
  }
}

function clearPanelMotion(panel: HTMLElement) {
  panel.style.removeProperty("height");
  panel.style.removeProperty("opacity");
  panel.style.removeProperty("transform");
}

function resetSubmenu(
  group: HTMLElement,
  triggerSelector: string,
  panelSelector: string,
) {
  const trigger = group.querySelector<HTMLButtonElement>(triggerSelector);
  const panel = group.querySelector<HTMLElement>(panelSelector);
  if (!trigger || !panel) {
    return;
  }
  setSubmenuTriggerState(trigger, false);
  group.classList.remove("is-open");
  panel.hidden = true;
  clearPanelMotion(panel);
}

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

  document
    .querySelectorAll<HTMLElement>("[data-desktop-submenu]")
    .forEach((group) =>
      resetSubmenu(
        group,
        "[data-desktop-submenu-trigger]",
        "[data-desktop-submenu-panel]",
      ),
    );
  document
    .querySelectorAll<HTMLElement>("[data-mobile-submenu]")
    .forEach((group) =>
      resetSubmenu(
        group,
        "[data-mobile-submenu-trigger]",
        "[data-mobile-submenu-panel]",
      ),
    );
}

function getNavigationPath(link: HTMLAnchorElement) {
  let expected = "/";
  try {
    expected = new URL(
      link.dataset.navPath || link.href || "/",
      window.location.origin,
    ).pathname;
  } catch {
    expected = link.dataset.navPath || "/";
  }
  return expected.replace(/\/+$/, "") || "/";
}

function setNavigationActive(link: HTMLElement, active: boolean) {
  link.classList.toggle("is-active", active);
  if (active) {
    link.setAttribute("aria-current", "page");
    return;
  }
  link.removeAttribute("aria-current");
}

function isGroupingNavigation(link: HTMLAnchorElement) {
  if (!link.hasAttribute("data-nav-parent")) {
    return false;
  }
  const destination = (
    link.dataset.navPath ||
    link.getAttribute("href") ||
    ""
  ).trim();
  return destination === "" || destination === "#" || destination === "/";
}

export function syncActiveNavigation() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  document
    .querySelectorAll<HTMLAnchorElement>("[data-nav-path]")
    .forEach((link) => {
      const expected = getNavigationPath(link);
      const active =
        !isGroupingNavigation(link) &&
        (expected === "/"
          ? pathname === "/"
          : pathname === expected || pathname.startsWith(`${expected}/`));
      setNavigationActive(link, active);
    });

  document
    .querySelectorAll<HTMLElement>("[data-nav-parent]")
    .forEach((parent) => {
      const group = parent.closest<HTMLElement>(
        "[data-desktop-submenu], [data-mobile-submenu], .more-nav-entry",
      );
      if (!group) {
        return;
      }
      const activeChildren = Array.from(
        group.querySelectorAll<HTMLAnchorElement>("[data-nav-path].is-active"),
      ).filter((link) => link !== parent);
      const activeChild = activeChildren.reduce<HTMLAnchorElement | null>(
        (mostSpecific, child) => {
          if (!mostSpecific) {
            return child;
          }
          return getNavigationPath(child).length >
            getNavigationPath(mostSpecific).length
            ? child
            : mostSpecific;
        },
        null,
      );
      activeChildren.forEach((child) =>
        setNavigationActive(child, child === activeChild),
      );
      const hasActiveChild = activeChild !== null;
      if (hasActiveChild) {
        setNavigationActive(parent, false);
      }
      parent.classList.toggle("is-child-active", hasActiveChild);
      group.classList.toggle("has-active-child", hasActiveChild);
    });

  document
    .querySelectorAll<HTMLElement>("[data-mobile-submenu]")
    .forEach((group) => {
      const trigger = group.querySelector<HTMLButtonElement>(
        "[data-mobile-submenu-trigger]",
      );
      const panel = group.querySelector<HTMLElement>(
        "[data-mobile-submenu-panel]",
      );
      if (!trigger || !panel) {
        return;
      }
      const open = group.classList.contains("has-active-child");
      setSubmenuTriggerState(trigger, open);
      group.classList.toggle("is-open", open);
      panel.hidden = !open;
      clearPanelMotion(panel);
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

  const desktopSubmenus = Array.from(
    document.querySelectorAll<HTMLElement>("[data-desktop-submenu]"),
  );
  const closeTimers = new WeakMap<HTMLElement, number>();

  const closeDesktopSubmenu = async (group: HTMLElement, instant = false) => {
    const trigger = group.querySelector<HTMLButtonElement>(
      "[data-desktop-submenu-trigger]",
    );
    const submenuPanel = group.querySelector<HTMLElement>(
      "[data-desktop-submenu-panel]",
    );
    delete group.dataset.submenuPinned;
    if (!trigger || !submenuPanel || submenuPanel.hidden) {
      return;
    }
    setSubmenuTriggerState(trigger, false);
    group.classList.remove("is-open");
    if (instant || !canAnimate()) {
      submenuPanel.hidden = true;
      clearPanelMotion(submenuPanel);
      return;
    }
    const controls = animate(
      submenuPanel,
      {
        opacity: [1, 0],
        transform: ["translateY(0) scale(1)", "translateY(-7px) scale(.985)"],
      },
      { duration: 0.16, ease: "easeIn" },
    );
    await controls.finished.catch(() => undefined);
    if (trigger.getAttribute("aria-expanded") === "false") {
      submenuPanel.hidden = true;
      clearPanelMotion(submenuPanel);
    }
  };

  const openDesktopSubmenu = (group: HTMLElement) => {
    const trigger = group.querySelector<HTMLButtonElement>(
      "[data-desktop-submenu-trigger]",
    );
    const submenuPanel = group.querySelector<HTMLElement>(
      "[data-desktop-submenu-panel]",
    );
    if (!trigger || !submenuPanel) {
      return;
    }
    const timer = closeTimers.get(group);
    if (timer) {
      window.clearTimeout(timer);
      closeTimers.delete(group);
    }
    if (!submenuPanel.hidden) {
      return;
    }
    desktopSubmenus.forEach((otherGroup) => {
      if (otherGroup !== group) {
        void closeDesktopSubmenu(otherGroup, true);
      }
    });
    void closeMore(true);
    if (canAnimate()) {
      submenuPanel.style.opacity = "0";
      submenuPanel.style.transform = "translateY(-8px) scale(.98)";
    }
    submenuPanel.hidden = false;
    setSubmenuTriggerState(trigger, true);
    group.classList.add("is-open");
    const controls = run(
      submenuPanel,
      {
        opacity: [0, 1],
        transform: ["translateY(-8px) scale(.98)", "translateY(0) scale(1)"],
      },
      { type: "spring", bounce: 0.1, visualDuration: 0.36 },
    );
    const finished = controls?.finished;
    if (finished) {
      void finished.then(
        () => clearPanelMotion(submenuPanel),
        () => clearPanelMotion(submenuPanel),
      );
    }
  };

  const scheduleDesktopSubmenuClose = (group: HTMLElement) => {
    if (group.dataset.submenuPinned === "true") {
      return;
    }
    const existingTimer = closeTimers.get(group);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    closeTimers.set(
      group,
      window.setTimeout(() => {
        closeTimers.delete(group);
        void closeDesktopSubmenu(group);
      }, 180),
    );
  };

  desktopSubmenus.forEach((group) => {
    const trigger = group.querySelector<HTMLButtonElement>(
      "[data-desktop-submenu-trigger]",
    );
    const parent = group.querySelector<HTMLAnchorElement>("[data-nav-parent]");
    const submenuPanel = group.querySelector<HTMLElement>(
      "[data-desktop-submenu-panel]",
    );
    if (!trigger || !parent || !submenuPanel) {
      return;
    }
    group.addEventListener("pointerenter", () => openDesktopSubmenu(group));
    group.addEventListener("pointerleave", () =>
      scheduleDesktopSubmenuClose(group),
    );
    group.addEventListener("focusin", () => openDesktopSubmenu(group));
    group.addEventListener("focusout", (event) => {
      if (!group.contains(event.relatedTarget as Node | null)) {
        scheduleDesktopSubmenuClose(group);
      }
    });
    trigger.addEventListener("click", () => {
      if (group.dataset.submenuPinned === "true") {
        void closeDesktopSubmenu(group);
        return;
      }
      group.dataset.submenuPinned = "true";
      openDesktopSubmenu(group);
    });
    group.addEventListener("keydown", (event) => {
      if (
        event.key === "ArrowDown" &&
        (event.target === trigger || event.target === parent)
      ) {
        event.preventDefault();
        openDesktopSubmenu(group);
        submenuPanel.querySelector<HTMLAnchorElement>("a[href]")?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        void closeDesktopSubmenu(group, true);
        trigger.focus();
      }
    });
  });

  trigger?.addEventListener("click", () => {
    if (!panel) {
      return;
    }
    if (!panel.hidden) {
      void closeMore();
      return;
    }
    desktopSubmenus.forEach((group) => void closeDesktopSubmenu(group, true));
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
    desktopSubmenus.forEach((group) => {
      if (!group.contains(event.target as Node)) {
        void closeDesktopSubmenu(group);
      }
    });
  });

  const menuTrigger = document.querySelector<HTMLButtonElement>(
    "[data-menu-trigger]",
  );
  const menu = document.querySelector<HTMLElement>("[data-mobile-menu]");
  const menuIcon = menuTrigger?.querySelector<HTMLElement>("[data-menu-icon]");
  const mobileSubmenus = Array.from(
    document.querySelectorAll<HTMLElement>("[data-mobile-submenu]"),
  );

  const closeMobileSubmenu = async (group: HTMLElement, instant = false) => {
    const submenuTrigger = group.querySelector<HTMLButtonElement>(
      "[data-mobile-submenu-trigger]",
    );
    const submenuPanel = group.querySelector<HTMLElement>(
      "[data-mobile-submenu-panel]",
    );
    if (!submenuTrigger || !submenuPanel || submenuPanel.hidden) {
      return;
    }
    setSubmenuTriggerState(submenuTrigger, false);
    group.classList.remove("is-open");
    if (instant || !canAnimate()) {
      submenuPanel.hidden = true;
      clearPanelMotion(submenuPanel);
      return;
    }
    const height = submenuPanel.getBoundingClientRect().height;
    const controls = animate(
      submenuPanel,
      { height: [`${height}px`, "0px"], opacity: [1, 0] },
      { duration: 0.2, ease: "easeInOut" },
    );
    await controls.finished.catch(() => undefined);
    if (submenuTrigger.getAttribute("aria-expanded") === "false") {
      submenuPanel.hidden = true;
      clearPanelMotion(submenuPanel);
    }
  };

  const openMobileSubmenu = (group: HTMLElement) => {
    const submenuTrigger = group.querySelector<HTMLButtonElement>(
      "[data-mobile-submenu-trigger]",
    );
    const submenuPanel = group.querySelector<HTMLElement>(
      "[data-mobile-submenu-panel]",
    );
    if (!submenuTrigger || !submenuPanel || !submenuPanel.hidden) {
      return;
    }
    if (canAnimate()) {
      submenuPanel.style.height = "0px";
      submenuPanel.style.opacity = "0";
    }
    submenuPanel.hidden = false;
    setSubmenuTriggerState(submenuTrigger, true);
    group.classList.add("is-open");
    if (!canAnimate()) {
      clearPanelMotion(submenuPanel);
      return;
    }
    const height = submenuPanel.scrollHeight;
    const controls = animate(
      submenuPanel,
      { height: ["0px", `${height}px`], opacity: [0, 1] },
      { type: "spring", bounce: 0.06, visualDuration: 0.34 },
    );
    void controls.finished.then(
      () => clearPanelMotion(submenuPanel),
      () => clearPanelMotion(submenuPanel),
    );
  };

  mobileSubmenus.forEach((group) => {
    const submenuTrigger = group.querySelector<HTMLButtonElement>(
      "[data-mobile-submenu-trigger]",
    );
    const submenuPanel = group.querySelector<HTMLElement>(
      "[data-mobile-submenu-panel]",
    );
    submenuTrigger?.addEventListener("click", () => {
      if (submenuPanel?.hidden) {
        openMobileSubmenu(group);
      } else {
        void closeMobileSubmenu(group);
      }
    });
  });

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

  const existingModal = targetDocument.querySelector<HTMLElement>(
    SEARCH_MODAL_SELECTOR,
  );
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
  const searchButton =
    document.querySelector<HTMLButtonElement>("[data-search]");
  searchButton?.addEventListener("click", () => {
    if (window.SearchWidget) {
      window.SearchWidget.open();
      return;
    }
    const searchUrl = searchButton.dataset.searchUrl;
    if (searchUrl) {
      window.location.assign(searchUrl);
    }
  });
}
