import { stagger } from "motion";
import { canAnimate, run, showToast } from "../runtime/context";
import { isAbortError, requestHaloDocument } from "../services/halo-http";
import { asVoidEventHandler } from "../utils/async";
import { findInScope } from "../utils/dom";

type ContinuationAnimation = {
  from: string;
  delay: number;
  duration: number;
};

type HtmlContinuationOptions = {
  scope?: ParentNode;
  signal?: AbortSignal;
  rootSelector: string;
  initializedAttribute: string;
  listSelector: string;
  itemSelector: string;
  continuationSelector: string;
  buttonSelector: string;
  countSelector: string;
  endSelector: string;
  labelSelector: string;
  iconSelector: string;
  requestHeader: string;
  missingContentMessage: string;
  fallbackErrorMessage: string;
  animation: ContinuationAnimation;
  itemKey?: (item: HTMLElement) => string | undefined;
  prepareItem?: (item: HTMLElement) => void;
  afterAppend?: (
    root: HTMLElement,
    list: HTMLElement,
    items: HTMLElement[],
  ) => void;
};

type ContinuationElements = {
  root: HTMLElement;
  list: HTMLElement;
  button: HTMLAnchorElement;
  count: HTMLElement;
  end: HTMLElement | null;
  label: HTMLElement | null;
  icon: HTMLElement | null;
};

function resolveElements(options: HtmlContinuationOptions) {
  const root = findInScope<HTMLElement>(
    options.scope ?? document,
    options.rootSelector,
  );
  if (!root || root.hasAttribute(options.initializedAttribute)) {
    return null;
  }
  const continuation = root.querySelector<HTMLElement>(
    options.continuationSelector,
  );
  const list = root.querySelector<HTMLElement>(options.listSelector);
  const button = continuation?.querySelector<HTMLAnchorElement>(
    options.buttonSelector,
  );
  const count = continuation?.querySelector<HTMLElement>(options.countSelector);
  if (!continuation || !list || !button || !count) {
    return null;
  }
  root.setAttribute(options.initializedAttribute, "true");
  return {
    root,
    list,
    button,
    count,
    end: continuation.querySelector<HTMLElement>(options.endSelector),
    label: button.querySelector<HTMLElement>(options.labelSelector),
    icon: button.querySelector<HTMLElement>(options.iconSelector),
  } satisfies ContinuationElements;
}

function setLoading(
  elements: ContinuationElements,
  loading: boolean,
  originalLabel: string,
) {
  elements.button.classList.toggle("is-loading", loading);
  elements.button.toggleAttribute("aria-busy", loading);
  elements.button.toggleAttribute("aria-disabled", loading);
  elements.icon?.classList.toggle("is-spinning", loading);
  if (elements.label) {
    elements.label.textContent = loading
      ? (elements.button.dataset.loadingLabel ?? originalLabel)
      : originalLabel;
  }
}

function finish(elements: ContinuationElements) {
  elements.button.hidden = true;
  if (!elements.end) {
    return;
  }
  elements.end.hidden = false;
  elements.end.tabIndex = -1;
  elements.end.focus({ preventScroll: true });
  run(
    elements.end,
    { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
    { duration: 0.34, type: "spring", bounce: 0.08 },
  );
}

function collectItems(
  source: HTMLElement,
  options: HtmlContinuationOptions,
  knownKeys: Set<string>,
) {
  return [...source.querySelectorAll<HTMLElement>(options.itemSelector)]
    .filter((item) => {
      const key = options.itemKey?.(item);
      if (!key) {
        return options.itemKey ? false : true;
      }
      if (knownKeys.has(key)) {
        return false;
      }
      knownKeys.add(key);
      return true;
    })
    .map((item) => document.importNode(item, true));
}

function revealItems(items: HTMLElement[], animation: ContinuationAnimation) {
  if (!canAnimate()) {
    return;
  }
  run(
    items,
    {
      opacity: [0, 1],
      transform: [animation.from, "translateY(0) scale(1)"],
    },
    {
      duration: animation.duration,
      delay: stagger(animation.delay),
      type: "spring",
      bounce: 0.08,
    },
  );
}

export function initHtmlContinuation(options: HtmlContinuationOptions) {
  const elements = resolveElements(options);
  if (!elements) {
    return;
  }
  const originalLabel = elements.label?.textContent ?? "";
  const knownKeys = new Set(
    [...elements.list.querySelectorAll<HTMLElement>(options.itemSelector)]
      .map((item) => options.itemKey?.(item))
      .filter((key): key is string => Boolean(key)),
  );
  let loading = false;

  const loadNext = async (event: MouseEvent) => {
    event.preventDefault();
    if (loading) {
      return;
    }
    loading = true;
    setLoading(elements, true, originalLabel);
    try {
      const parsed = await requestHaloDocument(elements.button.href, {
        signal: options.signal,
        headers: { "X-Requested-With": options.requestHeader },
      });
      const nextRoot = parsed.querySelector<HTMLElement>(options.rootSelector);
      const nextList = nextRoot?.querySelector<HTMLElement>(
        options.listSelector,
      );
      if (!nextRoot || !nextList) {
        throw new Error(options.missingContentMessage);
      }
      const incomingItems = collectItems(nextList, options, knownKeys);
      if (incomingItems.length === 0) {
        finish(elements);
        return;
      }
      for (const item of incomingItems) {
        item.removeAttribute("data-reveal");
        options.prepareItem?.(item);
        if (canAnimate()) {
          item.style.opacity = "0";
          item.style.transform = options.animation.from;
        }
      }
      elements.list.append(...incomingItems);
      elements.count.textContent = String(
        elements.list.querySelectorAll(options.itemSelector).length,
      );
      options.afterAppend?.(elements.root, elements.list, incomingItems);
      const nextButton = nextRoot.querySelector<HTMLAnchorElement>(
        options.buttonSelector,
      );
      if (nextButton) {
        elements.button.href = nextButton.href;
      } else {
        finish(elements);
      }
      revealItems(incomingItems, options.animation);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error(error);
      showToast(
        elements.button.dataset.errorLabel ?? options.fallbackErrorMessage,
      );
    } finally {
      loading = false;
      setLoading(elements, false, originalLabel);
    }
  };

  elements.button.addEventListener("click", asVoidEventHandler(loadNext), {
    signal: options.signal,
  });
}
