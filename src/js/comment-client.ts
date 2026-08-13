import { requestHalo } from "./services/halo-http";

export type CommentOwner = {
  avatar?: string;
  displayName?: string;
  name?: string;
};

export type CommentItem = {
  metadata: { name: string; creationTimestamp?: string };
  owner: CommentOwner;
  spec: {
    approved: boolean;
    content: string;
    creationTime?: string;
    hidden: boolean;
    raw: string;
    top?: boolean;
  };
  stats?: { upvote?: number };
  status?: { visibleReplyCount?: number };
};

export type ReplyItem = {
  metadata: { name: string; creationTimestamp?: string };
  owner: CommentOwner;
  spec: {
    approved: boolean;
    content: string;
    creationTime?: string;
    raw: string;
  };
  stats?: { upvote?: number };
};

export type ListResult<T> = {
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
  items: T[];
};

export type CommentConfig = {
  basic?: { size?: number; replySize?: number; withReplySize?: number };
  security?: {
    captcha?: {
      anonymousCommentCaptcha?: boolean;
      ignoreCase?: boolean;
      length?: number;
      type?: string;
    };
  };
};

export type CurrentUser = {
  metadata: { name: string };
  spec: { avatar?: string; displayName?: string };
};

export type ApiError = Error & {
  status?: number;
  data?: Record<string, unknown>;
  requireCaptcha?: boolean;
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

export function textToHtml(value: string) {
  return `<p>${escapeHtml(value.trim()).replace(/\r?\n/g, "<br>")}</p>`;
}

export function commentContentHtml(
  item: Pick<CommentItem | ReplyItem, "spec">,
  { stripMood = false }: { stripMood?: boolean } = {},
) {
  const rendered = item.spec.content?.trim();
  if (rendered) {
    return rendered;
  }

  let raw = item.spec.raw?.trim() ?? "";
  if (stripMood) {
    raw = raw.replace(/^\[akari:mood=(?:sun|tea|star)](?:\r?\n|\s)*/, "");
  }
  return raw ? textToHtml(raw) : "";
}

export function initialFor(owner: CommentOwner) {
  return (
    (owner.displayName || owner.name || "旅")
      .trim()
      .charAt(0)
      .toLocaleUpperCase() || "旅"
  );
}

export function formatCommentTime(value: string | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const locale = document.documentElement.lang || "zh-CN";
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfCommentDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const dayDistance = Math.round(
    (startOfToday - startOfCommentDay) / 86_400_000,
  );
  if (dayDistance === 0) {
    return `${relative.format(0, "day")} ${time}`;
  }
  if (dayDistance === 1) {
    return `${relative.format(-1, "day")} ${time}`;
  }
  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function commentApi<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  return requestHalo<T>(url, init);
}

export function setCommentAvatar(container: HTMLElement, owner: CommentOwner) {
  const avatar = owner.avatar?.trim();
  if (!avatar) {
    container.textContent = initialFor(owner);
    container.classList.add("is-initial");
    return;
  }
  const image = document.createElement("img");
  image.src = avatar;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.remove();
    container.textContent = initialFor(owner);
    container.classList.add("is-initial");
  });
  container.append(image);
}
