import { run, softlyUpdateText } from "../runtime/context";
import { isAbortError } from "../services/halo-http";
import { withRequestTimeout } from "../utils/abort";

type LiveWeather = {
  temperature: number;
  code?: number;
  description?: string;
  location?: string;
};

type WeatherCache = LiveWeather & { cachedAt: number };

type WeatherPosition = {
  latitude: number;
  longitude: number;
  location: string;
};

async function getGrantedBrowserPosition() {
  if (!navigator.geolocation || !navigator.permissions) {
    return null;
  }
  try {
    const permission = await navigator.permissions.query({
      name: "geolocation",
    });
    if (permission.state !== "granted") {
      return null;
    }
    return await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: false,
        maximumAge: 900_000,
        timeout: 4500,
      });
    });
  } catch {
    return null;
  }
}

async function fetchApproximatePosition(signal?: AbortSignal) {
  const response = await fetch("https://ipwho.is/", {
    signal: withRequestTimeout(signal),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`IP location request failed with ${response.status}`);
  }
  const position = (await response.json()) as {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
  };
  if (
    position.success === false ||
    !Number.isFinite(position.latitude) ||
    !Number.isFinite(position.longitude)
  ) {
    throw new Error("IP location did not return coordinates");
  }
  return {
    latitude: position.latitude as number,
    longitude: position.longitude as number,
    location: position.city?.trim() ?? "",
  } satisfies WeatherPosition;
}

async function resolveWeatherPosition(signal?: AbortSignal) {
  const precise = await getGrantedBrowserPosition();
  signal?.throwIfAborted();
  if (
    Number.isFinite(precise?.coords.latitude) &&
    Number.isFinite(precise?.coords.longitude)
  ) {
    return {
      latitude: precise!.coords.latitude,
      longitude: precise!.coords.longitude,
      location: "",
    } satisfies WeatherPosition;
  }
  return fetchApproximatePosition(signal);
}

async function fetchOpenMeteo(position: WeatherPosition, signal?: AbortSignal) {
  const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
  endpoint.searchParams.set("latitude", String(position.latitude));
  endpoint.searchParams.set("longitude", String(position.longitude));
  endpoint.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,is_day",
  );
  endpoint.searchParams.set("timezone", "auto");
  const response = await fetch(endpoint, {
    signal: withRequestTimeout(signal),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with ${response.status}`);
  }
  const payload = (await response.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const temperature = payload.current?.temperature_2m;
  if (!Number.isFinite(temperature)) {
    throw new Error("Open-Meteo response missed current weather");
  }
  return {
    temperature: temperature as number,
    code: payload.current?.weather_code,
    location: position.location,
  } satisfies LiveWeather;
}

async function fetchWttr(position: WeatherPosition, signal?: AbortSignal) {
  const endpoint = new URL(
    `https://wttr.in/${position.latitude},${position.longitude}`,
  );
  endpoint.searchParams.set("format", "j1");
  const response = await fetch(endpoint, {
    signal: withRequestTimeout(signal),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`wttr.in request failed with ${response.status}`);
  }
  const payload = (await response.json()) as {
    current_condition?: Array<{
      temp_C?: string;
      weatherCode?: string;
      weatherDesc?: Array<{ value?: string }>;
    }>;
  };
  const current = payload.current_condition?.[0];
  const temperature = Number(current?.temp_C);
  if (!Number.isFinite(temperature)) {
    throw new Error("wttr.in response missed current weather");
  }
  return {
    temperature,
    code: Number(current?.weatherCode),
    description: current?.weatherDesc?.[0]?.value,
    location: position.location,
  } satisfies LiveWeather;
}

async function fetchNearbyWeather(signal?: AbortSignal): Promise<LiveWeather> {
  const position = await resolveWeatherPosition(signal);
  try {
    return await fetchOpenMeteo(position, signal);
  } catch (primaryError) {
    try {
      return await fetchWttr(position, signal);
    } catch {
      throw primaryError;
    }
  }
}

