import type { PageFeatureContext } from "../lifecycle/page-features";
import {
  disposeFilterFeatures,
  initPostFilterNavigation,
} from "../controllers/filters";
import { initPostsIntro } from "../controllers/home";
import { initPostList } from "../controllers/posts";

export function mount({ signal }: PageFeatureContext) {
  initPostFilterNavigation();
  initPostsIntro(signal);
  initPostList(signal);
  return disposeFilterFeatures;
}
