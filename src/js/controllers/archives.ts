import { hydrateReadingTimes } from "../services/reading-time";
import { withHaloTrackerSuspended } from "../services/halo-tracker";
import {
  canAnimate,
  localizeQuantity,
  run,
  showToast,
} from "../runtime/context";
import { initArchiveEntryMotion } from "./content";
import { isAbortError, walkHaloDocuments } from "../services/halo-http";
import { findInScope } from "../utils/dom";

function resolveArchiveElements(scope: ParentNode) {
  const results = findInScope<HTMLElement>(scope, "[data-archive-results]");
  if (!results || results.dataset.archiveLoadInitialized === "true") {
    return null;
  }
  const yearRail = results.querySelector<HTMLElement>(
    "[data-archive-year-rail]",
  );
  const years = results.querySelector<HTMLElement>("[data-archive-years]");
  const continuation = results.querySelector<HTMLElement>(
    "[data-archive-continuation]",
  );
  if (!yearRail || !years || !continuation) {
    return null;
  }
  results.dataset.archiveLoadInitialized = "true";
  return { results, yearRail, years, continuation };
}

export function initArchiveLoadMore(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  const elements = resolveArchiveElements(scope);
  if (!elements) {
    return;
  }
  const { results, yearRail, years, continuation } = elements;
  const button = continuation?.querySelector<HTMLAnchorElement>(
    "[data-load-more-archives]",
  );
  const count = continuation?.querySelector<HTMLElement>(
    "[data-visible-archive-count]",
  );
  const end = continuation?.querySelector<HTMLElement>(
    "[data-archive-load-end]",
  );
  const label = button?.querySelector<HTMLElement>("[data-archive-load-label]");
  const icon = button?.querySelector<HTMLElement>("[data-archive-load-icon]");
  const summary = document.querySelector<HTMLElement>("[data-archive-summary]");
  const yearCount = document.querySelector<HTMLElement>(
    "[data-archive-year-count]",
  );
  const originalLabel = label?.textContent ?? "";
  const originalIconClassName = icon?.className ?? "";
  const total = Number.parseInt(results.dataset.total ?? "0", 10);
  const knownPosts = new Set(
    [...years.querySelectorAll<HTMLElement>("[data-archive-entry]")]
      .map((entry) => entry.dataset.postName || entry.getAttribute("href"))
      .filter((name): name is string => Boolean(name)),
  );
  let loading = false;
  let activeYear = window.location.hash.startsWith("#archive-")
    ? decodeURIComponent(window.location.hash.slice("#archive-".length))
    : "";

  const findYearSection = (year: string) =>
    [
      ...years.querySelectorAll<HTMLElement>("[data-archive-year-section]"),
    ].find((section) => section.dataset.archiveYear === year);

  const findYearLink = (year: string) =>
    [
      ...yearRail.querySelectorAll<HTMLElement>("[data-archive-year-link]"),
    ].find((link) => link.dataset.archiveYear === year);

  const applyYearVisibility = () => {
    const sections = [
      ...years.querySelectorAll<HTMLElement>("[data-archive-year-section]"),
    ];
    if (!sections.length) {
      return;
    }
    if (!findYearSection(activeYear)) {
      activeYear = sections[0].dataset.archiveYear ?? "";
    }
    sections.forEach((section) => {
      section.hidden = section.dataset.archiveYear !== activeYear;
      section.removeAttribute("data-reveal");
      section.style.removeProperty("opacity");
      section.style.removeProperty("transform");
    });
    yearRail
      .querySelectorAll<HTMLElement>("[data-archive-year-link]")
      .forEach((link) => {
        const selected = link.dataset.archiveYear === activeYear;
        link.classList.toggle("is-active", selected);
        if (selected) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    const activeSection = findYearSection(activeYear);
    if (activeSection) {
      void hydrateReadingTimes(
        activeSection,
        "[data-archive-reading-time]",
        signal,
      );
    }
  };

  const selectYear = async (year: string, updateAddress = true) => {
    const incoming = findYearSection(year);
    if (!incoming || year === activeYear) {
      return;
    }
    const outgoing = findYearSection(activeYear);
    if (outgoing && canAnimate()) {
      const controls = run(
        outgoing,
        { opacity: [1, 0], transform: ["translateY(0)", "translateY(-7px)"] },
        { duration: 0.16, ease: "easeIn" },
      );
      await controls?.finished;
    }
    if (outgoing) {
      outgoing.hidden = true;
    }
    activeYear = year;
    incoming.hidden = false;
    incoming.style.removeProperty("opacity");
    incoming.style.removeProperty("transform");
    applyYearVisibility();
    if (updateAddress) {
      withHaloTrackerSuspended(() => {
        history.replaceState(
          history.state,
          "",
          `#archive-${encodeURIComponent(year)}`,
        );
      });
    }
    run(
      incoming,
      { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0)"] },
      { duration: 0.38, type: "spring", bounce: 0.08 },
    );
  };

  const bindYearLinks = () => {
    yearRail
      .querySelectorAll<HTMLAnchorElement>("[data-archive-year-link]")
      .forEach((link) => {
        if (link.dataset.archiveFilterInitialized === "true") {
          return;
        }
        link.dataset.archiveFilterInitialized = "true";
        link.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            const year = link.dataset.archiveYear;
            if (year) {
              void selectYear(year);
            }
          },
          { signal },
        );
      });
  };

  const updateStatistics = () => {
    const sections = [
      ...years.querySelectorAll<HTMLElement>("[data-archive-year-section]"),
    ];
    sections.forEach((section) => {
      const year = section.dataset.archiveYear;
      if (!year) {
        return;
      }
      const link = findYearLink(year);
      const linkCount = link?.querySelector<HTMLElement>(
        "[data-archive-year-link-count]",
      );
      if (!linkCount) {
        return;
      }
      const template = linkCount.dataset.archiveCountTemplate ?? "__COUNT__";
      linkCount.textContent = template.replace(
        /__COUNT__|COUNT/g,
        String(section.querySelectorAll("[data-archive-entry]").length),
      );
    });

    const visiblePosts = years.querySelectorAll("[data-archive-entry]").length;
    if (count) {
      count.textContent = String(visiblePosts);
    }
    if (yearCount) {
      yearCount.textContent = String(sections.length);
    }
    if (summary) {
      const template = summary.dataset.archiveSummaryTemplate;
      if (template) {
        summary.textContent = template
          .replace(/__YEARS__|YEARS/g, localizeQuantity(sections.length))
          .replace(
            /__POSTS__|POSTS/g,
            localizeQuantity(Number.isFinite(total) ? total : visiblePosts),
          );
      }
    }
  };

  const finish = (focusEnd = false) => {
    if (button) {
      button.hidden = true;
    }
    if (!end) {
      return;
    }
    end.hidden = false;
    if (focusEnd) {
      end.tabIndex = -1;
      end.focus({ preventScroll: true });
    }
    run(
      end,
      { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
      { duration: 0.34, type: "spring", bounce: 0.08 },
    );
  };

  const mergeArchiveDocument = (parsed: Document) => {
    const nextResults = parsed.querySelector<HTMLElement>(
      "[data-archive-results]",
    );
    const nextYears = nextResults?.querySelector<HTMLElement>(
      "[data-archive-years]",
    );
    if (!nextResults || !nextYears) {
      throw new Error("Archive continuation did not contain archive years");
    }

    const incomingYears = [
      ...nextYears.querySelectorAll<HTMLElement>("[data-archive-year-section]"),
    ];
    incomingYears.forEach((sourceYear) => {
      const incomingYear = document.importNode(sourceYear, true);
      incomingYear.removeAttribute("data-reveal");
      const year = incomingYear.dataset.archiveYear;
      if (!year) {
        return;
      }

      [
        ...incomingYear.querySelectorAll<HTMLElement>("[data-archive-entry]"),
      ].forEach((entry) => {
        const name = entry.dataset.postName || entry.getAttribute("href");
        if (!name || knownPosts.has(name)) {
          entry.remove();
          return;
        }
        knownPosts.add(name);
      });
      [
        ...incomingYear.querySelectorAll<HTMLElement>("[data-archive-month]"),
      ].forEach((month) => {
        if (!month.querySelector("[data-archive-entry]")) {
          month.remove();
        }
      });
      if (!incomingYear.querySelector("[data-archive-entry]")) {
        return;
      }

      const existingYear = findYearSection(year);
      if (!existingYear) {
        incomingYear.hidden = year !== activeYear;
        continuation.before(incomingYear);
        const sourceLink = [
          ...nextResults.querySelectorAll<HTMLElement>(
            "[data-archive-year-link]",
          ),
        ].find((link) => link.dataset.archiveYear === year);
        if (sourceLink && !findYearLink(year)) {
          const incomingLink = document.importNode(sourceLink, true);
          incomingLink.classList.remove("is-active");
          incomingLink.removeAttribute("aria-current");
          yearRail.append(incomingLink);
        }
        return;
      }

      [
        ...incomingYear.querySelectorAll<HTMLElement>("[data-archive-month]"),
      ].forEach((incomingMonth) => {
        const month = incomingMonth.dataset.archiveMonth;
        const existingMonth = [
          ...existingYear.querySelectorAll<HTMLElement>("[data-archive-month]"),
        ].find((candidate) => candidate.dataset.archiveMonth === month);
        if (!existingMonth) {
          existingYear.append(incomingMonth);
          return;
        }
        existingMonth.append(
          ...incomingMonth.querySelectorAll<HTMLElement>(
            "[data-archive-entry]",
          ),
        );
      });
    });

    bindYearLinks();
    updateStatistics();
    applyYearVisibility();
    initArchiveEntryMotion(years);
    return (
      nextResults.querySelector<HTMLAnchorElement>("[data-load-more-archives]")
        ?.href ?? null
    );
  };

  const loadRemaining = async (focusEnd = false) => {
    if (loading || !button) {
      return;
    }
    loading = true;
    results.setAttribute("aria-busy", "true");
    button.hidden = false;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-disabled", "true");
    if (icon) {
      icon.className = "i-lucide-loader-circle is-spinning";
    }
    if (label) {
      label.textContent = button.dataset.loadingLabel ?? originalLabel;
    }

    try {
      const walkResult = await walkHaloDocuments(button.href, {
        signal,
        headers: { "X-Requested-With": "Akari-Archive-Hydration" },
        maxPages: focusEnd ? 60 : 12,
        visit: (parsed) => {
          const nextUrl = mergeArchiveDocument(parsed);
          if (nextUrl) {
            button.href = nextUrl;
          }
          return nextUrl;
        },
      });
      if (walkResult.nextUrl) {
        button.href = walkResult.nextUrl;
        button.hidden = false;
      } else {
        finish(focusEnd);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error(error);
      button.hidden = false;
      showToast(
        button.dataset.errorLabel ?? "Unable to load earlier archives.",
      );
    } finally {
      loading = false;
      results.removeAttribute("aria-busy");
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-disabled");
      if (icon) {
        icon.className = originalIconClassName;
      }
      if (label) {
        label.textContent = originalLabel;
      }
    }
  };

  bindYearLinks();
  updateStatistics();
  applyYearVisibility();
  if (button) {
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        void loadRemaining(true);
      },
      { signal },
    );
    void loadRemaining(false);
  } else {
    finish(false);
  }
}
