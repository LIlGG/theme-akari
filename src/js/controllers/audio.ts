import { initPersistentAudioButtons } from "../persistent-audio-bridge";
import { showToast } from "../runtime/context";

export function initAudioPlayers(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  if (!document.querySelector("[data-persistent-player-host]")) {
    return;
  }
  return initPersistentAudioButtons(scope, showToast, signal);
}
