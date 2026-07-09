import {
  compareFileKey,
  isMmdAccessoryFile,
  isMmdAudioFile,
  isMmdModelFile,
  isMmdMotionFile,
  isMmdTextureFile,
  normalizeMmdRelativePath
} from "./folder.js";

export type MmdAssetKind = "model" | "motion" | "texture" | "accessory" | "audio";

export interface MmdFileIndex {
  readonly models: readonly File[];
  readonly motions: readonly File[];
  readonly accessories: readonly File[];
  readonly audios: readonly File[];
  readonly textures: readonly File[];
  resolve(path: string): File | undefined;
}

export function classifyMmdAssetKind(path: string): MmdAssetKind | undefined {
  const named = { name: path };
  if (isMmdModelFile(named)) return "model";
  if (isMmdMotionFile(named)) return "motion";
  if (isMmdAccessoryFile(named)) return "accessory";
  if (isMmdAudioFile(named)) return "audio";
  if (isMmdTextureFile(named)) return "texture";
  return undefined;
}

export function createMmdFileIndex(files: readonly File[]): MmdFileIndex {
  const models: File[] = [];
  const motions: File[] = [];
  const accessories: File[] = [];
  const audios: File[] = [];
  const textures: File[] = [];

  const byPath = new Map<string, File>();

  for (const file of files) {
    if (isMmdModelFile(file)) models.push(file);
    else if (isMmdMotionFile(file)) motions.push(file);
    else if (isMmdAccessoryFile(file)) accessories.push(file);
    else if (isMmdAudioFile(file)) audios.push(file);
    else if (isMmdTextureFile(file)) textures.push(file);

    const fullPath = normalizeMmdRelativePath(file.webkitRelativePath || file.name).toLowerCase();
    byPath.set(fullPath, file);

    const nameLower = file.name.toLowerCase();
    if (!byPath.has(nameLower)) {
      byPath.set(nameLower, file);
    }
  }

  models.sort(compareFileKey);
  motions.sort(compareFileKey);
  accessories.sort(compareFileKey);
  audios.sort(compareFileKey);
  textures.sort(compareFileKey);

  return {
    models,
    motions,
    accessories,
    audios,
    textures,
    resolve(path: string): File | undefined {
      const normalized = normalizeMmdRelativePath(path).toLowerCase();
      const direct = byPath.get(normalized);
      if (direct) return direct;

      const suffix = `/${normalized}`;
      for (const [indexedPath, file] of byPath) {
        if (indexedPath.endsWith(suffix)) {
          return file;
        }
      }
      return undefined;
    }
  };
}
