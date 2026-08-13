import type { PageFeatureContext } from "../lifecycle/page-features";
import { initMediaTabs } from "../controllers/media";

export function mount(_context: PageFeatureContext) {
  initMediaTabs();
}
