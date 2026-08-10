/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="vite/client" />

declare module "virtual:uno.css";
declare module "*.css";

declare namespace astroHTML.JSX {
  interface HTMLAttributes {
    [attribute: `th:${string}`]: string | undefined;
    [attribute: `xmlns:${string}`]: string | undefined;
  }
}
