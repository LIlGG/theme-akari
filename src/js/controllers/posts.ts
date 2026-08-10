import { stagger } from "motion";
import { run, showToast } from "../runtime/context";
import { isAbortError } from "../services/halo-http";
import { asVoidEventHandler } from "../utils/async";

type PostListItem = {
  metadata?: { name?: string };
  spec?: { title?: string; cover?: string; publishTime?: string };
  status?: { permalink?: string; excerpt?: string };
  categories?: Array<{ spec?: { displayName?: string } }>;
};

type PostListPage = {
  items?: PostListItem[];
  total?: number;
  last?: boolean;
};

type PostItemOptions = {
  post: PostListItem;
  index: number;
  fallbackCover: string;
  fallbackCovers: string[];
};

function postItemData(options: PostItemOptions) {
  const { post, index, fallbackCover, fallbackCovers } = options;
  return {
    post,
    name: post.metadata?.name ?? post.status?.permalink ?? "",
    permalink: post.status?.permalink ?? "#",
    title: post.spec?.title?.trim() || "Untitled",
    fallbackCover:
      fallbackCovers[index % fallbackCovers.length] ?? fallbackCover,
  };
}

function formatPostDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join(".");
}

function createPostCover(
  permalink: string,
  title: string,
  cover: string,
  fallbackCover: string,
) {
  const link = document.createElement("a");
  link.href = permalink;
  const image = document.createElement("img");
  image.src = cover || fallbackCover;
  image.alt = title;
  image.loading = "lazy";
  if (fallbackCover) {
    image.dataset.fallbackSrc = fallbackCover;
    image.addEventListener("error", () => {
      if (image.dataset.fallbackAttempted === "true") {
        return;
      }
      image.dataset.fallbackAttempted = "true";
      image.src = fallbackCover;
    });
  }
  link.append(image);
  return link;
}

function createPostMeta(post: PostListItem) {
  const meta = document.createElement("p");
  meta.className = "meta";
  const category = post.categories?.[0]?.spec?.displayName?.trim();
  if (category) {
    const categoryElement = document.createElement("span");
    categoryElement.textContent = category;
    meta.append(categoryElement, document.createTextNode(" · "));
  }
  const time = document.createElement("time");
  time.textContent = formatPostDate(post.spec?.publishTime);
  if (post.spec?.publishTime) {
    time.dateTime = post.spec.publishTime;
  }
  meta.append(time);
  return meta;
}

function createPostItem(options: PostItemOptions) {
  const { post, name, permalink, title, fallbackCover } = postItemData(options);
  const article = document.createElement("article");
  article.hidden = true;
  article.dataset.postItem = "";
  if (name) {
    article.dataset.postName = name;
  }

  const copy = document.createElement("div");
  const heading = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.className = "title-link";
  titleLink.href = permalink;
  titleLink.textContent = title;
  heading.append(titleLink);
  const excerpt = document.createElement("p");
  excerpt.textContent = post.status?.excerpt?.trim() ?? "";
  copy.append(createPostMeta(post), heading, excerpt);
  article.append(
    createPostCover(
      permalink,
      title,
      post.spec?.cover?.trim() ?? "",
      fallbackCover,
    ),
    copy,
  );
  return article;
}

