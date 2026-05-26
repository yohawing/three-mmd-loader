export interface PmmAssetReference {
  path: string;
  normalizedPath: string;
  fileName: string;
  extension: string;
  kind: "model" | "accessory" | "motion" | "audio" | "image" | "unknown";
  offset: number;
}

export interface PmmManifest {
  signature: "Polygon Movie maker";
  version: string;
  byteLength: number;
  assetReferences: PmmAssetReference[];
  modelPaths: string[];
  accessoryPaths: string[];
  motionPaths: string[];
  audioPaths: string[];
  imagePaths: string[];
}

export interface PmmAssetResolution {
  reference: PmmAssetReference;
  resolvedPath: string;
  exists?: boolean;
}

export interface PmmAssetResolutionOptions {
  userFileRoot?: string;
  existingPaths?: Iterable<string>;
}

export interface PmmScenePlan {
  modelAssets: PmmAssetResolution[];
  accessoryAssets: PmmAssetResolution[];
  motionAssets: PmmAssetResolution[];
  audioAssets: PmmAssetResolution[];
  imageAssets: PmmAssetResolution[];
  missingAssets: PmmAssetResolution[];
}

export interface PmmStaticPreviewPlan {
  primaryModel?: PmmAssetResolution;
  modelAssets: PmmAssetResolution[];
  accessoryAssets: PmmAssetResolution[];
  skippedAssets: PmmAssetResolution[];
  missingAssets: PmmAssetResolution[];
}

const asciiDecoder = new TextDecoder("ascii");
const shiftJisDecoder = new TextDecoder("shift-jis");
const pmmHeaderPrefix = "Polygon Movie maker ";
const assetPathPattern =
  /([A-Za-z]:[\\/][^\0\r\n]*?\.(?:pmd|pmx|vmd|vac|x|wav|bmp|tga)|(?:UserFile|Model|Accessory|Motion|Wave|BackGround)[\\/][^\0\r\n]*?\.(?:pmd|pmx|vmd|vac|x|wav|bmp|tga))/gi;

export function parsePmmManifest(bytes: Uint8Array): PmmManifest {
  const header = asciiDecoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, 32)));
  if (!header.startsWith(pmmHeaderPrefix)) {
    throw new Error("PMM_HEADER_NOT_FOUND");
  }
  const version = header.slice(pmmHeaderPrefix.length).split("\0")[0]?.trim() ?? "";
  const references = extractPmmAssetReferences(bytes);
  return {
    signature: "Polygon Movie maker",
    version,
    byteLength: bytes.byteLength,
    assetReferences: references,
    modelPaths: pathsByKind(references, "model"),
    accessoryPaths: pathsByKind(references, "accessory"),
    motionPaths: pathsByKind(references, "motion"),
    audioPaths: pathsByKind(references, "audio"),
    imagePaths: pathsByKind(references, "image")
  };
}

export function createPmmScenePlan(
  manifest: PmmManifest,
  options: PmmAssetResolutionOptions = {}
): PmmScenePlan {
  const resolutions = manifest.assetReferences.map((reference) =>
    resolvePmmAssetReference(reference, options)
  );
  return {
    modelAssets: resolutions.filter((resolution) => resolution.reference.kind === "model"),
    accessoryAssets: resolutions.filter((resolution) => resolution.reference.kind === "accessory"),
    motionAssets: resolutions.filter((resolution) => resolution.reference.kind === "motion"),
    audioAssets: resolutions.filter((resolution) => resolution.reference.kind === "audio"),
    imageAssets: resolutions.filter((resolution) => resolution.reference.kind === "image"),
    missingAssets: resolutions.filter((resolution) => resolution.exists === false)
  };
}

export function createPmmStaticPreviewPlan(scenePlan: PmmScenePlan): PmmStaticPreviewPlan {
  const availableModels = scenePlan.modelAssets.filter(assetExists);
  const availableAccessories = scenePlan.accessoryAssets.filter(assetExists);
  const primaryModel =
    availableModels.find((asset) => !isLikelyDummyModel(asset.reference.fileName)) ??
    availableModels[0];
  const previewAssets = new Set([...availableModels, ...availableAccessories]);
  const allAssets = [
    ...scenePlan.modelAssets,
    ...scenePlan.accessoryAssets,
    ...scenePlan.motionAssets,
    ...scenePlan.audioAssets,
    ...scenePlan.imageAssets
  ];
  return {
    primaryModel,
    modelAssets: availableModels,
    accessoryAssets: availableAccessories,
    skippedAssets: allAssets.filter((asset) => !previewAssets.has(asset)),
    missingAssets: scenePlan.missingAssets
  };
}

