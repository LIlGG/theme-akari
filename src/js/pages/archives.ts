import type { PageFeatureContext } from "../lifecycle/page-features";
import { initArchiveLoadMore } from "../controllers/archives";

export function mount({ signal }: PageFeatureContext) {
  initArchiveLoadMore(document, signal);
}
