import type { TextureMap } from "./textures.js";

export function createMmdTextureMapFromFiles(
  files: readonly File[],
  modelFile: File
): TextureMap {
  const textureMap: TextureMap = {};
  const modelDirectory = directoryName(
    normalizeMmdRelativePath(modelFile.webkitRelativePath || modelFile.name)
  );

  for (const file of files) {
    if (!isMmdTextureFile(file)) {
      continue;
    }

    const relativePath = normalizeMmdRelativePath(file.webkitRelativePath || file.name);
    const relativeToModel = modelDirectory
      ? stripPrefix(relativePath, `${modelDirectory}/`)
      : relativePath;

    textureMap[relativePath] = file;
    textureMap[relativeToModel] = file;
    textureMap[file.name] = file;
  }

  return textureMap;
}

export function findMmdModelFiles(files: readonly File[]): File[] {
  return files
    .filter((file) => {
      const lowerName = file.name.toLowerCase();
      return lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd");
    })
    .sort((a, b) => fileKey(a).localeCompare(fileKey(b), undefined, { numeric: true }));
}

export function findMmdMotionFiles(files: readonly File[]): File[] {
  return files
    .filter((file) => file.name.toLowerCase().endsWith(".vmd"))
    .sort((a, b) => fileKey(a).localeCompare(fileKey(b), undefined, { numeric: true }));
}

export function isMmdTextureFile(file: File): boolean {
  return /\.(bmp|gif|jpe?g|png|tga|webp)$/i.test(file.name);
}

export function normalizeMmdRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function fileKey(file: File): string {
  return normalizeMmdRelativePath(file.webkitRelativePath || file.name);
}

function directoryName(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex === -1 ? "" : path.slice(0, slashIndex);
}

function stripPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
