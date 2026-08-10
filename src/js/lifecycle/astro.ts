export type AstroLifecycleHooks = {
  afterSwap?: () => void;
  beforePreparation?: () => void;
  beforeSwap?: () => void;
  prepareDocument?: (
    document: Document,
    signal: AbortSignal,
  ) => void | Promise<void>;
};

type AstroBeforePreparationEvent = Event & {
  loader: () => Promise<void>;
  newDocument: Document;
  signal: AbortSignal;
};

export function isAstroClientRouterEnabled() {
  return Boolean(
    document.querySelector('meta[name="astro-view-transitions-enabled"]'),
  );
}

export function installAstroLifecycle(hooks: AstroLifecycleHooks) {
  if (!isAstroClientRouterEnabled()) {
    return;
  }

  document.addEventListener("astro:before-preparation", (event) => {
    hooks.beforePreparation?.();
    if (!hooks.prepareDocument) {
      return;
    }

    const transition = event as AstroBeforePreparationEvent;
    const loadDocument = transition.loader;
    transition.loader = async () => {
      await loadDocument();
      if (transition.signal.aborted) {
        return;
      }
      await hooks.prepareDocument?.(transition.newDocument, transition.signal);
    };
  });
  document.addEventListener("astro:before-swap", () => {
    hooks.beforeSwap?.();
  });
  document.addEventListener("astro:after-swap", () => {
    hooks.afterSwap?.();
  });
}
