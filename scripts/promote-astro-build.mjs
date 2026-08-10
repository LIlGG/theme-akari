import { access, cp, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const stagedTemplates = resolve(projectRoot, ".astro-stage/templates");
const liveTemplates = resolve(projectRoot, "templates");
const promotionId = `${process.pid}-${Date.now()}`;
const nextTemplates = resolve(projectRoot, `.templates-next-${promotionId}`);
const previousTemplates = resolve(
  projectRoot,
  `.templates-previous-${promotionId}`,
);

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const validateTemplates = async (directory) => {
  const requiredTemplates = [
    "index.html",
    "layout.html",
    "post.html",
    "page.html",
  ];
  await Promise.all(
    requiredTemplates.map((name) => access(resolve(directory, name))),
  );

  const layout = await readFile(resolve(directory, "layout.html"), "utf8");
  const requiredLayoutMarkers = [
    'th:fragment="html (head, content)"',
    "<head",
    "</head>",
    "<body",
    "</body>",
    "<halo:footer",
  ];
  const missingMarker = requiredLayoutMarkers.find(
    (marker) => !layout.includes(marker),
  );
  if (missingMarker) {
    throw new Error(
      `Generated layout.html is missing required marker: ${missingMarker}`,
    );
  }

  const orderedMarkers = [
    "<head",
    'th:replace="${head}"',
    "</head>",
    "<body",
    "<halo:footer",
    "</body>",
  ];
  const markerOffsets = orderedMarkers.map((marker) => layout.indexOf(marker));
  const hasInvalidOrder = markerOffsets.some(
    (offset, index) => index > 0 && offset <= markerOffsets[index - 1],
  );
  if (hasInvalidOrder) {
    throw new Error(
      `Generated layout.html has an invalid document order: ${orderedMarkers.join(" → ")}`,
    );
  }
  if (layout.includes("akari-halo-tag-")) {
    throw new Error(
      "Generated layout.html still contains Halo tag placeholders.",
    );
  }
};

await rm(nextTemplates, { force: true, recursive: true });
await rm(previousTemplates, { force: true, recursive: true });
await cp(stagedTemplates, nextTemplates, { recursive: true });

const hadLiveTemplates = await exists(liveTemplates);
try {
  await validateTemplates(nextTemplates);
  if (hadLiveTemplates) {
    await rename(liveTemplates, previousTemplates);
  }
  await rename(nextTemplates, liveTemplates);
  await rm(previousTemplates, { force: true, recursive: true });
} catch (error) {
  if (!(await exists(liveTemplates)) && (await exists(previousTemplates))) {
    await rename(previousTemplates, liveTemplates);
  }
  await rm(nextTemplates, { force: true, recursive: true });
  throw error;
}

console.log("Validated and atomically promoted Astro templates.");
