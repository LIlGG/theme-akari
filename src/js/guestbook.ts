import { animate, hover, stagger } from "motion";
import {
  type ApiError,
  type CommentConfig,
  type CommentItem,
  type CurrentUser,
  type ListResult,
  type ReplyItem,
  commentContentHtml,
  commentApi,
  escapeHtml,
  formatCommentTime as formatTime,
  setCommentAvatar as setAvatar,
  textToHtml,
} from "./comment-client";
import { createCommentBootstrap } from "./services/comment-bootstrap";
import {
  guestbookElements,
  guestbookLabels,
  guestbookSubject,
} from "./services/comment-dom";
import {
  clearPrimedCommentPage,
  getPrimedCommentPage,
} from "./services/comment-prime";
import {
  canAnimateComments,
  createCommentAnnouncer,
  createCommentCaptcha,
  setCommentCaptchaImage,
  shouldShowAnonymousCaptcha,
} from "./services/comment-runtime";
import {
  anonymousOwner,
  bindCommentUpvote,
  captchaHeaders,
  captchaSource,
  createCommentPaginator,
  readAnonymousProfile,
  readCommentDraft,
  readReplyDraft,
  rememberAnonymousProfile,
} from "./services/comment-ui";
import { asVoidEventHandler } from "./utils/async";

const MOODS = ["sun", "tea", "star"] as const;
type Mood = (typeof MOODS)[number];

const moodIcons: Record<Mood, string> = {
  sun: "i-lucide-sun",
  tea: "i-lucide-coffee",
  star: "i-lucide-sparkles",
};

const moodClasses: Record<Mood, string> = {
  sun: "note-sun",
  tea: "note-tea",
  star: "note-star",
};

const canAnimate = canAnimateComments;

function stableMood(comment: CommentItem): Mood {
  const marker = comment.spec.raw?.match(
    /^\[akari:mood=(sun|tea|star)](?:\r?\n|\s)*/,
  );
  if (marker && MOODS.includes(marker[1] as Mood)) {
    return marker[1] as Mood;
  }
  const hash = [...comment.metadata.name].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return MOODS[hash % MOODS.length];
}

