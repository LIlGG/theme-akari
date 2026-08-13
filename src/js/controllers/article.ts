import tocbot from "tocbot";
import { initPersistentAudioButtons } from "../persistent-audio-bridge";
import { prefersReducedMotion, showToast } from "../runtime/context";
import { hydrateMediaDurations } from "../services/media-metadata";
import { estimateReadingMinutes } from "../services/reading-time";

let tocObserver: MutationObserver | null = null;
let articleMediaCleanup: (() => void) | null = null;

export function disposeToc() {
  tocObserver?.disconnect();
  tocObserver = null;
  tocbot.destroy();
  articleMediaCleanup?.();
  articleMediaCleanup = null;
  document.documentElement.classList.remove("has-article-toc");
}

function mediaSource(audio: HTMLAudioElement) {
  return (
    audio.currentSrc ||
    audio.getAttribute("src") ||
    audio.querySelector<HTMLSourceElement>("source[src]")?.src ||
    ""
  ).trim();
}

function mediaFilename(source: string) {
  try {
    const filename = decodeURIComponent(
      new URL(source, window.location.href).pathname.split("/").pop() ?? "",
    );
    return filename.replace(/\.[a-z0-9]{2,6}$/i, "").trim();
  } catch {
    return "";
  }
}

type ArticleTrack = { source: string; title: string };

function audioTitle(
  audio: HTMLAudioElement,
  source: string,
  index: number,
  untitled: string,
) {
  const caption = audio
    .closest("figure")
    ?.querySelector<HTMLElement>("figcaption")
    ?.textContent?.trim();
  return (
    audio.dataset.title?.trim() ||
    audio.getAttribute("title")?.trim() ||
    caption ||
    mediaFilename(source) ||
    `${untitled} ${index + 1}`
  );
}

function normalizedMediaSource(source: string) {
  if (!source) {
    return "";
  }
  try {
    return new URL(source, window.location.href).href;
  } catch {
    return source;
  }
}

function collectArticleTracks(prose: HTMLElement, index: HTMLElement) {
  const articleTitle = index.dataset.articleTitle?.trim() || document.title;
  const untitled = index.dataset.untitledLabel?.trim() || "Audio";
  const candidates: ArticleTrack[] = [
    {
      source: index.dataset.primaryAudioSrc?.trim() ?? "",
      title: articleTitle,
    },
  ];
  for (const [audioIndex, audio] of [
    ...prose.querySelectorAll<HTMLAudioElement>("audio"),
  ].entries()) {
    const source = mediaSource(audio);
    candidates.push({
      source,
      title: audioTitle(audio, source, audioIndex, untitled),
    });
  }

  const sources = new Set<string>();
  return candidates.flatMap((track) => {
    const source = normalizedMediaSource(track.source);
    if (!source || sources.has(source)) {
      return [];
    }
    sources.add(source);
    return [{ ...track, source }];
  });
}

type MediaRowOptions = {
  track: ArticleTrack;
  trackIndex: number;
  playLabel: string;
  pauseLabel: string;
  artist?: string;
  artwork?: string;
};

function createMediaRow(options: MediaRowOptions) {
  const row = document.createElement("div");
  row.className = "article-media-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "article-media-play";
  button.dataset.audioToggle = "";
  button.dataset.audioId = `article:${window.location.pathname}:${options.trackIndex}`;
  button.dataset.audioSrc = options.track.source;
  button.dataset.audioTitle = options.track.title;
  if (options.artist) {
    button.dataset.audioArtist = options.artist;
  }
  if (options.artwork) {
    button.dataset.audioArtwork = options.artwork;
  }
  button.dataset.playLabel = `${options.playLabel}：${options.track.title}`;
  button.dataset.pauseLabel = `${options.pauseLabel}：${options.track.title}`;
  button.setAttribute(
    "aria-label",
    `${options.playLabel}：${options.track.title}`,
  );
  const icon = document.createElement("span");
  icon.className = "i-lucide-play";
  icon.dataset.audioIcon = "";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);

  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = options.track.title;
  const duration = document.createElement("small");
  duration.dataset.mediaDuration = "";
  duration.dataset.audioSrc = options.track.source;
  duration.textContent = "--:--";
  copy.append(title, duration);
  row.append(button, copy);
  return row;
}

function initArticleMediaIndex(
  prose: HTMLElement,
  aside: HTMLElement | null,
  signal?: AbortSignal,
) {
  const index = aside?.querySelector<HTMLElement>("[data-article-media-index]");
  const list = index?.querySelector<HTMLElement>("[data-article-media-list]");
  if (!index || !list) {
    return 0;
  }

  const tracks = collectArticleTracks(prose, index);

  if (!tracks.length) {
    return 0;
  }
  const playLabel = index.dataset.playLabel?.trim() || "Play audio";
  const pauseLabel = index.dataset.pauseLabel?.trim() || "Pause audio";
  const artist = index.dataset.articleArtist?.trim() || undefined;
  const artwork = index.dataset.articleArtwork?.trim() || undefined;
  const fragment = document.createDocumentFragment();

  tracks.forEach((track, trackIndex) =>
    fragment.append(
      createMediaRow({
        track,
        trackIndex,
        playLabel,
        pauseLabel,
        artist,
        artwork,
      }),
    ),
  );

  list.replaceChildren(fragment);
  index.hidden = false;
  const disposeDurations = hydrateMediaDurations(index, signal);
  const disposeButtons = initPersistentAudioButtons(index, showToast, signal);
  articleMediaCleanup = () => {
    disposeDurations?.();
    disposeButtons?.();
  };
  return tracks.length;
}

