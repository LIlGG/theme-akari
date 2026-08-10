(() => {
  const root = document.documentElement;
  const storedTheme = localStorage.getItem("akari-theme");
  const configuredTheme = root.dataset.defaultTheme || "system";
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;

  root.dataset.theme =
    storedTheme ||
    (configuredTheme === "system"
      ? prefersDark
        ? "dark"
        : "light"
      : configuredTheme);

  const currentUrl = new URL(window.location.href);
  const usesTagFilter =
    currentUrl.searchParams.get("filter") === "tags" ||
    root.dataset.templateId === "tag";
  root.dataset.postFilterMode = usesTagFilter ? "tag" : "category";

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  root.classList.add("motion-ready");
  const reducesMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (root.dataset.motion !== "quiet" && !reducesMotion) {
    root.classList.add("motion-stage");
    window.setTimeout(() => root.classList.remove("motion-stage"), 2500);
  }
})();