export function initPostList(signal?: AbortSignal) {
  const list = document.querySelector<HTMLElement>("[data-post-list]");
  const button = document.querySelector<HTMLButtonElement>(
    "[data-load-more-posts]",
  );
  const archiveLink = document.querySelector<HTMLElement>(
    "[data-load-more-end]",
  );
  const count = document.querySelector<HTMLElement>(
    "[data-visible-post-count]",
  );
  const totalCount = document.querySelector<HTMLElement>(
    "[data-total-post-count]",
  );
  if (!list || !button || !count) {
    return;
  }

  const items = [...list.querySelectorAll<HTMLElement>("[data-post-item]")];
  const knownNames = new Set(
    items
      .map((item) => item.dataset.postName)
      .filter((name): name is string => Boolean(name)),
  );
  const step = Number.parseInt(button.dataset.step ?? "2", 10);
  const revealSize = Number.isFinite(step) ? step : 2;
  const apiUrl = list.dataset.postApi;
  const fallbackCover = list.dataset.fallbackCover ?? "";
  const fallbackCovers = [
    fallbackCover,
    list.dataset.fallbackCoverJourney ?? "",
    list.dataset.fallbackCoverReading ?? "",
    list.dataset.fallbackCoverCinema ?? "",
  ].filter(Boolean);
  const originalLabel =
    button.querySelector<HTMLElement>("span:last-child")?.textContent ?? "";
  const buttonLabel = button.querySelector<HTMLElement>("span:last-child");
  const buttonIcon = button.querySelector<HTMLElement>("span:first-child");
  let total = Number.parseInt(list.dataset.total ?? String(items.length), 10);
  let apiPage = 1;
  let reachedLastApiPage = !apiUrl;
  let loading = false;

  const fetchUntilBuffered = async () => {
    while (
      items.filter((item) => item.hidden).length < revealSize &&
      !reachedLastApiPage &&
      apiUrl
    ) {
      const endpoint = new URL(apiUrl, window.location.origin);
      endpoint.searchParams.set("page", String(apiPage));
      endpoint.searchParams.set("size", "12");
      endpoint.searchParams.append("sort", "spec.publishTime,desc");
      const response = await fetch(endpoint, {
        signal,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`Post list request failed with ${response.status}`);
      }

      const page = (await response.json()) as PostListPage;
      apiPage += 1;
      reachedLastApiPage = Boolean(page.last) || !page.items?.length;
      if (Number.isFinite(page.total)) {
        total = Math.max(items.length, page.total ?? 0);
      }

      page.items?.forEach((post) => {
        const name = post.metadata?.name ?? post.status?.permalink;
        if (!name || knownNames.has(name)) {
          return;
        }
        knownNames.add(name);
        const item = createPostItem({
          post,
          index: items.length,
          fallbackCover,
          fallbackCovers,
        });
        list.append(item);
        items.push(item);
      });

      total = Math.max(total, items.length);
      list.dataset.total = String(total);
      if (totalCount) {
        totalCount.textContent = String(total);
      }
    }
  };

  const finish = () => {
    button.hidden = true;
    if (!archiveLink || !archiveLink.hidden) {
      return;
    }
    archiveLink.hidden = false;
    run(
      archiveLink,
      { opacity: [0, 1], transform: ["translateX(8px)", "translateX(0)"] },
      { duration: 0.26, ease: "easeOut" },
    );
  };

  const revealMore = async () => {
    if (loading) {
      return;
    }
    loading = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    buttonIcon?.classList.add("is-spinning");
    if (buttonLabel && !items.some((item) => item.hidden)) {
      buttonLabel.textContent = button.dataset.loadingLabel ?? originalLabel;
    }

    try {
      if (!items.some((item) => item.hidden)) {
        await fetchUntilBuffered();
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error(error);
      showToast(button.dataset.errorLabel ?? "Unable to load more posts.");
    }

    const nextItems = items.filter((item) => item.hidden).slice(0, revealSize);
    nextItems.forEach((item) => {
      item.hidden = false;
      item.removeAttribute("data-reveal");
    });

    count.textContent = String(items.filter((item) => !item.hidden).length);
    run(
      nextItems,
      { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] },
      { delay: stagger(0.06), duration: 0.38, ease: "easeOut" },
    );

    loading = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    buttonIcon?.classList.remove("is-spinning");
    if (buttonLabel) {
      buttonLabel.textContent = originalLabel;
    }

    const visibleCount = items.filter((item) => !item.hidden).length;
    count.textContent = String(visibleCount);
    if (
      !items.some((item) => item.hidden) &&
      (reachedLastApiPage || visibleCount >= total)
    ) {
      finish();
    }
  };
  button.addEventListener("click", asVoidEventHandler(revealMore), { signal });
}
