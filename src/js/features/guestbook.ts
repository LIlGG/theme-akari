import type { PageFeatureContext } from "../lifecycle/page-features";
import { initGuestbook } from "../guestbook";

export function mount({ page, signal }: PageFeatureContext) {
  const root = page.matches("[data-akari-guestbook]")
    ? page
    : page.querySelector<HTMLElement>("[data-akari-guestbook]");
  return initGuestbook(root ?? undefined, signal);
}
