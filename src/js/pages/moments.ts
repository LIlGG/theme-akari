import type { PageFeatureContext } from "../lifecycle/page-features";
import { initMomentLoadMore } from "../controllers/continuations";

export function mount({ signal }: PageFeatureContext) {
  initMomentLoadMore(document, signal);
}