function weatherPresentation(
  code: number | undefined,
  rootElement: HTMLElement,
) {
  const label = (name: string, fallback: string) =>
    rootElement.dataset[name] ?? fallback;
  if (code === undefined || Number.isNaN(code)) {
    return {
      label: label("weatherCloudy", "Cloudy"),
      icon: "i-lucide-cloud-sun",
    };
  }
  if (code === 0 || code === 113) {
    return { label: label("weatherClear", "Clear"), icon: "i-lucide-sun" };
  }
  if ([1, 2, 116].includes(code)) {
    return {
      label: label("weatherPartlyCloudy", "Partly cloudy"),
      icon: "i-lucide-cloud-sun",
    };
  }
  if ([3, 119, 122].includes(code)) {
    return {
      label: label("weatherCloudy", "Cloudy"),
      icon: "i-lucide-cloud-sun",
    };
  }
  if ([45, 48, 143, 248, 260].includes(code)) {
    return { label: label("weatherFog", "Foggy"), icon: "i-lucide-cloud-sun" };
  }
  if ([51, 53, 55, 56, 57, 176, 263, 266, 281, 284].includes(code)) {
    return {
      label: label("weatherDrizzle", "Drizzle"),
      icon: "i-lucide-cloud-rain",
    };
  }
  if (
    [
      71, 73, 75, 77, 85, 86, 179, 182, 185, 227, 230, 323, 326, 329, 332, 335,
      338, 368, 371,
    ].includes(code)
  ) {
    return { label: label("weatherSnow", "Snow"), icon: "i-lucide-snowflake" };
  }
  if ([95, 96, 99, 200, 386, 389, 392, 395].includes(code)) {
    return {
      label: label("weatherThunderstorm", "Thunderstorms"),
      icon: "i-lucide-cloud-rain",
    };
  }
  return { label: label("weatherRain", "Rain"), icon: "i-lucide-cloud-rain" };
}

function readWeatherCache(cacheKey: string) {
  try {
    const cached = JSON.parse(
      window.localStorage.getItem(cacheKey) ?? "null",
    ) as WeatherCache | null;
    return cached && Date.now() - cached.cachedAt < 20 * 60_000 ? cached : null;
  } catch {
    return null;
  }
}

function writeWeatherCache(cacheKey: string, snapshot: LiveWeather) {
  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        ...snapshot,
        cachedAt: Date.now(),
      } satisfies WeatherCache),
    );
  } catch {
    // Storage can be unavailable in privacy modes.
  }
}

function renderWeather(
  weather: HTMLElement,
  page: HTMLElement,
  icon: HTMLElement,
  text: HTMLElement,
  snapshot: LiveWeather,
) {
  const presentation = weatherPresentation(snapshot.code, page);
  icon.className = presentation.icon;
  softlyUpdateText(
    text,
    `${Math.round(snapshot.temperature)}° · ${presentation.label}`,
  );
  weather.classList.remove("is-loading", "is-unavailable");
  if (snapshot.location) {
    weather.title = `${snapshot.location} · ${presentation.label}`;
  }
  run(
    icon,
    { opacity: [0.4, 1], transform: ["scale(.82)", "scale(1)"] },
    { duration: 0.36, type: "spring", bounce: 0.16 },
  );
}

function renderUnavailableWeather(
  weather: HTMLElement,
  page: HTMLElement,
  icon: HTMLElement,
  text: HTMLElement,
) {
  icon.className = "i-lucide-cloud-off";
  text.textContent = page.dataset.weatherUnavailable ?? "Weather unavailable";
  weather.classList.remove("is-loading");
  weather.classList.add("is-unavailable");
}

export async function initLiveWeather(signal?: AbortSignal) {
  const weather = document.querySelector<HTMLElement>("[data-live-weather]");
  const page = document.querySelector<HTMLElement>(".home-view");
  const icon = weather?.querySelector<HTMLElement>("[data-weather-icon]");
  const text = weather?.querySelector<HTMLElement>("[data-weather-text]");
  if (!weather || !page || !icon || !text) {
    return;
  }

  const cacheKey = "akari.live-weather.v2";
  try {
    const snapshot: LiveWeather =
      readWeatherCache(cacheKey) ?? (await fetchNearbyWeather(signal));
    signal?.throwIfAborted();
    renderWeather(weather, page, icon, text, snapshot);
    writeWeatherCache(cacheKey, snapshot);
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    console.warn("Akari weather could not be updated", error);
    renderUnavailableWeather(weather, page, icon, text);
  }
}
