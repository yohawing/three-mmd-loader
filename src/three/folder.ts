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
  return files.filter(isMmdModelFile).sort(compareFileKey);
}

export function findMmdMotionFiles(files: readonly File[]): File[] {
  return files.filter(isMmdMotionFile).sort(compareFileKey);
}

export function findMmdAccessoryFiles(files: readonly File[]): File[] {
  return files.filter(isMmdAccessoryFile).sort(compareFileKey);
}

export function findMmdAudioFiles(files: readonly File[]): File[] {
  return files.filter(isMmdAudioFile).sort(compareFileKey);
}

export function isMmdModelFile(file: { readonly name: string }): boolean {
  return /\.(?:pmx|pmd)$/i.test(file.name);
}

export function isMmdMotionFile(file: { readonly name: string }): boolean {
  return /\.vmd$/i.test(file.name);
}

export function isMmdTextureFile(file: { readonly name: string }): boolean {
  return /\.(bmp|dds|gif|jpe?g|png|tga|webp)$/i.test(file.name);
}

export function isMmdAccessoryFile(file: { readonly name: string }): boolean {
  return /\.(?:x|vac)$/i.test(file.name);
}

export function isMmdAudioFile(file: { readonly name: string }): boolean {
  return /\.wav$/i.test(file.name);
}

export function normalizeMmdRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function compareFileKey(a: File, b: File): number {
  return fileKey(a).localeCompare(fileKey(b), undefined, { numeric: true });
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
