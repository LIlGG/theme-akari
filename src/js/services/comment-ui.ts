import { animate, stagger } from "motion";
import type { CommentItem, CurrentUser, ListResult } from "../comment-client";
import { asVoidEventHandler } from "../utils/async";
import { stringArray, stringValue } from "../utils/dom";

type CommentApi = <T>(url: string, init?: RequestInit) => Promise<T>;

export type CommentDraftLabels = {
  nameRequired: string;
  emailRequired: string;
  emailInvalid: string;
  websiteInvalid: string;
  messageRequired: string;
  captchaRequired: string;
};

export type AnonymousCommentProfile = {
  displayName: string;
  email: string;
  website: string;
};

type Announce = (message: string, tone: "error") => void;

type GuestProfileLabels = Pick<
  CommentDraftLabels,
  "nameRequired" | "emailRequired" | "emailInvalid" | "websiteInvalid"
>;

type GuestProfileInputs = {
  name: HTMLInputElement | null;
  email: HTMLInputElement | null;
  website: HTMLInputElement | null;
};

function requiredGuestValue(
  input: HTMLInputElement | null,
  message: string,
  announce: Announce,
) {
  const value = input?.value.trim() ?? "";
  if (value) {
    return value;
  }
  announce(message, "error");
  input?.focus();
  return null;
}

function validGuestField(
  input: HTMLInputElement | null,
  message: string,
  announce: Announce,
) {
  if (input?.checkValidity()) {
    return true;
  }
  announce(message, "error");
  input?.focus();
  return false;
}

function validateAnonymousProfile(
  currentUser: CurrentUser | undefined,
  inputs: GuestProfileInputs,
  labels: GuestProfileLabels,
  announce: Announce,
): AnonymousCommentProfile | null {
  if (currentUser) {
    return { displayName: "", email: "", website: "" };
  }

  const displayName = requiredGuestValue(
    inputs.name,
    labels.nameRequired,
    announce,
  );
  if (!displayName) {
    return null;
  }

  const email = requiredGuestValue(
    inputs.email,
    labels.emailRequired,
    announce,
  );
  if (!email) {
    return null;
  }
  if (!validGuestField(inputs.email, labels.emailInvalid, announce)) {
    return null;
  }

  const website = inputs.website?.value.trim() ?? "";
  if (
    website &&
    !validGuestField(inputs.website, labels.websiteInvalid, announce)
  ) {
    return null;
  }
  return { displayName, email, website };
}

export function datasetLabel(
  root: HTMLElement,
  key: keyof DOMStringMap,
  fallback: string,
) {
  return root.dataset[key]?.trim() || fallback;
}

export function captchaHeaders(code?: string) {
  return code ? { "X-Captcha-Code": code } : undefined;
}

export function anonymousOwner(
  currentUser: CurrentUser | undefined,
  profile: AnonymousCommentProfile,
) {
  return currentUser
    ? {}
    : {
        owner: {
          displayName: profile.displayName,
          email: profile.email,
          website: profile.website || undefined,
        },
      };
}

export function rememberAnonymousProfile(
  currentUser: CurrentUser | undefined,
  storageKey: string,
  profile: AnonymousCommentProfile,
) {
  if (!currentUser) {
    window.localStorage.setItem(storageKey, JSON.stringify(profile));
  }
}

export function readAnonymousProfile(
  storageKey: string,
  legacyNameKey: string,
): AnonymousCommentProfile {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "null",
    );
    if (value && typeof value === "object") {
      const profile = value as Partial<AnonymousCommentProfile>;
      return {
        displayName: profile.displayName?.trim() ?? "",
        email: profile.email?.trim() ?? "",
        website: profile.website?.trim() ?? "",
      };
    }
  } catch {
    // Fall through to the legacy display-name value used by older releases.
  }
  return {
    displayName: window.localStorage.getItem(legacyNameKey)?.trim() ?? "",
    email: "",
    website: "",
  };
}

type CommentDraftOptions = {
  currentUser: CurrentUser | undefined;
  nameInput: HTMLInputElement;
  emailInput: HTMLInputElement;
  websiteInput: HTMLInputElement;
  messageInput: HTMLTextAreaElement;
  captchaBox: HTMLElement | null;
  captchaCode: HTMLInputElement | null;
  labels: CommentDraftLabels;
  announce: Announce;
};

export function readCommentDraft(options: CommentDraftOptions) {
  const message = options.messageInput.value.trim();
  const profile = validateAnonymousProfile(
    options.currentUser,
    {
      name: options.nameInput,
      email: options.emailInput,
      website: options.websiteInput,
    },
    options.labels,
    options.announce,
  );
  if (!profile) {
    return null;
  }
  if (!message) {
    options.announce(options.labels.messageRequired, "error");
    options.messageInput.focus();
    return null;
  }
  const code = options.captchaCode?.value.trim();
  if (options.captchaBox && !options.captchaBox.hidden && !code) {
    options.announce(options.labels.captchaRequired, "error");
    options.captchaCode?.focus();
    return null;
  }
  return { ...profile, message, code };
}

type ReplyDraftOptions = {
  form: HTMLFormElement;
  currentUser: CurrentUser | undefined;
  labels: GuestProfileLabels & Pick<CommentDraftLabels, "messageRequired">;
  announce: Announce;
};

