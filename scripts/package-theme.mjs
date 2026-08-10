import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(import.meta.dirname, "..");
const packageRoot = await mkdtemp(join(tmpdir(), "theme-akari-package-"));
const distributionDirectory = resolve(projectRoot, "dist");
const packageCli = fileURLToPath(
  import.meta.resolve("@halo-dev/theme-package-cli"),
);

const packageEntries = [
  "templates",
  "i18n",
  "docs/USER_GUIDE.md",
  "docs/images",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "theme.yaml",
  "settings.yaml",
  "annotations.yaml",
];

const runPackageCli = () =>
  new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, [packageCli, "--all"], {
      cwd: packageRoot,
      stdio: "inherit",
    });
    child.once("error", rejectProcess);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      rejectProcess(
        new Error(`theme-package exited with code ${code ?? "unknown"}`),
      );
    });
  });

try {
  await Promise.all(
    packageEntries.map((entry) =>
      cp(resolve(projectRoot, entry), resolve(packageRoot, entry), {
        recursive: true,
      }),
    ),
  );
  await runPackageCli();

  const stagedDistribution = resolve(packageRoot, "dist");
  const archives = (await readdir(stagedDistribution)).filter((name) =>
    name.endsWith(".zip"),
  );
  if (archives.length !== 1) {
    throw new Error(`Expected one theme archive, found ${archives.length}`);
  }

  await mkdir(distributionDirectory, { recursive: true });
  const archive = resolve(stagedDistribution, archives[0]);
  const destination = resolve(distributionDirectory, basename(archive));
  await cp(archive, destination);
  console.log(`Copied curated theme archive to ${destination}`);
} finally {
  await rm(packageRoot, { force: true, recursive: true });
}
