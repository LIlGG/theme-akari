import { datasetLabel } from "./comment-ui";

export function articleCommentLabels(root: HTMLElement) {
  return {
    write: datasetLabel(root, "labelWrite", "写下回应"),
    closeComposer: datasetLabel(root, "labelCloseComposer", "收起回应"),
    empty: datasetLabel(
      root,
      "labelEmpty",
      "还没有回应，愿你成为第一位写信的人。",
    ),
    upvote: datasetLabel(root, "labelUpvote", "喜欢"),
    reply: datasetLabel(root, "labelReply", "回应"),
    closeReply: datasetLabel(root, "labelCloseReply", "收起对话"),
    replies: datasetLabel(root, "labelReplies", "条对话"),
    submitReply: datasetLabel(root, "labelSubmitReply", "寄出回应"),
    replyPlaceholder: datasetLabel(
      root,
      "labelReplyPlaceholder",
      "写下给这位读者的回应……",
    ),
    loadError: datasetLabel(
      root,
      "labelLoadError",
      "回应暂时没有送达，请稍后再试。",
    ),
    submitSuccess: datasetLabel(
      root,
      "labelSubmitSuccess",
      "回应已经留在文章下面了。",
    ),
    submitPending: datasetLabel(
      root,
      "labelSubmitPending",
      "回应已送达，审核通过后会出现在这里。",
    ),
    submitError: datasetLabel(
      root,
      "labelSubmitError",
      "回应没有寄出，请稍后再试。",
    ),
    nameRequired: datasetLabel(root, "labelNameRequired", "请先留下你的称呼。"),
    messageRequired: datasetLabel(
      root,
      "labelMessageRequired",
      "还没有写下回应。",
    ),
    reviewing: datasetLabel(root, "labelReviewing", "审核中"),
    pinned: datasetLabel(root, "labelPinned", "置顶"),
    noReplies: datasetLabel(root, "labelNoReplies", "还没有后续回应。"),
    captchaRequired: datasetLabel(
      root,
      "labelCaptchaRequired",
      "请完成验证码后再寄出。",
    ),
    loginRequired: datasetLabel(
      root,
      "labelLoginRequired",
      "本站只允许登录用户回应。",
    ),
  };
}

export function guestbookLabels(root: HTMLElement) {
  return {
    countSuffix: datasetLabel(root, "labelCountSuffix", "张"),
    empty: datasetLabel(root, "labelEmpty", "第一张纸条，等你来贴。"),
    upvote: datasetLabel(root, "labelUpvote", "喜欢"),
    reply: datasetLabel(root, "labelReply", "回应"),
    cancelReply: datasetLabel(root, "labelCancelReply", "收起回应"),
    submitReply: datasetLabel(root, "labelSubmitReply", "贴上回应"),
    replyPlaceholder: datasetLabel(
      root,
      "labelReplyPlaceholder",
      "写下一句回应…",
    ),
    loadError: datasetLabel(
      root,
      "labelLoadError",
      "纸条暂时没有送到，请稍后再试。",
    ),
    submitSuccess: datasetLabel(
      root,
      "labelSubmitSuccess",
      "纸条已经稳稳贴好了。",
    ),
    submitPending: datasetLabel(
      root,
      "labelSubmitPending",
      "纸条已送达，审核通过后会出现在墙上。",
    ),
    submitError: datasetLabel(
      root,
      "labelSubmitError",
      "纸条没有贴成功，请稍后再试。",
    ),
    nameRequired: datasetLabel(root, "labelNameRequired", "请先留下你的称呼。"),
    messageRequired: datasetLabel(
      root,
      "labelMessageRequired",
      "还没有写下想说的话。",
    ),
    reviewing: datasetLabel(root, "labelReviewing", "审核中"),
    noReplies: datasetLabel(root, "labelNoReplies", "还没有回应"),
    captchaRequired: datasetLabel(
      root,
      "labelCaptchaRequired",
      "请完成验证码后再贴纸条。",
    ),
    loginRequired: datasetLabel(
      root,
      "labelLoginRequired",
      "本站只允许登录用户留言。",
    ),
  };
}

function commentSubject(root: HTMLElement, fallbackKind: string) {
  return {
    group: datasetLabel(root, "commentGroup", "content.halo.run"),
    version: datasetLabel(root, "commentVersion", "v1alpha1"),
    kind: datasetLabel(root, "commentKind", fallbackKind),
    name: root.dataset.commentName?.trim() ?? "",
  };
}

export const articleCommentSubject = (root: HTMLElement) =>
  commentSubject(root, "Post");

export const guestbookSubject = (root: HTMLElement) =>
  commentSubject(root, "SinglePage");

function requiredElements<Elements extends Record<string, Element | null>>(
  elements: Elements,
) {
  if (Object.values(elements).some((element) => !element)) {
    return null;
  }
  return elements as {
    [Key in keyof Elements]: NonNullable<Elements[Key]>;
  };
}

export function articleCommentElements(root: HTMLElement) {
  return requiredElements({
    composer: root.querySelector<HTMLFormElement>(
      "[data-article-comment-form]",
    ),
    composeToggle: root.querySelector<HTMLButtonElement>(
      "[data-article-comment-compose-toggle]",
    ),
    nameInput: root.querySelector<HTMLInputElement>(
      "[data-article-comment-name]",
    ),
    messageInput: root.querySelector<HTMLTextAreaElement>(
      "[data-article-comment-message]",
    ),
    counter: root.querySelector<HTMLElement>("[data-article-comment-counter]"),
    submit: root.querySelector<HTMLButtonElement>(
      "[data-article-comment-submit]",
    ),
    list: root.querySelector<HTMLElement>("[data-article-comment-list]"),
  });
}

export function guestbookElements(root: HTMLElement) {
  return requiredElements({
    form: root.querySelector<HTMLFormElement>("[data-guestbook-form]"),
    list: root.querySelector<HTMLElement>("[data-guestbook-list]"),
    messageInput: root.querySelector<HTMLTextAreaElement>(
      "[data-guestbook-message]",
    ),
    nameInput: root.querySelector<HTMLInputElement>("[data-guestbook-name]"),
    counter: root.querySelector<HTMLElement>("[data-guestbook-counter]"),
    submit: root.querySelector<HTMLButtonElement>("[data-guestbook-submit]"),
  });
}