export function resolvePmmAssetReference(
  reference: PmmAssetReference,
  options: PmmAssetResolutionOptions = {}
): PmmAssetResolution {
  const userFileRoot = normalizeResolutionPath(options.userFileRoot ?? "data/BuildinUserFile");
  const existingPaths = options.existingPaths
    ? new Set([...options.existingPaths].map((path) => normalizeResolutionPath(path).toLowerCase()))
    : undefined;
  const resolvedPath = resolvePmmAssetPath(reference.normalizedPath, userFileRoot);
  return {
    reference,
    resolvedPath,
    exists: existingPaths ? existingPaths.has(resolvedPath.toLowerCase()) : undefined
  };
}

export function resolvePmmAssetPath(path: string, userFileRoot = "data/BuildinUserFile"): string {
  const normalizedPath = normalizeResolutionPath(path);
  const normalizedRoot = normalizeResolutionPath(userFileRoot).replace(/\/$/, "");
  const userFilePrefix = "userfile/";
  if (normalizedPath.toLowerCase().startsWith(userFilePrefix)) {
    return `${normalizedRoot}/${normalizedPath.slice(userFilePrefix.length)}`;
  }
  return normalizedPath;
}

function extractPmmAssetReferences(bytes: Uint8Array): PmmAssetReference[] {
  const references = new Map<string, PmmAssetReference>();
  let chunkStart = 0;
  for (let index = 0; index <= bytes.byteLength; index++) {
    if (index < bytes.byteLength && bytes[index] !== 0) {
      continue;
    }
    if (index > chunkStart) {
      const text = shiftJisDecoder.decode(bytes.subarray(chunkStart, index));
      for (const match of text.matchAll(assetPathPattern)) {
        if (match.index === undefined) {
          continue;
        }
        const rawPath = stripLeadingBinaryJunk(match[1] ?? "");
        if (!rawPath.includes("\\") && !rawPath.includes("/")) {
          continue;
        }
        const normalizedPath = normalizePmmAssetPath(rawPath);
        const key = normalizedPath.toLowerCase();
        if (!references.has(key)) {
          references.set(
            key,
            createAssetReference(rawPath, normalizedPath, chunkStart + match.index)
          );
        }
      }
    }
    chunkStart = index + 1;
  }
  return [...references.values()].sort((left, right) => left.offset - right.offset);
}

function stripLeadingBinaryJunk(value: string): string {
  return value.replace(/^[^A-Za-z0-9_ぁ-んァ-ヶ一-龠（）()]+/, "");
}

function normalizePmmAssetPath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+/g, "/");
  const userFileIndex = normalized.toLowerCase().lastIndexOf("userfile/");
  return userFileIndex >= 0 ? normalized.slice(userFileIndex) : normalized;
}

function normalizeResolutionPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function createAssetReference(
  path: string,
  normalizedPath: string,
  offset: number
): PmmAssetReference {
  const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
  const extensionSeparatorIndex = fileName.lastIndexOf(".");
  const extension =
    extensionSeparatorIndex >= 0 ? fileName.slice(extensionSeparatorIndex + 1).toLowerCase() : "";
  return {
    path,
    normalizedPath,
    fileName,
    extension,
    kind: classifyAssetKind(extension),
    offset
  };
}

function classifyAssetKind(extension: string): PmmAssetReference["kind"] {
  switch (extension) {
    case "pmd":
    case "pmx":
      return "model";
    case "x":
    case "vac":
      return "accessory";
    case "vmd":
      return "motion";
    case "wav":
      return "audio";
    case "bmp":
    case "tga":
      return "image";
    default:
      return "unknown";
  }
}

function pathsByKind(
  references: readonly PmmAssetReference[],
  kind: PmmAssetReference["kind"]
): string[] {
  return references
    .filter((reference) => reference.kind === kind)
    .map((reference) => reference.normalizedPath);
}

function assetExists(asset: PmmAssetResolution): boolean {
  return asset.exists !== false;
}

function isLikelyDummyModel(fileName: string): boolean {
  return fileName.toLowerCase() === "dummy.pmd" || fileName === "ダミーボーン.pmd";
}
