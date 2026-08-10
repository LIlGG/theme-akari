import type { PageFeatureContext } from "../lifecycle/page-features";
import {
  disposeFilterFeatures,
  initPhotoGroupNavigation,
} from "../controllers/filters";
import {
  disposeGalleryLayouts,
  initGalleryLayout,
  initPhotoLoadMore,
} from "../controllers/gallery";

export function mount({ page, signal }: PageFeatureContext) {
  initPhotoGroupNavigation();
  initGalleryLayout(page);
  initPhotoLoadMore(page, signal);
  return () => {
    disposeGalleryLayouts(page);
    disposeFilterFeatures();
  };
}
