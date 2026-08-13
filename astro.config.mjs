// @ts-check
import { defineConfig } from "astro/config";
import UnoCSS from "unocss/astro";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HALO_TAG_PREFIX = "akari-halo-tag-";

/** @param {string} source */
const decodeHaloTemplateSyntax = (source) =>
  source
    .replace(
      new RegExp(`<(/?)${HALO_TAG_PREFIX}th-block\\b`, "g"),
      "<$1th:block",
    )
    .replace(
      new RegExp(`<(/?)${HALO_TAG_PREFIX}halo-(comment|footer)\\b`, "g"),
      "<$1halo:$2",
    );

/** @param {URL} directory */
const restoreHaloTemplateSyntax = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryUrl = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        await restoreHaloTemplateSyntax(new URL(`${entry.name}/`, directory));
        return;
      }
      if (!entry.name.endsWith(".html")) {
        return;
      }

      const source = await readFile(entryUrl, "utf8");
      await writeFile(entryUrl, decodeHaloTemplateSyntax(source));
    }),
  );
};

/** @type {import("astro").AstroIntegration} */
const preserveHaloRuntimeTemplates = {
  name: "akari-preserve-halo-runtime-templates",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const gatewayDirectory = new URL("gateway_fragments/", dir);
      await mkdir(gatewayDirectory, { recursive: true });
      await copyFile(
        new URL("./src/gateway_fragments/layout.html", import.meta.url),
        new URL("layout.html", gatewayDirectory),
      );
      await restoreHaloTemplateSyntax(dir);
    },
  },
};

/**
 * Astro compiles Halo's Thymeleaf templates into a staging directory. The
 * promotion script validates and atomically swaps the runtime template
 * directory while keeping generated files out of source.
 */
export default defineConfig({
  base: "/themes/theme-akari",
  // Astro 7 defaults to JSX-like whitespace compression. Keep Astro 6's HTML
  // semantics so a framework upgrade cannot change visible spacing.
  compressHTML: true,
  // ClientRouter otherwise opts every link into prefetching. Akari limits the
  // bandwidth-aware hover strategy to deliberate navigation links so browsing
  // a media-rich card grid never starts a wave of speculative Halo requests.
  prefetch: {
    prefetchAll: false,
    defaultStrategy: "hover",
  },
  build: {
    assets: "assets",
    format: "file",
  },
  outDir: "./.astro-stage/templates",
  integrations: [UnoCSS(), preserveHaloRuntimeTemplates],
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
