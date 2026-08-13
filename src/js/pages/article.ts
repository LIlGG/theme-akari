import type { PageFeatureContext } from "../lifecycle/page-features";
import {
  disposeToc,
  initArticleReading,
  initToc,
} from "../controllers/article";

export function mount({ signal }: PageFeatureContext) {
  initArticleReading();
  initToc(signal);
  return disposeToc;
}
