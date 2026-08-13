import type { PageFeatureContext } from "../lifecycle/page-features";
import { initAudioPlayers } from "../controllers/audio";
import { hydrateMediaDurations } from "../services/media-metadata";

export function mount({ page, signal }: PageFeatureContext) {
  const disposeButtons = initAudioPlayers(page, signal);
  const disposeDurations = hydrateMediaDurations(page, signal);
  return () => {
    disposeDurations?.();
    disposeButtons?.();
  };
}
