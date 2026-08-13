import { canAnimate, run, showToast } from "./runtime/context";
import {
  isAbortError,
  requestHalo,
  type HaloRequestError,
} from "./services/halo-http";

type CaptchaResponse = {
  challengeId: string;
  image: string;
  expiresInSeconds: number;
};

type LinkApplicationRequest = {
  url: string;
  displayName: string;
  challengeId: string;
  captchaCode: string;
  logo?: string;
  description?: string;
  email?: string;
  backlink?: string;
  feedUrls?: string[];
};

type ResultTone = "error" | "success";

const problemLabels: Record<string, keyof DOMStringMap> = {
  "https://halo.run/probs/invalid-link-application": "labelInvalid",
  "https://halo.run/probs/invalid-link-application-captcha":
    "labelInvalidCaptcha",
  "https://halo.run/probs/link-application-disabled": "labelDisabled",
  "https://halo.run/probs/duplicate-link-application": "labelDuplicate",
  "https://halo.run/probs/link-application-capacity-reached": "labelCapacity",
  "https://halo.run/probs/request-not-permitted": "labelRateLimited",
  "https://halo.run/probs/link-application-unavailable": "labelUnavailable",
};

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
) {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing link application element: ${selector}`);
  }
  return element;
}

function fieldValue(form: HTMLFormElement, name: string) {
  const field = form.elements.namedItem(name);
  if (
    !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
  ) {
    return "";
  }
  return field.value.trim();
}

function addOptionalValue<T extends keyof LinkApplicationRequest>(
  payload: LinkApplicationRequest,
  key: T,
  value: LinkApplicationRequest[T] | undefined,
) {
  if (value && (!Array.isArray(value) || value.length > 0)) {
    payload[key] = value;
  }
}

function createPayload(form: HTMLFormElement, challengeId: string) {
  const payload: LinkApplicationRequest = {
    url: fieldValue(form, "url"),
    displayName: fieldValue(form, "displayName"),
    challengeId,
    captchaCode: fieldValue(form, "captchaCode"),
  };
  addOptionalValue(payload, "logo", fieldValue(form, "logo"));
  addOptionalValue(payload, "description", fieldValue(form, "description"));
  addOptionalValue(payload, "email", fieldValue(form, "email"));
  addOptionalValue(payload, "backlink", fieldValue(form, "backlink"));
  addOptionalValue(
    payload,
    "feedUrls",
    fieldValue(form, "feedUrls")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return payload;
}

function problemMessage(root: HTMLElement, error: HaloRequestError) {
  if (error.status === 404) {
    return root.dataset.labelDisabled ?? "";
  }
  const type = error.data?.type;
  if (typeof type !== "string") {
    return root.dataset.labelUnavailable ?? "";
  }
  const label = problemLabels[type];
  if (!label) {
    return root.dataset.labelUnavailable ?? "";
  }
  const message = root.dataset[label] ?? root.dataset.labelUnavailable ?? "";
  const retryAfter = error.data?.retryAfterSeconds;
  if (error.status !== 429 || typeof retryAfter !== "number") {
    return message;
  }
  const retryMessage = root.dataset.labelRetryAfter?.replace(
    "{0}",
    String(Math.max(1, Math.ceil(retryAfter))),
  );
  return retryMessage ? `${message} ${retryMessage}` : message;
}

function markInvalidField(form: HTMLFormElement, error: HaloRequestError) {
  const errors = error.data?.errors;
  if (!Array.isArray(errors)) {
    return;
  }
  const message = errors.filter((item) => typeof item === "string").join(" ");
  const fieldsByKeyword = [
    ["displayName", ["displayName", "网站名称"]],
    ["logo", ["logo", "Logo"]],
    ["backlink", ["backlink", "反链"]],
    ["feedUrls", ["feedUrls", "订阅地址"]],
    ["url", ["url", "URL"]],
  ] as const;
  const fieldName = fieldsByKeyword.find(([, keywords]) =>
    keywords.some((keyword) => message.includes(keyword)),
  )?.[0];
  if (!fieldName) {
    return;
  }
  const field = form.elements.namedItem(fieldName);
  if (!(field instanceof HTMLElement)) {
    return;
  }
  field.setAttribute("aria-invalid", "true");
  field.focus({ preventScroll: true });
  field.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function initLinkApplication(root: HTMLElement, signal: AbortSignal) {
  const form = requiredElement<HTMLFormElement>(
    root,
    "[data-link-application-form]",
  );
  const result = requiredElement<HTMLElement>(
    root,
    "[data-link-application-result]",
  );
  const captchaButton = requiredElement<HTMLButtonElement>(
    root,
    "[data-link-captcha-refresh]",
  );
  const captchaImage = requiredElement<HTMLImageElement>(
    root,
    "[data-link-captcha-image]",
  );
  const captchaPlaceholder = requiredElement<HTMLElement>(
    root,
    "[data-link-captcha-placeholder-text]",
  );
  const captchaCodeField = requiredElement<HTMLInputElement>(
    form,
    'input[name="captchaCode"]',
  );
  const submitButton = requiredElement<HTMLButtonElement>(
    root,
    "[data-link-application-submit]",
  );
  const submitLabel = requiredElement<HTMLElement>(
    root,
    "[data-link-application-submit-label]",
  );
  const guide = requiredElement<HTMLElement>(root, ".link-application-guide");
  const paper = requiredElement<HTMLElement>(root, ".link-application-paper");
  const triggers = Array.from(
    document.querySelectorAll<HTMLElement>("[data-link-application-trigger]"),
  );
  const captchaUrl = root.dataset.captchaUrl;
  const submitUrl = root.dataset.submitUrl;
  let challengeId = "";
  let captchaTimer = 0;
  let captchaRequest = 0;
  let opened = !root.hidden;

  if (!captchaUrl || !submitUrl) {
    return;
  }
  const captchaEndpoint = captchaUrl;
  const submitEndpoint = submitUrl;

  function scrollToApplication() {
    root.scrollIntoView({
      behavior: canAnimate() ? "smooth" : "auto",
      block: "start",
    });
  }

  function markApplicationOpen() {
    triggers.forEach((trigger) =>
      trigger.setAttribute("aria-expanded", "true"),
    );
  }

  function rememberApplicationHash() {
    if (window.location.hash === `#${root.id}`) {
      return;
    }
    const url = new URL(window.location.href);
    url.hash = root.id;
    window.history.replaceState(window.history.state, "", url);
  }

  function revealApplication() {
    if (opened) {
      scrollToApplication();
      return;
    }

    opened = true;
    if (canAnimate()) {
      root.style.opacity = "0";
      root.style.transform = "translateY(22px) scale(.985)";
      guide.style.opacity = "0";
      guide.style.transform = "translateX(-14px)";
      paper.style.opacity = "0";
      paper.style.transform = "translateX(14px)";
    }
    root.hidden = false;
    markApplicationOpen();
    rememberApplicationHash();

    const containerAnimation = run(
      root,
      {
        opacity: [0, 1],
        transform: ["translateY(22px) scale(.985)", "translateY(0) scale(1)"],
      },
      { type: "spring", bounce: 0.12, visualDuration: 0.52 },
    );
    run(
      guide,
      {
        opacity: [0, 1],
        transform: ["translateX(-14px)", "translateX(0)"],
      },
      { duration: 0.36, delay: 0.04, ease: "easeOut" },
    );
    run(
      paper,
      {
        opacity: [0, 1],
        transform: ["translateX(14px)", "translateX(0)"],
      },
      { duration: 0.4, delay: 0.1, ease: "easeOut" },
    );
    window.requestAnimationFrame(scrollToApplication);
    void refreshCaptcha();

    const clearRevealStyles = () => {
      root.style.removeProperty("opacity");
      root.style.removeProperty("transform");
      guide.style.removeProperty("opacity");
      guide.style.removeProperty("transform");
      paper.style.removeProperty("opacity");
      paper.style.removeProperty("transform");
    };
    const finished = containerAnimation?.finished;
    if (finished) {
      void finished.then(clearRevealStyles, clearRevealStyles);
    }
  }

  function clearInvalidFields() {
    form
      .querySelectorAll<HTMLElement>('[aria-invalid="true"]')
      .forEach((field) => field.removeAttribute("aria-invalid"));
  }

  function showResult(message: string, tone: ResultTone) {
    result.textContent = message;
    result.hidden = false;
    result.classList.toggle("is-success", tone === "success");
    result.classList.toggle("is-error", tone === "error");
    run(
      result,
      {
        opacity: [0, 1],
        transform: ["translateY(-5px)", "translateY(0)"],
      },
      { duration: 0.28, ease: "easeOut" },
    );
  }

  function setSubmitting(submitting: boolean) {
    form.setAttribute("aria-busy", String(submitting));
    submitButton.disabled = submitting || !challengeId;
    submitLabel.textContent = submitting
      ? (root.dataset.labelSubmitting ?? "")
      : (root.dataset.labelSubmit ?? "");
  }

  function setCaptchaLoading(loading: boolean) {
    captchaButton.disabled = loading;
    captchaButton.classList.toggle("is-loading", loading);
    captchaPlaceholder.textContent = loading
      ? (root.dataset.labelCaptchaLoading ?? "")
      : (root.dataset.labelCaptchaUnavailable ?? "");
  }

  async function refreshCaptcha() {
    const requestId = ++captchaRequest;
    window.clearTimeout(captchaTimer);
    challengeId = "";
    captchaCodeField.value = "";
    captchaImage.hidden = true;
    captchaImage.removeAttribute("src");
    setCaptchaLoading(true);
    setSubmitting(false);

    try {
      const captcha = await requestHalo<CaptchaResponse>(captchaEndpoint, {
        method: "POST",
        credentials: "omit",
        signal,
      });
      if (requestId !== captchaRequest || signal.aborted) {
        return;
      }
      challengeId = captcha.challengeId;
      captchaImage.src = captcha.image;
      captchaImage.hidden = false;
      setCaptchaLoading(false);
      setSubmitting(false);
      const refreshAfter = Math.max(10, captcha.expiresInSeconds - 5) * 1000;
      captchaTimer = window.setTimeout(
        () => void refreshCaptcha(),
        refreshAfter,
      );
      run(
        captchaImage,
        { opacity: [0, 1], transform: ["scale(.97)", "scale(1)"] },
        { duration: 0.24, ease: "easeOut" },
      );
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        return;
      }
      setCaptchaLoading(false);
      setSubmitting(false);
      const requestError = error as HaloRequestError;
      if (requestError.status === 403 || requestError.status === 404) {
        root.classList.add("is-closed");
        showResult(root.dataset.labelDisabled ?? "", "error");
      }
    }
  }

  async function submitApplication(event: SubmitEvent) {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }
    if (!challengeId) {
      showResult(root.dataset.labelCaptchaUnavailable ?? "", "error");
      await refreshCaptcha();
      return;
    }

    clearInvalidFields();
    setSubmitting(true);
    const payload = createPayload(form, challengeId);
    challengeId = "";

    try {
      await requestHalo(submitEndpoint, {
        method: "POST",
        credentials: "omit",
        signal,
        body: JSON.stringify(payload),
      });
      const message = root.dataset.labelSuccess ?? "";
      root.classList.add("is-complete");
      form.reset();
      showResult(message, "success");
      showToast(message);
      submitButton.disabled = true;
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        return;
      }
      const requestError = error as HaloRequestError;
      const message =
        error instanceof TypeError
          ? (root.dataset.labelNetworkError ?? "")
          : problemMessage(root, requestError);
      markInvalidField(form, requestError);
      showResult(message, "error");
      showToast(message);
      if (requestError.status === 403 || requestError.status === 404) {
        root.classList.add("is-closed");
        return;
      }
      await refreshCaptcha();
    } finally {
      if (!root.classList.contains("is-complete")) {
        setSubmitting(false);
      }
    }
  }

  if (result.textContent?.trim()) {
    result.hidden = false;
  }
  submitButton.disabled = true;
  triggers.forEach((trigger) => {
    trigger.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        revealApplication();
      },
      { signal },
    );
  });
  captchaButton.addEventListener("click", () => void refreshCaptcha(), {
    signal,
  });
  form.addEventListener("submit", (event) => void submitApplication(event), {
    signal,
  });
  form.addEventListener("input", clearInvalidFields, { signal });
  signal.addEventListener("abort", () => window.clearTimeout(captchaTimer), {
    once: true,
  });
  if (opened || window.location.hash === `#${root.id}`) {
    root.hidden = true;
    opened = false;
    revealApplication();
  }
}
