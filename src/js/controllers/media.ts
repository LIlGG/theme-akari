import { run } from "../runtime/context";

export function initMediaTabs() {
  const tabs = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-media-tab]"),
  ];
  const panels = [
    ...document.querySelectorAll<HTMLElement>("[data-media-panel]"),
  ];
  if (!tabs.length || !panels.length) {
    return;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.mediaTab;
      const target = panels.find((panel) => panel.dataset.mediaPanel === name);
      if (!target || !target.hidden) {
        return;
      }

      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      panels.forEach((panel) => {
        panel.hidden = panel !== target;
      });
      run(
        target,
        { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
        { duration: 0.34, ease: "easeOut" },
      );
    });
  });
}
