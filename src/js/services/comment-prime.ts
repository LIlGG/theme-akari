import {
  type CommentConfig,
  type CommentItem,
  type ListResult,
  commentApi,
} from "../comment-client";

export type CommentSubjectRef = {
  group: string;
  version: string;
  kind: string;
  name: string;
};

export type PrimedCommentPage = {
  config: CommentConfig;
  result: ListResult<CommentItem>;
};

type PrimeEntry = {
  createdAt: number;
  promise: Promise<PrimedCommentPage | undefined>;
};

const PRIME_LIFETIME_MS = 30_000;
const primes = new Map<string, PrimeEntry>();

export function commentSubjectKey(subject: CommentSubjectRef) {
  return [subject.group, subject.version, subject.kind, subject.name].join("/");
}

function subjectFromDocument(scope: ParentNode) {
  const root = scope.querySelector<HTMLElement>(
    "[data-akari-guestbook], [data-akari-article-comments]",
  );
  if (
    !root ||
    root.dataset.commentEnabled !== "true" ||
    !root.dataset.commentName
  ) {
    return undefined;
  }

  return {
    root,
    subject: {
      group: root.dataset.commentGroup ?? "content.halo.run",
      version: root.dataset.commentVersion ?? "v1alpha1",
      kind: root.dataset.commentKind ?? "Post",
      name: root.dataset.commentName,
    } satisfies CommentSubjectRef,
  };
}

function freshEntry(key: string) {
  const entry = primes.get(key);
  if (!entry) {
    return undefined;
  }
  if (performance.now() - entry.createdAt <= PRIME_LIFETIME_MS) {
    return entry;
  }
  primes.delete(key);
  return undefined;
}

export function primeCommentPage(scope: ParentNode, signal?: AbortSignal) {
  const context = subjectFromDocument(scope);
  if (!context) {
    return undefined;
  }

  const key = commentSubjectKey(context.subject);
  const cached = freshEntry(key);
  if (cached) {
    return cached.promise;
  }

  const pluginAvailable = context.root.dataset.commentPlugin === "true";
  const promise = (async (): Promise<PrimedCommentPage> => {
    const config: CommentConfig = pluginAvailable
      ? await commentApi<CommentConfig>(
          "/apis/api.commentwidget.halo.run/v1alpha1/config",
          { signal },
        ).catch(() => ({}))
      : {};
    if (signal?.aborted) {
      throw signal.reason;
    }

    const params = new URLSearchParams({
      ...context.subject,
      page: "1",
      size: String(config.basic?.size || 20),
      withReplies: "false",
    });
    const result = await commentApi<ListResult<CommentItem>>(
      `/apis/api.halo.run/v1alpha1/comments?${params}`,
      { signal },
    );
    return { config, result };
  })().catch(() => {
    primes.delete(key);
    return undefined;
  });

  primes.set(key, { createdAt: performance.now(), promise });
  return promise;
}

export function getPrimedCommentPage(subject: CommentSubjectRef) {
  return freshEntry(commentSubjectKey(subject))?.promise;
}

export function clearPrimedCommentPage(subject: CommentSubjectRef) {
  primes.delete(commentSubjectKey(subject));
}
