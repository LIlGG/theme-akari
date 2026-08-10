import { animate } from "motion";

export type CommentTone = "success" | "error" | "info";

type CommentApi = <T>(url: string, init?: RequestInit) => Promise<T>;

type AnnouncerOptions = {
  state: HTMLElement | null;
  toast: HTMLElement | null;
  duration?: number;
  bounce?: number;
};

export function canAnimateComments() {
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.motion !== "quiet"
  );
}

export function createCommentAnnouncer(options: AnnouncerOptions) {
  let timer = 0;

  const announce = (message: string, tone: CommentTone = "info") => {
    if (options.state) {
      options.state.textContent = message;
      options.state.dataset.tone = tone;
    }
    if (!options.toast) {
      return;
    }

    window.clearTimeout(timer);
    options.toast.textContent = message;
    options.toast.dataset.tone = tone;
    options.toast.hidden = false;
    if (canAnimateComments()) {
      animate(
        options.toast,
        {
          opacity: [0, 1],
          transform: ["translateY(12px) scale(.97)", "translateY(0) scale(1)"],
        },
        {
          duration: options.duration ?? 0.35,
          type: "spring",
          bounce: options.bounce ?? 0.16,
        },
      );
    }

    timer = window.setTimeout(() => {
      if (!options.toast) {
        return;
      }
      if (!canAnimateComments()) {
        options.toast.hidden = true;
        return;
      }
      void animate(
        options.toast,
        { opacity: [1, 0], transform: ["translateY(0)", "translateY(8px)"] },
        { duration: 0.18, ease: "easeIn" },
      ).finished.then(() => {
        if (options.toast) {
          options.toast.hidden = true;
        }
      });
    }, 3600);
  };

  return {
    announce,
    dispose() {
      window.clearTimeout(timer);
    },
  };
}

type CaptchaControllerOptions = {
  box: HTMLElement | null;
  image: HTMLImageElement | null;
  code: HTMLInputElement | null;
  api: CommentApi;
  shouldShow: () => boolean;
  imageAlt?: string;
};

export function createCommentCaptcha(options: CaptchaControllerOptions) {
  const refresh = async () => {
    if (!options.box || !options.image) {
      return;
    }
    if (!options.shouldShow()) {
      options.box.hidden = true;
      return;
    }

    options.box.hidden = false;
    try {
      options.image.src = await options.api<string>(
        "/apis/api.commentwidget.halo.run/v1alpha1/captcha/-/generate",
      );
      options.image.alt = options.imageAlt ?? "";
      if (options.code) {
        options.code.value = "";
      }
    } catch {
      options.box.hidden = true;
    }
  };

  return { refresh };
}
