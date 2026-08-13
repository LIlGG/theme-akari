import type { AkariPlayerState, AkariPlayerTrack } from "../types/player";

type AudioButtonBinding = {
  button: HTMLButtonElement;
  track: AkariPlayerTrack;
};

const bindings = new Map<HTMLButtonElement, AudioButtonBinding>();
let currentState: AkariPlayerState = {
  currentId: null,
  playing: false,
  currentTime: 0,
  duration: 0,
};
let globalListenersBound = false;
let pendingTrack: AkariPlayerTrack | null = null;
let playerReady = document.documentElement.dataset.akariPlayerReady === "true";

function audioElementFor(button: HTMLButtonElement) {
  const controlledId = button.getAttribute("aria-controls");
  const element = controlledId ? document.getElementById(controlledId) : null;
  return {
    controlledId,
    audio: element instanceof HTMLAudioElement ? element : null,
  };
}

function trackTitle(
  button: HTMLButtonElement,
  audio: HTMLAudioElement | null,
  article: HTMLElement | null,
) {
  return (
    button.dataset.audioTitle ||
    audio?.dataset.title ||
    article
      ?.querySelector<HTMLElement>("h1, h2, h3, strong")
      ?.textContent?.trim() ||
    document.title
  );
}

function trackArtwork(button: HTMLButtonElement, article: HTMLElement | null) {
  const image = article?.querySelector<HTMLImageElement>("img");
  return button.dataset.audioArtwork || image?.currentSrc || image?.src;
}

function trackFromButton(button: HTMLButtonElement): AkariPlayerTrack | null {
  const { controlledId, audio } = audioElementFor(button);
  const source = (
    button.dataset.audioSrc ||
    audio?.currentSrc ||
    audio?.src ||
    ""
  ).trim();
  if (!source) {
    return null;
  }

  const article = button.closest<HTMLElement>("article, [data-page]");
  return {
    id: button.dataset.audioId || controlledId || source,
    src: source,
    title: trackTitle(button, audio, article),
    artist: button.dataset.audioArtist,
    artwork: trackArtwork(button, article),
  };
}

function syncButton(binding: AudioButtonBinding) {
  const active = binding.track.id === currentState.currentId;
  const playing = active && currentState.playing;
  const icon = binding.button.querySelector<HTMLElement>("[data-audio-icon]");
  const label = binding.button.querySelector<HTMLElement>("[data-audio-label]");

  if (icon) {
    icon.className = playing ? "i-lucide-pause" : "i-lucide-play";
  }
  if (label) {
    label.textContent = playing
      ? (binding.button.dataset.pauseText ?? "Pause")
      : (binding.button.dataset.playText ?? "Play");
  }
  binding.button.classList.toggle("is-playing", playing);
  binding.button.setAttribute(
    "aria-label",
    playing
      ? (binding.button.dataset.pauseLabel ?? "Pause audio")
      : (binding.button.dataset.playLabel ?? "Play audio"),
  );
}

function syncAllButtons() {
  bindings.forEach((binding, button) => {
    if (!button.isConnected) {
      bindings.delete(button);
      return;
    }
    syncButton(binding);
  });
}

function bindGlobalListeners(onError: (message: string) => void) {
  if (globalListenersBound) {
    return;
  }
  globalListenersBound = true;

  window.addEventListener("akari:player:state", (event) => {
    currentState = event.detail;
    syncAllButtons();
  });
  window.addEventListener("akari:player:error", (event) =>
    onError(event.detail.message),
  );
  window.addEventListener("akari:player:ready", () => {
    playerReady = true;
    const tracks = [...bindings.values()]
      .filter((binding) => binding.button.isConnected)
      .map((binding) => binding.track);
    if (!tracks.length) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("akari:player:register", { detail: { tracks } }),
    );
    if (pendingTrack) {
      window.dispatchEvent(
        new CustomEvent("akari:player:request", {
          detail: { track: pendingTrack },
        }),
      );
      pendingTrack = null;
    }
  });
}

export function initPersistentAudioButtons(
  scope: ParentNode,
  onError: (message: string) => void,
  signal?: AbortSignal,
) {
  bindGlobalListeners(onError);

  const tracks: AkariPlayerTrack[] = [];
  const pageButtons: HTMLButtonElement[] = [];
  scope
    .querySelectorAll<HTMLButtonElement>("[data-audio-toggle]")
    .forEach((button) => {
      if (bindings.has(button)) {
        return;
      }
      const track = trackFromButton(button);
      if (!track) {
        return;
      }

      const binding = { button, track };
      bindings.set(button, binding);
      pageButtons.push(button);
      tracks.push(track);
      button.dataset.audioInitialized = "true";
      button.addEventListener(
        "click",
        () => {
          if (!playerReady) {
            pendingTrack = track;
          }
          window.dispatchEvent(
            new CustomEvent("akari:player:request", { detail: { track } }),
          );
        },
        { signal },
      );
      syncButton(binding);
    });

  if (tracks.length) {
    playerReady =
      playerReady ||
      document.documentElement.dataset.akariPlayerReady === "true";
    window.dispatchEvent(
      new CustomEvent("akari:player:register", { detail: { tracks } }),
    );
  }

  const cleanup = () => {
    pageButtons.forEach((button) => bindings.delete(button));
  };
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}
