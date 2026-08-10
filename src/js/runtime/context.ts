import { animate } from "motion";

const root = document.documentElement;
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);
const motionLevel = root.dataset.motion ?? "balanced";
const canAnimate = () =>
  !prefersReducedMotion.matches && motionLevel !== "quiet";
const canUseRichMotion = () => canAnimate() && motionLevel === "rich";
root.classList.add("motion-ready");

export function run(
  target: Element | Element[] | NodeListOf<Element>,
  keyframes: Record<string, string | number | Array<string | number>>,
  options: Record<string, unknown> = {},
) {
  if (!canAnimate()) {
    return null;
  }
  return animate(target, keyframes, options);
}

const chineseDigits = [
  "零",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
];

export function isChineseLocale() {
  return (document.documentElement.lang || "zh-CN")
    .toLocaleLowerCase()
    .startsWith("zh");
}

export function toChineseInteger(value: number) {
  const integer = Math.max(0, Math.floor(value));
  if (!Number.isFinite(integer) || integer > 9999) {
    return String(value);
  }
  if (integer < 10) {
    return chineseDigits[integer];
  }

  const units = ["", "十", "百", "千"];
  const digits = String(integer).split("").map(Number);
  let output = "";
  let pendingZero = false;
  digits.forEach((digit, index) => {
    const unitIndex = digits.length - index - 1;
    if (digit === 0) {
      if (output && digits.slice(index + 1).some((next) => next !== 0)) {
        pendingZero = true;
      }
      return;
    }
    if (pendingZero) {
      output += "零";
      pendingZero = false;
    }
    if (!(digit === 1 && unitIndex === 1 && output === "")) {
      output += chineseDigits[digit];
    }
    output += units[unitIndex];
  });
  return output || chineseDigits[0];
}

export function localizeQuantity(value: number) {
  return isChineseLocale() ? toChineseInteger(value) : String(value);
}

export function replaceTemplateTokens(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`__${key}__|${key}`, "g"), String(value)),
    template,
  );
}

export function softlyUpdateText(element: HTMLElement | null, text: string) {
  if (!element || element.textContent === text) {
    return;
  }
  element.textContent = text;
  run(
    element,
    { opacity: [0.45, 1], transform: ["translateY(3px)", "translateY(0)"] },
    { duration: 0.28, ease: "easeOut" },
  );
}

let toastTimer = 0;

export function showToast(message: string) {
  const toast = document.querySelector<HTMLElement>("[data-toast]");
  if (!toast) {
    return;
  }

  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  run(
    toast,
    {
      opacity: [0, 1],
      transform: ["translateY(10px) scale(.98)", "translateY(0) scale(1)"],
    },
    { duration: 0.28, type: "spring", bounce: 0.1 },
  );
  const hideToast = async () => {
    if (canAnimate()) {
      await animate(
        toast,
        { opacity: [1, 0], transform: ["translateY(0)", "translateY(8px)"] },
        { duration: 0.16, ease: "easeIn" },
      ).finished;
    }
    toast.hidden = true;
    toast.style.removeProperty("opacity");
    toast.style.removeProperty("transform");
  };
  toastTimer = window.setTimeout(() => void hideToast(), 3200);
}

export { root, prefersReducedMotion, canAnimate, canUseRichMotion };
