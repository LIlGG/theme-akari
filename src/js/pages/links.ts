import type { PageFeatureContext } from "../lifecycle/page-features";
import { initLinkApplication } from "../link-application";

export function mount({ page, signal }: PageFeatureContext) {
  const root = page.querySelector<HTMLElement>("[data-link-application]");
  if (!root) {
    return;
  }
  return initLinkApplication(root, signal);
}
