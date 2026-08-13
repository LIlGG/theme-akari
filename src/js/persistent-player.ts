import type {
  AkariPlayerLabels,
  AkariPlayerState,
  AkariPlayerTrack,
} from "../types/player";

function isSafeMediaSource(value: string) {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:", "blob:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function normalizeTrack(track: AkariPlayerTrack): AkariPlayerTrack | null {
  const id = track.id.trim();
  const src = track.src.trim();
  if (!id || !src || !isSafeMediaSource(src)) {
    return null;
  }
  return {
    id,
    src: new URL(src, window.location.href).href,
    title: track.title.trim(),
    artist: track.artist?.trim() || undefined,
    artwork: track.artwork?.trim() || undefined,
  };
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function resolvePlayerElements() {
  const host = document.querySelector<HTMLElement>(
    "[data-persistent-player-host]",
  );
  const player = host?.querySelector<HTMLElement>("[data-global-player]");
  const audio = player?.querySelector<HTMLAudioElement>(
    "[data-persistent-audio]",
  );
  if (!host || !player || !audio || player.dataset.initialized === "true") {
    return null;
  }
  return {
    host,
    player,
    audio,
    toggleButton: player.querySelector<HTMLButtonElement>(
      "[data-player-toggle]",
    )!,
    closeButton: player.querySelector<HTMLButtonElement>(
      "[data-player-close]",
    )!,
    expandButton: player.querySelector<HTMLButtonElement>(
      "[data-player-expand]",
    )!,
    icon: player.querySelector<HTMLElement>("[data-player-icon]")!,
    expandIcon: player.querySelector<HTMLElement>("[data-player-expand-icon]")!,
    title: player.querySelector<HTMLElement>("[data-player-title]")!,
    time: player.querySelector<HTMLElement>("[data-player-time]")!,
    range: player.querySelector<HTMLInputElement>(".progress-track input")!,
    progressBar: player.querySelector<HTMLElement>(".progress-track span")!,
    expandedPanel: player.querySelector<HTMLElement>("[data-player-expanded]")!,
    listLabel: player.querySelector<HTMLElement>("[data-player-list-label]")!,
    listTitle: player.querySelector<HTMLElement>("[data-player-list-title]")!,
    listTime: player.querySelector<HTMLElement>("[data-player-list-time]")!,
  };
}

function playerLabels(host: HTMLElement): AkariPlayerLabels {
  return {
    current: host.dataset.currentLabel || "当前播放",
    next: host.dataset.nextLabel || "下一首",
    untitled: host.dataset.untitledLabel || "未命名音频",
    play: host.dataset.playLabel || "播放",
    pause: host.dataset.pauseLabel || "暂停",
    progress: host.dataset.progressLabel || "播放进度",
    expand: host.dataset.expandLabel || "展开播放列表",
    collapse: host.dataset.collapseLabel || "收起播放列表",
    close: host.dataset.closeLabel || "关闭播放器",
    error: host.dataset.errorLabel || "音频暂时无法播放",
  };
}

export function initPersistentPlayer() {
  const elements = resolvePlayerElements();
  if (!elements) {
    return;
  }
  const {
    host,
    player,
    audio,
    toggleButton,
    closeButton,
    expandButton,
    icon,
    expandIcon,
    title,
    time,
    range,
    progressBar,
    expandedPanel,
    listLabel,
    listTitle,
    listTime,
  } = elements;
  const labels = playerLabels(host);
  const queue = new Map<string, AkariPlayerTrack>();
  let currentTrack: AkariPlayerTrack | null = null;
  let playing = false;
  let currentTime = 0;
  let duration = 0;
  let expanded = false;

  const getNextTrack = () => {
    if (!currentTrack || queue.size < 2) {
      return null;
    }
    const tracks = [...queue.values()];
    const currentIndex = tracks.findIndex(
      (track) => track.id === currentTrack?.id,
    );
    return tracks[(currentIndex + 1 + tracks.length) % tracks.length] ?? null;
  };

  const emitState = () => {
    const detail: AkariPlayerState = {
      currentId: currentTrack?.id ?? null,
      playing,
      currentTime,
      duration,
    };
    window.dispatchEvent(new CustomEvent("akari:player:state", { detail }));
  };

  const render = () => {
    const open = currentTrack !== null;
    const progress =
      Number.isFinite(duration) && duration > 0
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0;
    const nextTrack = getNextTrack();
    const previewTrack = nextTrack ?? currentTrack;

    player.classList.toggle("is-open", open);
    player.classList.toggle("is-playing", playing);
    toggleButton.disabled = !open;
    closeButton.disabled = !open;
    expandButton.disabled = !open;
    toggleButton.ariaLabel = playing ? labels.pause : labels.play;
    icon.className = playing ? "i-lucide-pause" : "i-lucide-play";
    title.textContent = currentTrack?.title || labels.untitled;
    time.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    range.disabled = !open;
    range.value = String(progress);
    progressBar.style.width = `${progress}%`;
    expandButton.ariaExpanded = String(expanded);
    expandButton.ariaLabel = expanded ? labels.collapse : labels.expand;
    expandIcon.className = expanded
      ? "i-lucide-chevron-down"
      : "i-lucide-list-music";
    expandedPanel.hidden = !expanded;
    listLabel.textContent = nextTrack ? labels.next : labels.current;
    listTitle.textContent = previewTrack?.title || labels.untitled;
    listTime.textContent =
      previewTrack === currentTrack ? formatTime(duration) : "--:--";
  };

  const reportError = () => {
    window.dispatchEvent(
      new CustomEvent("akari:player:error", {
        detail: { message: labels.error },
      }),
    );
    emitState();
  };

  const registerTracks = (tracks: AkariPlayerTrack[]) => {
    tracks.forEach((candidate) => {
      const track = normalizeTrack(candidate);
      if (track) {
        queue.set(track.id, track);
      }
    });
    if (currentTrack) {
      currentTrack = queue.get(currentTrack.id) ?? currentTrack;
    }
    render();
  };

  const updateMediaSession = (track: AkariPlayerTrack) => {
    if (
      !("mediaSession" in navigator) ||
      typeof MediaMetadata === "undefined"
    ) {
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: track.artwork ? [{ src: track.artwork }] : undefined,
    });
  };

  const playTrack = async (requestedTrack: AkariPlayerTrack) => {
    const track = normalizeTrack(requestedTrack);
    if (!track) {
      return;
    }
    registerTracks([track]);
    try {
      if (currentTrack?.id === track.id) {
        if (audio.paused || audio.ended) {
          await audio.play();
        } else {
          audio.pause();
        }
        return;
      }
      currentTrack = track;
      currentTime = 0;
      duration = 0;
      audio.src = track.src;
      audio.load();
      updateMediaSession(track);
      render();
      emitState();
      await audio.play();
    } catch {
      reportError();
    }
  };

  const toggle = async () => {
    if (!currentTrack) {
      return;
    }
    try {
      if (audio.paused || audio.ended) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      reportError();
    }
  };

  const close = () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    currentTrack = null;
    playing = false;
    currentTime = 0;
    duration = 0;
    expanded = false;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
    }
    render();
    emitState();
  };

  window.addEventListener("akari:player:register", (event) =>
    registerTracks(event.detail.tracks),
  );
  window.addEventListener(
    "akari:player:request",
    (event) => void playTrack(event.detail.track),
  );
  audio.addEventListener("play", () => {
    playing = true;
    render();
    emitState();
  });
  audio.addEventListener("pause", () => {
    playing = false;
    render();
    emitState();
  });
  audio.addEventListener("timeupdate", () => {
    currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    render();
    emitState();
  });
  const updateDuration = () => {
    duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    render();
    emitState();
  };
  audio.addEventListener("durationchange", updateDuration);
  audio.addEventListener("loadedmetadata", updateDuration);
  audio.addEventListener("ended", () => {
    playing = false;
    render();
    emitState();
  });
  audio.addEventListener("error", () => {
    playing = false;
    render();
    reportError();
  });
  toggleButton.addEventListener("click", () => void toggle());
  closeButton.addEventListener("click", close);
  expandButton.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });
  range.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration)) {
      return;
    }
    audio.currentTime = Math.min(
      audio.duration,
      Math.max(0, Number(range.value) / 100) * audio.duration,
    );
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => void toggle());
    navigator.mediaSession.setActionHandler("pause", () => void toggle());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime === undefined || !Number.isFinite(audio.duration)) {
        return;
      }
      audio.currentTime = Math.min(
        audio.duration,
        Math.max(0, details.seekTime),
      );
    });
  }

  player.dataset.initialized = "true";
  document.documentElement.dataset.akariPlayerReady = "true";
  render();
  window.dispatchEvent(new CustomEvent("akari:player:ready"));
  emitState();
}
