const stagedMotionSelectors = [
  "[data-reveal]",
  ".article-afterword > *",
  ".archive-month",
  ".tag-drawer",
  ".friend-note",
  ".message-wall > *",
  ".about-facts",
].join(", ");

const criticalMotionSelectors = "[data-hero-copy], [data-hero-scene]";

function motionIsEnabled(scope: ParentNode) {
  const documentElement =
    scope instanceof Document
      ? scope.documentElement
      : document.documentElement;
  return (
    documentElement.dataset.motion !== "quiet" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Give entrance-motion elements their first-frame state before the document is
 * painted. Motion later owns the transition to the final state; this function
 * only prevents visible content from being hidden again after page-load.
 */
export function preparePageMotion(scope: ParentNode = document) {
  if (!motionIsEnabled(scope)) {
    return;
  }
  // The hero is already covered by the page-level CSS entrance. Mark it as
  // owned by that transition so the asynchronously loaded Motion controller
  // cannot hide and replay it after the first frame.
  scope
    .querySelectorAll<HTMLElement>(criticalMotionSelectors)
    .forEach((item) => {
      item.dataset.pageTransitionAnimated = "";
    });
  scope.querySelectorAll<HTMLElement>(stagedMotionSelectors).forEach((item) => {
    if (item.dataset.pageTransitionAnimated !== undefined) {
      return;
    }
    item.dataset.motionReveal = "";
    item.style.opacity = "0";
  });
}
