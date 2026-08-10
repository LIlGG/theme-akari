import type { PageFeatureContext } from "../lifecycle/page-features";
import { initLightbox } from "../controllers/lightbox";

export function mount(_context: PageFeatureContext) {
  initLightbox();
}
