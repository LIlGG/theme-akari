export function formatMediaDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--:--";
  }
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function hydrateMediaDurations(
  scope: ParentNode = document,
  signal?: AbortSignal,
) {
  const labels = [
    ...scope.querySelectorAll<HTMLElement>(
      "[data-media-duration][data-audio-src]",
    ),
  ].filter(
    (label) =>
      label.dataset.mediaDurationInitialized !== "true" &&
      Boolean(label.dataset.audioSrc?.trim()),
  );
  const mediaCleanups: Array<() => void> = [];

  const loadMetadata = (label: HTMLElement) => {
    const source = label.dataset.audioSrc?.trim();
    if (!source || label.dataset.mediaDurationInitialized === "true") {
      return;
    }

    label.dataset.mediaDurationInitialized = "true";
    const media = new Audio();
    media.preload = "metadata";
    const update = () => {
      label.textContent = formatMediaDuration(media.duration);
      label.dataset.mediaDurationResolved = "true";
    };
    const fail = () => {
      label.dataset.mediaDurationResolved = "false";
    };
    media.addEventListener("loadedmetadata", update, { once: true });
    media.addEventListener("error", fail, { once: true });
    media.src = source;
    media.load();

    mediaCleanups.push(() => {
      media.removeEventListener("loadedmetadata", update);
      media.removeEventListener("error", fail);
      media.removeAttribute("src");
      media.load();
    });
  };

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries
              .filter((entry) => entry.isIntersecting)
              .forEach((entry) => {
                observer?.unobserve(entry.target);
                loadMetadata(entry.target as HTMLElement);
              });
          },
          { rootMargin: "0px" },
        )
      : null;

  labels.forEach((label) => {
    if (observer) {
      observer.observe(label);
      return;
    }
    loadMetadata(label);
  });

  const cleanup = () => {
    observer?.disconnect();
    mediaCleanups.splice(0).forEach((dispose) => dispose());
  };
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}
