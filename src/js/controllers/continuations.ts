import { initHtmlContinuation } from "./html-continuation";
import { initAudioPlayers } from "./audio";
import { initImageFallbacks } from "./utilities";

export function initMomentLoadMore(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  initHtmlContinuation({
    scope,
    signal,
    rootSelector: "[data-moment-results]",
    initializedAttribute: "data-moment-load-initialized",
    listSelector: "[data-moment-list]",
    itemSelector: "[data-moment-item]",
    continuationSelector: "[data-moment-continuation]",
    buttonSelector: "[data-load-more-moments]",
    countSelector: "[data-visible-moment-count]",
    endSelector: "[data-moment-load-end]",
    labelSelector: "[data-moment-load-label]",
    iconSelector: "[data-moment-load-icon]",
    requestHeader: "Akari-Append-Navigation",
    missingContentMessage: "Moment continuation did not contain a timeline",
    fallbackErrorMessage: "Unable to load more moments.",
    itemKey: (item) => item.dataset.momentName,
    animation: {
      from: "translateY(16px) scale(.992)",
      delay: 0.045,
      duration: 0.44,
    },
    afterAppend: (_root, list) => {
      initAudioPlayers(list, signal);
      initImageFallbacks(list);
    },
  });
}