export function initGuestbook(rootElement?: HTMLElement, signal?: AbortSignal) {
  const root =
    rootElement ??
    document.querySelector<HTMLElement>("[data-akari-guestbook]");
  if (!root) {
    return;
  }
  const ownedController = signal ? null : new AbortController();
  const lifecycleSignal = signal ?? ownedController!.signal;
  const api = <T>(url: string, init: RequestInit = {}) =>
    commentApi<T>(url, { ...init, signal: lifecycleSignal });

  const requiredElements = guestbookElements(root);
  if (!requiredElements) {
    return;
  }
  const {
    form,
    list,
    messageInput,
    nameInput,
    emailInput,
    websiteInput,
    guestFields,
    counter,
    submit,
  } = requiredElements;
  const total = root.querySelector<HTMLElement>("[data-guestbook-total]");
  const loadMore = root.querySelector<HTMLButtonElement>(
    "[data-guestbook-load-more]",
  );
  const captchaBox = root.querySelector<HTMLElement>(
    "[data-guestbook-captcha]",
  );
  const captchaImage = root.querySelector<HTMLImageElement>(
    "[data-captcha-image]",
  );
  const captchaCode = root.querySelector<HTMLInputElement>(
    "[data-captcha-code]",
  );
  const captchaRefresh = root.querySelector<HTMLButtonElement>(
    "[data-captcha-refresh]",
  );
  const state = root.querySelector<HTMLElement>("[data-guestbook-form-state]");
  const toast = root.querySelector<HTMLElement>("[data-guestbook-toast]");

  const labels = guestbookLabels(root);
  const subjectRef = guestbookSubject(root);
  const messageLimit = Number(root.dataset.messageLimit) || 140;
  const commentEnabled = root.dataset.commentEnabled === "true";
  const pluginAvailable = root.dataset.commentPlugin === "true";
  const upvotedKey = "halo.upvoted.comments";
  let currentUser: CurrentUser | undefined;
  let allowAnonymous = false;
  let config: CommentConfig = {};

  messageInput.maxLength = messageLimit;
  counter.textContent = `0 / ${messageLimit}`;

  const announcer = createCommentAnnouncer({ state, toast });
  const { announce } = announcer;

  const captcha = createCommentCaptcha({
    box: captchaBox,
    image: captchaImage,
    code: captchaCode,
    api,
    shouldShow: () =>
      shouldShowAnonymousCaptcha({ allowAnonymous, config, currentUser }),
    imageAlt: root.dataset.labelCaptchaRequired ?? "Captcha",
  });
  const refreshCaptcha = captcha.refresh;

  const setFormAvailability = () => {
    if (!commentEnabled || (!currentUser && !allowAnonymous)) {
      [...form.elements].forEach(
        (control) => ((control as HTMLInputElement).disabled = true),
      );
      announce(labels.loginRequired, "info");
      return;
    }
    if (currentUser) {
      nameInput.value =
        currentUser.spec.displayName || currentUser.metadata.name;
      nameInput.readOnly = true;
      nameInput.classList.add("is-current-user");
      guestFields.hidden = true;
    } else {
      const profile = readAnonymousProfile(
        "akari.guestbook.profile",
        "akari.guestbook.displayName",
      );
      nameInput.value = profile.displayName;
      emailInput.value = profile.email;
      websiteInput.value = profile.website;
      guestFields.hidden = false;
    }
  };

  const commentsUrl = (requestedPage: number) => {
    const params = new URLSearchParams({
      ...subjectRef,
      page: String(requestedPage),
      size: String(config.basic?.size || 20),
      withReplies: "false",
    });
    return `/apis/api.halo.run/v1alpha1/comments?${params}`;
  };

  const renderEmpty = () => {
    list.innerHTML = `
      <div class="guestbook-empty-note">
        <span class="guestbook-empty-pin" aria-hidden="true"></span>
        <span class="i-lucide-sticky-note"></span>
        <p>${escapeHtml(labels.empty)}</p>
      </div>`;
  };

  const renderReplies = async (comment: CommentItem, region: HTMLElement) => {
    region.dataset.loading = "true";
    region.innerHTML =
      '<div class="guestbook-reply-loading"><span></span><span></span><span></span></div>';
    try {
      const replies = await api<ListResult<ReplyItem>>(
        `/apis/api.halo.run/v1alpha1/comments/${encodeURIComponent(comment.metadata.name)}/reply?page=1&size=${config.basic?.replySize || 20}`,
      );
      const replyList = document.createElement("div");
      replyList.className = "guestbook-reply-list";
      if (!replies.items.length) {
        replyList.innerHTML = `<p class="guestbook-no-replies">${escapeHtml(labels.noReplies)}</p>`;
      } else {
        replies.items.forEach((reply) => {
          const item = document.createElement("article");
          item.className = "guestbook-reply-item";
          item.innerHTML = `
            <span class="guestbook-reply-avatar"></span>
            <div>
              <header><strong>${escapeHtml(reply.owner.displayName || reply.owner.name || "")}</strong><time>${escapeHtml(formatTime(reply.metadata.creationTimestamp))}</time></header>
              <div class="guestbook-reply-content"></div>
            </div>`;
          setAvatar(
            item.querySelector<HTMLElement>(".guestbook-reply-avatar")!,
            reply.owner,
          );
          item.querySelector<HTMLElement>(
            ".guestbook-reply-content",
          )!.innerHTML = commentContentHtml(reply);
          replyList.append(item);
        });
      }
      region.replaceChildren(replyList);
      if (canAnimate() && replies.items.length) {
        animate(
          region.querySelectorAll(".guestbook-reply-item"),
          { opacity: [0, 1], transform: ["translateY(7px)", "translateY(0)"] },
          { duration: 0.3, delay: stagger(0.04), ease: "easeOut" },
        );
      }
    } catch {
      region.innerHTML = `<p class="guestbook-no-replies">${escapeHtml(labels.loadError)}</p>`;
    } finally {
      delete region.dataset.loading;
    }
  };

  const mountInlineCaptcha = async (
    formElement: HTMLFormElement,
    suppliedImage?: string,
  ) => {
    let captcha = formElement.querySelector<HTMLElement>(
      ".guestbook-inline-captcha",
    );
    if (!captcha) {
      captcha = document.createElement("div");
      captcha.className = "guestbook-inline-captcha";
      captcha.innerHTML = `
        <button type="button" aria-label="${escapeHtml(root.dataset.labelCaptchaRequired ?? "Captcha")}"><img alt="" data-runtime-image /></button>
        <input name="captchaCode" autocomplete="off" aria-label="${escapeHtml(root.dataset.labelCaptchaRequired ?? "Captcha")}" placeholder="${escapeHtml(root.dataset.labelCaptchaRequired ?? "Captcha")}" required />`;
      formElement.querySelector(".guestbook-reply-actions")?.before(captcha);
      captcha
        .querySelector("button")
        ?.addEventListener("click", () => void mountInlineCaptcha(formElement));
    }
    const image = captcha.querySelector<HTMLImageElement>("img");
    if (!image) {
      return;
    }
    try {
      const source =
        suppliedImage ??
        (await api<string>(
          "/apis/api.commentwidget.halo.run/v1alpha1/captcha/-/generate",
        ));
      setCommentCaptchaImage(
        image,
        source,
        root.dataset.labelCaptchaRequired ?? "Captcha",
      );
      captcha.hidden = false;
    } catch {
      captcha.hidden = true;
    }
  };

  const createReplyForm = (
    comment: CommentItem,
    card: HTMLElement,
    replies: HTMLElement,
  ) => {
    const replyForm = document.createElement("form");
    replyForm.className = "guestbook-reply-form";
    replyForm.innerHTML = `
      ${
        currentUser
          ? ""
          : `<div class="guestbook-inline-identity">
              <input name="displayName" maxlength="48" autocomplete="nickname" value="${escapeHtml(nameInput.value)}" placeholder="${escapeHtml(nameInput.placeholder)}" required />
              <input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(emailInput.value)}" placeholder="${escapeHtml(emailInput.placeholder)}" required />
              <input name="website" type="url" maxlength="2048" autocomplete="url" value="${escapeHtml(websiteInput.value)}" placeholder="${escapeHtml(websiteInput.placeholder)}" />
            </div>`
      }
      <textarea name="message" rows="3" maxlength="${messageLimit}" placeholder="${escapeHtml(labels.replyPlaceholder)}" required></textarea>
      <div class="guestbook-reply-actions">
        <button type="submit"><span class="i-lucide-send"></span>${escapeHtml(labels.submitReply)}</button>
      </div>`;

    if (shouldShowAnonymousCaptcha({ allowAnonymous, config, currentUser })) {
      void mountInlineCaptcha(replyForm);
    }

    const submitReply = async (event: SubmitEvent) => {
      event.preventDefault();
      const replySubmit = replyForm.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      const draft = readReplyDraft({
        form: replyForm,
        currentUser,
        labels,
        announce,
      });
      if (!draft) {
        return;
      }
      replySubmit?.setAttribute("disabled", "");
      try {
        const created = await api<{ spec: { approved: boolean } }>(
          `/apis/api.halo.run/v1alpha1/comments/${encodeURIComponent(comment.metadata.name)}/reply`,
          {
            method: "POST",
            headers: captchaHeaders(draft.code),
            body: JSON.stringify({
              raw: draft.message,
              content: textToHtml(draft.message),
              allowNotification: false,
              ...anonymousOwner(currentUser, draft),
            }),
          },
        );
        if (!currentUser) {
          nameInput.value = draft.displayName;
          emailInput.value = draft.email;
          websiteInput.value = draft.website;
          rememberAnonymousProfile(
            currentUser,
            "akari.guestbook.profile",
            draft,
          );
        }
        draft.messageInput.value = "";
        announce(
          created.spec.approved ? labels.submitSuccess : labels.submitPending,
          "success",
        );
        await renderReplies(comment, replies);
      } catch (error) {
        const apiError = error as ApiError;
        if (apiError.requireCaptcha) {
          await mountInlineCaptcha(replyForm, captchaSource(apiError.data));
          announce(labels.captchaRequired, "error");
        } else {
          announce(apiError.message || labels.submitError, "error");
        }
      } finally {
        replySubmit?.removeAttribute("disabled");
      }
    };
    replyForm.addEventListener("submit", asVoidEventHandler(submitReply));

    card.querySelector(".paper-note-footer")?.after(replyForm);
    if (canAnimate()) {
      animate(
        replyForm,
        { opacity: [0, 1], transform: ["translateY(-5px)", "translateY(0)"] },
        { duration: 0.28, ease: "easeOut" },
      );
    }
    replyForm
      .querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
    return replyForm;
  };

  const createCard = (comment: CommentItem) => {
    const mood = stableMood(comment);
    const displayName = comment.owner.displayName || comment.owner.name || "";
    const article = document.createElement("article");
    article.className = `paper-note ${moodClasses[mood]}`;
    article.dataset.commentName = comment.metadata.name;
    article.innerHTML = `
      <header>
        <span class="paper-note-avatar"></span>
        <span class="paper-note-meta">
          <strong>${escapeHtml(displayName)}</strong>
          <time>${escapeHtml(formatTime(comment.spec.creationTime || comment.metadata.creationTimestamp))}</time>
        </span>
        <span class="paper-note-mood ${moodIcons[mood]}" aria-hidden="true"></span>
      </header>
      <div class="paper-note-content"></div>
      <footer class="paper-note-footer">
        <button type="button" data-comment-upvote aria-label="${escapeHtml(labels.upvote)}">
          <span class="i-lucide-heart"></span><span data-upvote-count>${comment.stats?.upvote || 0}</span>
        </button>
        <button type="button" data-comment-reply>
          <span class="i-lucide-message-circle"></span><span>${escapeHtml(labels.reply)}</span>
          <span data-reply-count>${comment.status?.visibleReplyCount || ""}</span>
        </button>
        ${comment.spec.approved ? "" : `<span class="paper-note-reviewing">${escapeHtml(labels.reviewing)}</span>`}
      </footer>
      <div class="paper-note-replies" hidden></div>`;

    setAvatar(
      article.querySelector<HTMLElement>(".paper-note-avatar")!,
      comment.owner,
    );
    article.querySelector<HTMLElement>(".paper-note-content")!.innerHTML =
      commentContentHtml(comment, { stripMood: true });

    const upvote = article.querySelector<HTMLButtonElement>(
      "[data-comment-upvote]",
    )!;
    const upvoteIcon = upvote.querySelector<HTMLElement>(
      "[class*='i-lucide-heart']",
    )!;
    const upvoteCount = upvote.querySelector<HTMLElement>(
      "[data-upvote-count]",
    )!;
    bindCommentUpvote({
      button: upvote,
      icon: upvoteIcon,
      count: upvoteCount,
      commentName: comment.metadata.name,
      storageKey: upvotedKey,
      api,
      canAnimate,
      scale: 1.24,
      onError: (error) => {
        announce((error as Error).message || labels.submitError, "error");
      },
    });

    const replyButton = article.querySelector<HTMLButtonElement>(
      "[data-comment-reply]",
    )!;
    const replies = article.querySelector<HTMLElement>(".paper-note-replies")!;
    let replyForm: HTMLFormElement | undefined;
    const toggleReplies = async () => {
      const opening = replies.hasAttribute("hidden");
      replies.hidden = !opening;
      replyButton.classList.toggle("is-open", opening);
      replyButton.querySelector<HTMLElement>("span:nth-child(2)")!.textContent =
        opening ? labels.cancelReply : labels.reply;
      if (!opening) {
        replyForm?.remove();
        replyForm = undefined;
        return;
      }
      if (!replies.dataset.loaded) {
        await renderReplies(comment, replies);
        replies.dataset.loaded = "true";
      }
      replyForm = createReplyForm(comment, article, replies);
      if (canAnimate()) {
        animate(
          replies,
          { opacity: [0, 1], transform: ["translateY(-4px)", "translateY(0)"] },
          { duration: 0.28 },
        );
      }
    };
    replyButton.addEventListener("click", asVoidEventHandler(toggleReplies));

    if (canAnimate()) {
      hover(article, (element) => {
        animate(
          element,
          { transform: "translateY(-3px)" },
          { duration: 0.2, ease: "easeOut" },
        );
        return () => {
          animate(
            element,
            { transform: "translateY(0)" },
            { duration: 0.26, ease: "easeOut" },
          );
        };
      });
    }
    return article;
  };

  const paginator = createCommentPaginator({
    api,
    commentsUrl,
    list,
    total,
    loadMore,
    lifecycleSignal,
    createCard,
    renderEmpty,
    renderError: () => {
      list.innerHTML = `<div class="guestbook-error-note"><span class="i-lucide-cloud-off"></span><p>${escapeHtml(labels.loadError)}</p></div>`;
    },
    countText: (count) => `${count}${labels.countSuffix}`,
    announceError: (error) => {
      announce((error as Error).message || labels.loadError, "error");
    },
    canAnimate,
    animationFrom: "translateY(14px) rotate(.18deg)",
    animationTo: "translateY(0) rotate(0deg)",
  });
  const loadComments = (options?: {
    append?: boolean;
    prefetched?: ListResult<CommentItem>;
  }) => (subjectRef.name ? paginator.load(options) : Promise.resolve());

  messageInput.addEventListener("input", () => {
    counter.textContent = `${messageInput.value.length} / ${messageLimit}`;
    counter.classList.toggle(
      "is-near-limit",
      messageInput.value.length >= messageLimit * 0.85,
    );
  });

  root
    .querySelectorAll<HTMLInputElement>('input[name="mood"]')
    .forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked || !canAnimate()) {
          return;
        }
        const chip = radio.nextElementSibling;
        if (chip) {
          animate(
            chip,
            { transform: ["scale(.94)", "scale(1.04)", "scale(1)"] },
            { duration: 0.36 },
          );
        }
      });
    });

  captchaRefresh?.addEventListener("click", () => void refreshCaptcha());
  const submitComment = async (event: SubmitEvent) => {
    event.preventDefault();
    const draft = readCommentDraft({
      currentUser,
      nameInput,
      emailInput,
      websiteInput,
      messageInput,
      captchaBox,
      captchaCode,
      labels,
      announce,
    });
    if (!draft) {
      return;
    }
    const mood = (form.querySelector<HTMLInputElement>(
      'input[name="mood"]:checked',
    )?.value || "sun") as Mood;

    submit.disabled = true;
    submit.classList.add("is-loading");
    try {
      const created = await api<{ spec: { approved: boolean } }>(
        "/apis/api.halo.run/v1alpha1/comments",
        {
          method: "POST",
          headers: captchaHeaders(draft.code),
          body: JSON.stringify({
            raw: `[akari:mood=${mood}]\n${draft.message}`,
            content: textToHtml(draft.message),
            allowNotification: false,
            hidden: false,
            subjectRef,
            ...anonymousOwner(currentUser, draft),
          }),
        },
      );
      rememberAnonymousProfile(currentUser, "akari.guestbook.profile", draft);
      messageInput.value = "";
      counter.textContent = `0 / ${messageLimit}`;
      const sunny = form.querySelector<HTMLInputElement>(
        'input[name="mood"][value="sun"]',
      );
      if (sunny) {
        sunny.checked = true;
      }
      announce(
        created.spec.approved ? labels.submitSuccess : labels.submitPending,
        "success",
      );
      clearPrimedCommentPage(subjectRef);
      if (created.spec.approved) {
        await loadComments();
      }
      await refreshCaptcha();
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.requireCaptcha) {
        const source = captchaSource(apiError.data);
        if (captchaBox && captchaImage && source) {
          captchaBox.hidden = false;
          setCommentCaptchaImage(
            captchaImage,
            source,
            root.dataset.labelCaptchaRequired ?? "Captcha",
          );
        } else {
          await refreshCaptcha();
        }
        announce(labels.captchaRequired, "error");
      } else {
        announce(apiError.message || labels.submitError, "error");
      }
    } finally {
      submit.disabled = false;
      submit.classList.remove("is-loading");
    }
  };
  form.addEventListener("submit", asVoidEventHandler(submitComment));

  const primedPage = getPrimedCommentPage(subjectRef);
  const bootstrap = createCommentBootstrap(
    api,
    pluginAvailable,
    primedPage?.then((value) => value?.config),
  );
  const configReady = bootstrap.config.then((value) => {
    config = value;
  });

  void (async () => {
    const primed = await primedPage;
    await configReady;
    if (lifecycleSignal.aborted) {
      return;
    }
    await loadComments({ prefetched: primed?.result });
  })();

  void (async () => {
    const identity = await bootstrap.identity;
    await configReady;
    if (lifecycleSignal.aborted) {
      return;
    }
    allowAnonymous = identity.allowAnonymous;
    currentUser = identity.currentUser;
    setFormAvailability();
    await refreshCaptcha();
  })();

  return () => {
    ownedController?.abort();
    announcer.dispose();
  };
}
