import type { PageFeatureContext } from "../lifecycle/page-features";
import { initArticleComments } from "../article-comments";

export function mount({ page, signal }: PageFeatureContext) {
  const root = page.matches("[data-akari-article-comments]")
    ? page
    : page.querySelector<HTMLElement>("[data-akari-article-comments]");
  return initArticleComments(root ?? undefined, signal);
}
