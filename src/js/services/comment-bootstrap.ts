import type { CommentConfig, CurrentUser } from "../comment-client";

export type CommentApiClient = <T>(
  url: string,
  init?: RequestInit,
) => Promise<T>;

export type CommentIdentity = {
  allowAnonymous: boolean;
  currentUser?: CurrentUser;
};

export function createCommentBootstrap(
  api: CommentApiClient,
  pluginAvailable: boolean,
  primedConfig?: Promise<CommentConfig | undefined>,
) {
  const requestConfig = () =>
    pluginAvailable
      ? api<CommentConfig>(
          "/apis/api.commentwidget.halo.run/v1alpha1/config",
        ).catch(() => ({}))
      : Promise.resolve<CommentConfig>({});
  const config = primedConfig
    ? primedConfig.then((value) => value ?? requestConfig())
    : requestConfig();

  const identity = Promise.all([
    api<{ allowAnonymousComments: boolean }>("/actuator/globalinfo")
      .then((value) => value.allowAnonymousComments)
      .catch(() => false),
    api<{ user: CurrentUser }>("/apis/api.console.halo.run/v1alpha1/users/-")
      .then((value) =>
        value.user.metadata.name === "anonymousUser" ? undefined : value.user,
      )
      .catch(() => undefined),
  ]).then(([allowAnonymous, currentUser]) => ({
    allowAnonymous,
    currentUser,
  }));

  return { config, identity };
}
