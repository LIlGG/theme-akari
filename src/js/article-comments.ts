import { animate, stagger } from "motion";
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
  formatCommentTime,
  setCommentAvatar,
  textToHtml,
} from "./comment-client";
import { createCommentBootstrap } from "./services/comment-bootstrap";
import {
  articleCommentElements,
  articleCommentLabels,
  articleCommentSubject,
} from "./services/comment-dom";
import {
  clearPrimedCommentPage,
  getPrimedCommentPage,
} from "./services/comment-prime";
import {
  canAnimateComments,
  createCommentAnnouncer,
  createCommentCaptcha,
} from "./services/comment-runtime";
import {
  anonymousOwner,
  bindCommentUpvote,
  captchaHeaders,
  captchaSource,
  createCommentPaginator,
  readCommentDraft,
  readReplyDraft,
  rememberAnonymousName,
} from "./services/comment-ui";
import { asVoidEventHandler } from "./utils/async";

const canAnimate = canAnimateComments;

const responseTones = [
  "response-mint",
  "response-sun",
  "response-peach",
] as const;

function responseTone(name: string) {
  const hash = [...name].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return responseTones[hash % responseTones.length];
}

export function initArticleComments(
  rootElement?: HTMLElement,
  signal?: AbortSignal,
) {
  const root =
    rootElement ??
    document.querySelector<HTMLElement>("[data-akari-article-comments]");
  if (!root) {
    return;
  }
  const ownedController = signal ? null : new AbortController();
  const lifecycleSignal = signal ?? ownedController!.signal;
  const api = <T>(url: string, init: RequestInit = {}) =>
    commentApi<T>(url, { ...init, signal: lifecycleSignal });

  const requiredElements = articleCommentElements(root);
  if (!requiredElements) {
    return;
  }
  const {
    composer,
    composeToggle,
    nameInput,
    messageInput,
    counter,
    submit,
    list,
  } = requiredElements;
  const composeToggleLabel = composeToggle?.querySelector<HTMLElement>(
    "[data-compose-toggle-label]",
  );
  const state = root.querySelector<HTMLElement>("[data-article-comment-state]");
  const total = root.querySelector<HTMLElement>("[data-article-comment-total]");
  const loadMore = root.querySelector<HTMLButtonElement>(
    "[data-article-comment-load-more]",
  );
  const captchaBox = root.querySelector<HTMLElement>(
    "[data-article-comment-captcha]",
  );
  const captchaImage = root.querySelector<HTMLImageElement>(
    "[data-article-captcha-image]",
  );
  const captchaCode = root.querySelector<HTMLInputElement>(
    "[data-article-captcha-code]",
  );
  const captchaRefresh = root.querySelector<HTMLButtonElement>(
    "[data-article-captcha-refresh]",
  );
  const toast = root.querySelector<HTMLElement>("[data-article-comment-toast]");

  const labels = articleCommentLabels(root);
  const subjectRef = articleCommentSubject(root);
  const messageLimit = Number(root.dataset.messageLimit) || 800;
  const commentEnabled = root.dataset.commentEnabled === "true";
  const pluginAvailable = root.dataset.commentPlugin === "true";
  const upvotedKey = "halo.upvoted.comments";
  let currentUser: CurrentUser | undefined;
  let allowAnonymous = false;
  let config: CommentConfig = {};

  messageInput.maxLength = messageLimit;
  counter.textContent = `0 / ${messageLimit}`;

  const announcer = createCommentAnnouncer({
    state,
    toast,
    duration: 0.36,
    bounce: 0.14,
  });
  const { announce } = announcer;

  const setComposerOpen = (open: boolean, focus = true) => {
    composer.hidden = !open;
    composeToggle.classList.toggle("is-open", open);
    composeToggle.setAttribute("aria-expanded", String(open));
    if (composeToggleLabel) {
      composeToggleLabel.textContent = open
        ? labels.closeComposer
        : labels.write;
    }
    if (!open) {
      return;
    }
    if (canAnimate()) {
      animate(
        composer,
        {
          opacity: [0, 1],
          transform: [
            "translateY(-10px) scale(.992)",
            "translateY(0) scale(1)",
          ],
        },
        { duration: 0.42, type: "spring", bounce: 0.12 },
      );
    }
    if (focus) {
      window.setTimeout(() => messageInput.focus({ preventScroll: true }), 90);
    }
  };

  const openComposerFromPage = () => {
    root.scrollIntoView({
      behavior: canAnimate() ? "smooth" : "auto",
      block: "start",
    });
    setComposerOpen(true, false);
    window.setTimeout(
      () => messageInput.focus({ preventScroll: true }),
      canAnimate() ? 480 : 0,
    );
  };

  composeToggle.addEventListener("click", () =>
    setComposerOpen(composer.hidden === true),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-article-comment-jump]")
    .forEach((button) => {
      button.addEventListener("click", openComposerFromPage);
    });

  const captcha = createCommentCaptcha({
    box: captchaBox,
    image: captchaImage,
    code: captchaCode,
    api,
    shouldShow: () =>
      !currentUser &&
      allowAnonymous &&
      config.security?.captcha?.enable !== false &&
      config.security?.captcha?.anonymousCommentCaptcha === true,
  });
  const refreshCaptcha = captcha.refresh;

  const setFormAvailability = () => {
    if (!commentEnabled || (!currentUser && !allowAnonymous)) {
      [...composer.elements].forEach(
        (control) => ((control as HTMLInputElement).disabled = true),
      );
      composeToggle.disabled = true;
      announce(labels.loginRequired, "info");
      return;
    }
    if (currentUser) {
      nameInput.value =
        currentUser.spec.displayName || currentUser.metadata.name;
      nameInput.readOnly = true;
      nameInput.classList.add("is-current-user");
    } else {
      nameInput.value =
        window.localStorage.getItem("akari.comment.displayName") ?? "";
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
      <div class="article-comment-empty">
        <span class="i-lucide-mail-open" aria-hidden="true"></span>
        <p>${escapeHtml(labels.empty)}</p>
      </div>`;
  };

  const renderReplies = async (comment: CommentItem, region: HTMLElement) => {
    region.setAttribute("aria-busy", "true");
    region.innerHTML =
      '<div class="article-reply-loading"><span></span><span></span><span></span></div>';
    try {
      const replies = await api<ListResult<ReplyItem>>(
        `/apis/api.halo.run/v1alpha1/comments/${encodeURIComponent(comment.metadata.name)}/reply?page=1&size=${config.basic?.replySize || 20}`,
      );
      const replyList = document.createElement("div");
      replyList.className = "article-reply-list";
      if (!replies.items.length) {
        replyList.innerHTML = `<p class="article-reply-empty">${escapeHtml(labels.noReplies)}</p>`;
      } else {
        replies.items.forEach((reply) => {
          const item = document.createElement("article");
          item.className = "article-reply-item";
          item.innerHTML = `
            <span class="article-reply-avatar"></span>
            <div class="article-reply-copy">
              <header><strong>${escapeHtml(reply.owner.displayName || reply.owner.name || "")}</strong><time>${escapeHtml(formatCommentTime(reply.spec.creationTime || reply.metadata.creationTimestamp))}</time></header>
              <div class="article-reply-content"></div>
            </div>`;
          setCommentAvatar(
            item.querySelector<HTMLElement>(".article-reply-avatar")!,
            reply.owner,
          );
          item.querySelector<HTMLElement>(".article-reply-content")!.innerHTML =
            commentContentHtml(reply);
          replyList.append(item);
        });
      }
      region.replaceChildren(replyList);
      if (canAnimate() && replies.items.length) {
        animate(
          region.querySelectorAll(".article-reply-item"),
          { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
          { duration: 0.32, delay: stagger(0.045), ease: "easeOut" },
        );
      }
    } catch {
      region.innerHTML = `<p class="article-reply-empty">${escapeHtml(labels.loadError)}</p>`;
    } finally {
      region.setAttribute("aria-busy", "false");
    }
  };

  const mountInlineCaptcha = async (
    form: HTMLFormElement,
    suppliedImage?: string,
  ) => {
    let captcha = form.querySelector<HTMLElement>(".article-inline-captcha");
    if (!captcha) {
      captcha = document.createElement("div");
      captcha.className = "article-inline-captcha";
      captcha.innerHTML = `
        <button type="button"><img alt="" /></button>
        <input name="captchaCode" autocomplete="off" placeholder="${escapeHtml(labels.captchaRequired)}" />`;
      form.querySelector(".article-inline-reply-actions")?.before(captcha);
      captcha
        .querySelector("button")
        ?.addEventListener("click", () => void mountInlineCaptcha(form));
    }
    const image = captcha.querySelector<HTMLImageElement>("img");
    if (!image) {
      return;
    }
    try {
      image.src =
        suppliedImage ??
        (await api<string>(
          "/apis/api.commentwidget.halo.run/v1alpha1/captcha/-/generate",
        ));
      captcha.hidden = false;
    } catch {
      captcha.hidden = true;
    }
  };

  const createReplyForm = (comment: CommentItem, replies: HTMLElement) => {
    const form = document.createElement("form");
    form.className = "article-inline-reply";
    form.innerHTML = `
      ${currentUser ? "" : `<input name="displayName" maxlength="48" autocomplete="nickname" value="${escapeHtml(nameInput.value)}" placeholder="${escapeHtml(nameInput.placeholder)}" required />`}
      <textarea name="message" rows="3" maxlength="${messageLimit}" placeholder="${escapeHtml(labels.replyPlaceholder)}" required></textarea>
      <div class="article-inline-reply-actions">
        <button type="submit"><span class="i-lucide-send"></span>${escapeHtml(labels.submitReply)}</button>
      </div>`;

    if (
      !currentUser &&
      config.security?.captcha?.enable !== false &&
      config.security?.captcha?.anonymousCommentCaptcha
    ) {
      void mountInlineCaptcha(form);
    }

    const submitReply = async (event: SubmitEvent) => {
      event.preventDefault();
      const replySubmit = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      const draft = readReplyDraft({
        form,
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
              ...anonymousOwner(currentUser, draft.displayName),
            }),
          },
        );
        if (draft.displayName) {
          nameInput.value = draft.displayName;
          rememberAnonymousName(
            currentUser,
            "akari.comment.displayName",
            draft.displayName,
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
          await mountInlineCaptcha(form, captchaSource(apiError.data));
          announce(labels.captchaRequired, "error");
        } else {
          announce(apiError.message || labels.submitError, "error");
        }
      } finally {
        replySubmit?.removeAttribute("disabled");
      }
    };
    form.addEventListener("submit", asVoidEventHandler(submitReply));

    replies.after(form);
    if (canAnimate()) {
      animate(
        form,
        { opacity: [0, 1], transform: ["translateY(-6px)", "translateY(0)"] },
        { duration: 0.3, ease: "easeOut" },
      );
    }
    form
      .querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
    return form;
  };

  const createCard = (comment: CommentItem) => {
    const displayName = comment.owner.displayName || comment.owner.name || "";
    const replyCount = comment.status?.visibleReplyCount || 0;
    const article = document.createElement("article");
    article.className = `article-response-card ${responseTone(comment.metadata.name)}${comment.spec.top ? " is-pinned" : ""}`;
    article.dataset.commentName = comment.metadata.name;
    article.innerHTML = `
      <span class="article-response-avatar"></span>
      <div class="article-response-copy">
        <header class="article-response-header">
          <span class="article-response-meta">
            <strong>${escapeHtml(displayName)}</strong>
            <time>${escapeHtml(formatCommentTime(comment.spec.creationTime || comment.metadata.creationTimestamp))}</time>
          </span>
          ${comment.spec.top ? `<span class="article-response-badge"><span class="i-lucide-pin"></span>${escapeHtml(labels.pinned)}</span>` : ""}
        </header>
        <div class="article-response-content"></div>
        <footer class="article-response-footer">
          <button type="button" data-comment-upvote aria-label="${escapeHtml(labels.upvote)}">
            <span class="i-lucide-heart"></span><span data-upvote-count>${comment.stats?.upvote || 0}</span>
          </button>
          <button type="button" data-comment-reply aria-expanded="false">
            <span class="i-lucide-message-circle"></span><span data-reply-label>${escapeHtml(labels.reply)}</span>
            <span data-reply-count>${replyCount ? `${replyCount} ${escapeHtml(labels.replies)}` : ""}</span>
          </button>
          ${comment.spec.approved ? "" : `<span class="article-response-badge">${escapeHtml(labels.reviewing)}</span>`}
        </footer>
        <div class="article-response-replies" hidden></div>
      </div>`;

    setCommentAvatar(
      article.querySelector<HTMLElement>(".article-response-avatar")!,
      comment.owner,
    );
    article.querySelector<HTMLElement>(".article-response-content")!.innerHTML =
      commentContentHtml(comment);

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
      onError: (error) => {
        announce((error as Error).message || labels.submitError, "error");
      },
    });

    const replyButton = article.querySelector<HTMLButtonElement>(
      "[data-comment-reply]",
    )!;
    const replyLabel =
      replyButton.querySelector<HTMLElement>("[data-reply-label]")!;
    const replies = article.querySelector<HTMLElement>(
      ".article-response-replies",
    )!;
    let replyForm: HTMLFormElement | undefined;
    const toggleReplies = async () => {
      const opening = replies.hidden === true;
      replies.hidden = !opening;
      replyButton.classList.toggle("is-open", opening);
      replyButton.setAttribute("aria-expanded", String(opening));
      replyLabel.textContent = opening ? labels.closeReply : labels.reply;
      if (!opening) {
        replyForm?.remove();
        replyForm = undefined;
        return;
      }
      if (!replies.dataset.loaded) {
        await renderReplies(comment, replies);
        replies.dataset.loaded = "true";
      }
      replyForm = createReplyForm(comment, replies);
      if (canAnimate()) {
        animate(
          replies,
          { opacity: [0, 1], transform: ["translateY(-5px)", "translateY(0)"] },
          { duration: 0.28 },
        );
      }
    };
    replyButton.addEventListener("click", asVoidEventHandler(toggleReplies));

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
      list.innerHTML = `<div class="article-comment-empty is-error"><span class="i-lucide-cloud-off"></span><p>${escapeHtml(labels.loadError)}</p></div>`;
    },
    countText: String,
    announceError: (error) => {
      announce((error as Error).message || labels.loadError, "error");
    },
    canAnimate,
    animationFrom: "translateY(16px) scale(.992)",
    animationTo: "translateY(0) scale(1)",
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
  captchaRefresh?.addEventListener("click", () => void refreshCaptcha());
  const submitComment = async (event: SubmitEvent) => {
    event.preventDefault();
    const draft = readCommentDraft({
      currentUser,
      nameInput,
      messageInput,
      captchaBox,
      captchaCode,
      labels,
      announce,
    });
    if (!draft) {
      return;
    }

    submit.disabled = true;
    submit.classList.add("is-loading");
    try {
      const created = await api<{ spec: { approved: boolean } }>(
        "/apis/api.halo.run/v1alpha1/comments",
        {
          method: "POST",
          headers: captchaHeaders(draft.code),
          body: JSON.stringify({
            raw: draft.message,
            content: textToHtml(draft.message),
            allowNotification: false,
            hidden: false,
            subjectRef,
            ...anonymousOwner(currentUser, draft.displayName),
          }),
        },
      );
      rememberAnonymousName(
        currentUser,
        "akari.comment.displayName",
        draft.displayName,
      );
      messageInput.value = "";
      counter.textContent = `0 / ${messageLimit}`;
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
        if (captchaBox && captchaImage) {
          captchaBox.hidden = false;
          captchaImage.src = captchaSource(apiError.data);
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
  composer.addEventListener("submit", asVoidEventHandler(submitComment));

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