export function readReplyDraft(options: ReplyDraftOptions) {
  const messageInput = options.form.querySelector<HTMLTextAreaElement>(
    'textarea[name="message"]',
  );
  const nameInput = options.form.querySelector<HTMLInputElement>(
    'input[name="displayName"]',
  );
  const emailInput = options.form.querySelector<HTMLInputElement>(
    'input[name="email"]',
  );
  const websiteInput = options.form.querySelector<HTMLInputElement>(
    'input[name="website"]',
  );
  const message = messageInput?.value.trim() ?? "";
  if (!messageInput || !message) {
    options.announce(options.labels.messageRequired, "error");
    messageInput?.focus();
    return null;
  }
  const profile = validateAnonymousProfile(
    options.currentUser,
    { name: nameInput, email: emailInput, website: websiteInput },
    options.labels,
    options.announce,
  );
  if (!profile) {
    return null;
  }
  return {
    messageInput,
    nameInput,
    message,
    ...profile,
    code: options.form
      .querySelector<HTMLInputElement>('input[name="captchaCode"]')
      ?.value.trim(),
  };
}

export function captchaSource(errorData: Record<string, unknown> | undefined) {
  return stringValue(errorData?.captcha);
}

export function readStringSet(storageKey: string) {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "[]",
    );
    return new Set(stringArray(value));
  } catch {
    return new Set<string>();
  }
}

type UpvoteOptions = {
  button: HTMLButtonElement;
  icon: HTMLElement;
  count: HTMLElement;
  commentName: string;
  storageKey: string;
  api: CommentApi;
  onError: (error: unknown) => void;
  canAnimate: () => boolean;
  scale?: number;
};

export function bindCommentUpvote(options: UpvoteOptions) {
  const upvoted = readStringSet(options.storageKey);
  if (upvoted.has(options.commentName)) {
    options.button.classList.add("is-liked");
  }

  const upvote = async () => {
    if (upvoted.has(options.commentName)) {
      return;
    }
    options.button.disabled = true;
    try {
      await options.api("/apis/api.halo.run/v1alpha1/trackers/upvote", {
        method: "POST",
        body: JSON.stringify({
          name: options.commentName,
          plural: "comments",
          group: "content.halo.run",
        }),
      });
      upvoted.add(options.commentName);
      window.localStorage.setItem(
        options.storageKey,
        JSON.stringify([...upvoted]),
      );
      options.button.classList.add("is-liked");
      options.count.textContent = String(
        Number(options.count.textContent || 0) + 1,
      );
      if (options.canAnimate()) {
        animate(
          options.icon,
          {
            transform: [
              "scale(.82)",
              `scale(${options.scale ?? 1.22})`,
              "scale(1)",
            ],
          },
          { duration: 0.42 },
        );
      }
    } catch (error) {
      options.onError(error);
    } finally {
      options.button.disabled = false;
    }
  };
  options.button.addEventListener("click", asVoidEventHandler(upvote));
}

type CommentPaginatorOptions = {
  api: CommentApi;
  commentsUrl: (page: number) => string;
  list: HTMLElement;
  total: HTMLElement | null;
  loadMore: HTMLButtonElement | null;
  lifecycleSignal: AbortSignal;
  createCard: (comment: CommentItem) => HTMLElement;
  renderEmpty: () => void;
  renderError: () => void;
  countText: (total: number) => string;
  announceError: (error: unknown) => void;
  canAnimate: () => boolean;
  animationFrom: string;
  animationTo: string;
};

export function createCommentPaginator(options: CommentPaginatorOptions) {
  let page = 1;
  let loading = false;
  let hasNext = false;
  let hasRenderedComments = false;

  const renderResult = (result: ListResult<CommentItem>, append: boolean) => {
    const cards = result.items.map(options.createCard);
    if (append) {
      options.list.append(...cards);
    } else if (cards.length > 0) {
      options.list.replaceChildren(...cards);
    } else {
      options.renderEmpty();
    }
    hasNext = result.hasNext;
    if (options.total) {
      options.total.textContent = options.countText(result.total || 0);
    }
    if (options.loadMore) {
      options.loadMore.hidden = !hasNext;
    }
    const shouldAnimate = append || hasRenderedComments;
    hasRenderedComments = true;
    if (options.canAnimate() && shouldAnimate && cards.length > 0) {
      animate(
        cards,
        {
          opacity: [0, 1],
          transform: [options.animationFrom, options.animationTo],
        },
        {
          duration: 0.46,
          delay: stagger(0.055),
          ease: [0.22, 1, 0.36, 1],
        },
      );
    }
  };

  const load = async ({
    append = false,
    prefetched,
  }: {
    append?: boolean;
    prefetched?: ListResult<CommentItem>;
  } = {}) => {
    if (loading) {
      return;
    }
    loading = true;
    options.loadMore?.setAttribute("disabled", "");
    if (!append) {
      page = 1;
      options.list.setAttribute("aria-busy", "true");
    }
    try {
      const result =
        prefetched ??
        (await options.api<ListResult<CommentItem>>(options.commentsUrl(page)));
      if (options.lifecycleSignal.aborted) {
        return;
      }
      renderResult(result, append);
    } catch (error) {
      if (!append) {
        options.renderError();
      }
      options.announceError(error);
    } finally {
      loading = false;
      options.list.setAttribute("aria-busy", "false");
      options.loadMore?.removeAttribute("disabled");
    }
  };

  options.loadMore?.addEventListener(
    "click",
    () => {
      if (!hasNext) {
        return;
      }
      page += 1;
      void load({ append: true });
    },
    { signal: options.lifecycleSignal },
  );
  return { load };
}