export function initArticleReading() {
  const prose = document.querySelector<HTMLElement>("[data-prose]");
  if (!prose) {
    return;
  }

  const firstParagraph = [...prose.children].find(
    (element): element is HTMLParagraphElement =>
      element instanceof HTMLParagraphElement &&
      Boolean(element.textContent?.trim()),
  );
  firstParagraph?.classList.add("article-deck");

  const readingTime = document.querySelector<HTMLElement>(
    "[data-reading-time]",
  );
  const readingTimeValue = readingTime?.querySelector<HTMLElement>(
    "[data-reading-time-value]",
  );
  if (!readingTime || !readingTimeValue) {
    return;
  }

  const minutes = estimateReadingMinutes(prose);
  const template = readingTime.dataset.readingTemplate ?? "AKARI_MINUTES min";
  const label = template.replace("AKARI_MINUTES", String(minutes));
  readingTimeValue.textContent = label;
  readingTime.dataset.minutes = String(minutes);
  readingTime.setAttribute("aria-label", label);
}

type EmptyTocElements = {
  toc: HTMLElement;
  tocTitle: HTMLElement | null | undefined;
  layout: HTMLElement | null;
  aside: HTMLElement | null;
  mediaCount: number;
};

function renderEmptyToc(elements: EmptyTocElements) {
  tocbot.destroy();
  document.documentElement.classList.remove("has-article-toc");
  elements.toc.hidden = true;
  if (elements.tocTitle) {
    elements.tocTitle.hidden = true;
  }
  if (elements.mediaCount > 0) {
    elements.layout?.classList.remove("has-no-toc");
    elements.aside?.classList.add("is-ready", "has-media-only");
    return;
  }
  elements.layout?.classList.add("has-no-toc");
  elements.aside?.remove();
}

export function initToc(signal?: AbortSignal) {
  disposeToc();
  const prose = document.querySelector<HTMLElement>("[data-prose]");
  const toc = document.querySelector<HTMLElement>("[data-toc]");
  if (!prose || !toc) {
    return;
  }

  const aside = toc.closest<HTMLElement>("[data-toc-aside]");
  const layout = prose.closest<HTMLElement>(".article-layout");
  const tocTitle = aside?.querySelector<HTMLElement>("[data-toc-title]");
  const mediaCount = initArticleMediaIndex(prose, aside, signal);

  const headings = [
    ...prose.querySelectorAll<HTMLHeadingElement>("h2, h3, h4"),
  ].filter((heading) => heading.textContent?.trim());

  const usedIds = new Set<string>();
  const createId = (heading: HTMLHeadingElement, index: number) => {
    const preferred =
      heading.id || heading.textContent?.trim() || `section-${index + 1}`;
    const base =
      preferred
        .toLocaleLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 72) || `section-${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (
      usedIds.has(candidate) ||
      (document.getElementById(candidate) &&
        document.getElementById(candidate) !== heading)
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  };

  headings.forEach((heading, index) => {
    heading.id = createId(heading, index);
  });

  if (!headings.length) {
    renderEmptyToc({ toc, tocTitle, layout, aside, mediaCount });
    return;
  }

  document.documentElement.classList.add("has-article-toc");
  layout?.classList.remove("has-no-toc");
  toc.hidden = false;
  if (tocTitle) {
    tocTitle.hidden = false;
  }
  aside?.classList.add("is-ready");
  const headerHeight =
    document
      .querySelector<HTMLElement>("[data-header]")
      ?.getBoundingClientRect().height ?? 72;
  const headingOffset = Math.round(headerHeight + 28);

  tocbot.destroy();
  tocbot.init({
    tocElement: toc,
    contentElement: prose,
    headingSelector: "h2, h3, h4",
    collapseDepth: 6,
    orderedList: true,
    scrollSmooth: !prefersReducedMotion.matches,
    scrollSmoothDuration: 420,
    scrollSmoothOffset: -headingOffset,
    headingsOffset: headingOffset,
    activeLinkClass: "is-active",
    listClass: "toc-list",
    listItemClass: "toc-item",
    includeTitleTags: true,
    ignoreHiddenElements: true,
    enableUrlHashUpdateOnScroll: false,
    tocScrollOffset: 26,
    headingLabelCallback: (label) => label.replace(/\s+/g, " ").trim(),
  });

  const syncAriaCurrent = () => {
    toc.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
      if (link.classList.contains("is-active")) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };
  syncAriaCurrent();
  tocObserver = new MutationObserver(syncAriaCurrent);
  tocObserver.observe(toc, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}
