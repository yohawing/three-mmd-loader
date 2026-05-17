import { cpSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(scriptDirectory, "..");
const sourceAssetsDirectory = join(rootDirectory, "src", "three", "assets");
const distAssetsDirectory = join(rootDirectory, "dist", "three", "assets");
const distMmdAssetsDirectory = join(distAssetsDirectory, "mmd");

const sharedToonTextureNames = Array.from(
  { length: 10 },
  (_, index) => `toon${String(index + 1).padStart(2, "0")}.bmp`
);

try {
  cpSync(sourceAssetsDirectory, distAssetsDirectory, {
    recursive: true,
    force: true
  });

  const copiedSharedToonTextureNames = sharedToonTextureNames.filter((fileName) => {
    try {
      return statSync(join(distMmdAssetsDirectory, fileName)).isFile();
    } catch {
      return false;
    }
  });

  if (copiedSharedToonTextureNames.length !== sharedToonTextureNames.length) {
    const missingFileNames = sharedToonTextureNames.filter(
      (fileName) => !copiedSharedToonTextureNames.includes(fileName)
    );

    console.error(`Missing MMD shared toon BMP assets in dist: ${missingFileNames.join(", ")}`);
    process.exit(1);
  }

  console.log(`Copied ${copiedSharedToonTextureNames.length} MMD shared toon BMP assets.`);
} catch (error) {
  console.error("Failed to copy MMD assets.");
  console.error(error);
  process.exit(1);
}
