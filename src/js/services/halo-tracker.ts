const TRACKER_DISABLED_KEY = "haloTracker.disabled";
const TRACKER_SCRIPT_SELECTOR = 'script[src*="halo-tracker.js"]';
const COUNTER_PATH = "/apis/api.halo.run/v1alpha1/trackers/counter";

type TrackerPage = {
  endpoint: string;
  group: string;
  name: string;
  plural: string;
  referrer: string;
};

export type HaloTrackerNavigation = {
  cancel: () => void;
  complete: () => void;
};

let suspensionDepth = 0;
let storedPreference: string | null = null;

function suspendTracking() {
  if (suspensionDepth === 0) {
    storedPreference = localStorage.getItem(TRACKER_DISABLED_KEY);
    localStorage.setItem(TRACKER_DISABLED_KEY, "true");
  }
  suspensionDepth += 1;
}

function resumeTracking() {
  if (suspensionDepth === 0) {
    return;
  }
  suspensionDepth -= 1;
  if (suspensionDepth > 0) {
    return;
  }

  if (storedPreference === null) {
    localStorage.removeItem(TRACKER_DISABLED_KEY);
  } else {
    localStorage.setItem(TRACKER_DISABLED_KEY, storedPreference);
  }
  storedPreference = null;
}

function suspendHaloTracker() {
  suspendTracking();
  let resumed = false;
  return () => {
    if (resumed) {
      return;
    }
    resumed = true;
    resumeTracking();
  };
}

function browserRequestsNoTracking(script: HTMLScriptElement) {
  if (!script.dataset.doNotTrack) {
    return false;
  }
  const preference =
    navigator.doNotTrack ||
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack;
  return preference === "1" || preference === "yes";
}

function domainAllowsTracking(script: HTMLScriptElement) {
  const domains = script.dataset.domains
    ?.split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
  return !domains?.length || domains.includes(window.location.hostname);
}

function trackerPageFrom(document: Document): TrackerPage | null {
  const script =
    document.querySelector<HTMLScriptElement>(TRACKER_SCRIPT_SELECTOR);
  if (!script) {
    return null;
  }

  // ClientRouter may keep or deduplicate an external script that has already
  // run. Remove it from the incoming document and report with its page-specific
  // metadata after the body swap instead.
  script.remove();
  if (
    script.dataset.autoTrack === "false" ||
    browserRequestsNoTracking(script) ||
    !domainAllowsTracking(script)
  ) {
    return null;
  }

  const { group = "", name = "", plural = "" } = script.dataset;
  if (!group || !name || !plural) {
    return null;
  }

  const host = script.dataset.hostUrl?.replace(/\/$/, "") || "";
  return {
    endpoint: `${host}${COUNTER_PATH}`,
    group,
    name,
    plural,
    referrer: `${window.location.pathname}${window.location.search}`,
  };
}

function trackPage(page: TrackerPage) {
  if (localStorage.getItem(TRACKER_DISABLED_KEY)) {
    return;
  }
  const request = fetch(page.endpoint, {
    method: "POST",
    body: JSON.stringify({
      group: page.group,
      plural: page.plural,
      name: page.name,
      hostname: window.location.hostname,
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      url: `${window.location.pathname}${window.location.search}`,
      referrer: page.referrer,
    }),
    headers: { "Content-Type": "application/json" },
  });
  void request
    .then((response) => response.text())
    .then((body) => console.debug("Visit count:", body))
    .catch(() => undefined);
}

export function prepareHaloTrackerNavigation(
  newDocument: Document,
  signal: AbortSignal,
): HaloTrackerNavigation {
  const trackerPage = trackerPageFrom(newDocument);
  const resume = suspendHaloTracker();
  let settled = false;

  const settle = (track: boolean) => {
    if (settled) {
      return;
    }
    settled = true;
    resume();
    if (track && trackerPage && !signal.aborted) {
      trackPage(trackerPage);
    }
  };
  const navigation = {
    cancel: () => settle(false),
    complete: () => settle(true),
  };
  signal.addEventListener("abort", navigation.cancel, { once: true });
  return navigation;
}

export function withHaloTrackerSuspended<T>(operation: () => T) {
  const resume = suspendHaloTracker();
  try {
    return operation();
  } finally {
    resume();
  }
}
