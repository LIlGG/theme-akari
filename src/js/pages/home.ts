import type { PageFeatureContext } from "../lifecycle/page-features";
import { initHomeDynamicData } from "../controllers/home";

export function mount({ signal }: PageFeatureContext) {
  initHomeDynamicData(signal);
}
