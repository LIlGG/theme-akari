import type { PageFeatureContext } from "../lifecycle/page-features";
import {
  initMotionDetails,
  initReveal,
  prepareArticleTables,
  prepareProseMedia,
  removeEmptyAboutProse,
} from "../controllers/content";
import { initImageFallbacks } from "../controllers/utilities";

export function mount({ page, signal }: PageFeatureContext) {
  const disposeReveal = initReveal(page);
  const disposeDetails = initMotionDetails(page, signal);
  prepareProseMedia(page, signal);
  prepareArticleTables(page);
  removeEmptyAboutProse(page);
  initImageFallbacks(page);
  return () => {
    disposeDetails?.();
    disposeReveal?.();
  };
}
