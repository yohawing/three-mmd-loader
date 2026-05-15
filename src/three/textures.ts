export interface TextureResolver {
  resolve(path: string, modelUrl?: string): Promise<string | URL | Blob | undefined>;
}

export type TextureMap = Record<string, string | URL | Blob>;

export interface MmdToonTextureReference {
  readonly path: string;
  readonly textureInfo?: unknown;
  readonly shared: boolean;
}

export interface MmdToonTextureMaterial {
  readonly toonTexturePath?: string;
  readonly toonTextureInfo?: unknown;
  readonly sharedToonIndex?: number;
}

export function normalizeMmdTexturePath(texturePath: string): string {
  return texturePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function resolveMappedTexture(
  texturePath: string,
  textureMap?: TextureMap
): string | URL | Blob | undefined {
  if (!textureMap) {
    return undefined;
  }

  const normalized = normalizeMmdTexturePath(texturePath);
  const mapped = textureMap[texturePath] ?? textureMap[normalized] ?? textureMap[`./${normalized}`];
  if (mapped) {
    return mapped;
  }

  const normalizedLower = normalized.toLowerCase();
  for (const [key, value] of Object.entries(textureMap)) {
    if (normalizeMmdTexturePath(key).toLowerCase() === normalizedLower) {
      return value;
    }
  }

  return undefined;
}

export function createTextureResolver(
  textureResolver?: TextureResolver,
  textureMap?: TextureMap
): TextureResolver | undefined {
  if (!textureResolver && !textureMap) {
    return undefined;
  }

  return {
    async resolve(path, modelUrl) {
      const mapped = resolveMappedTexture(path, textureMap);
      if (mapped) {
        return mapped;
      }

      return (
        (await textureResolver?.resolve(path, modelUrl)) ?? resolveAdjacentTexture(path, modelUrl)
      );
    }
  };
}

export function defaultSharedToonTexturePath(sharedToonIndex: number | undefined): string {
  return sharedToonIndex === undefined
    ? ""
    : `toon${String(sharedToonIndex + 1).padStart(2, "0")}.bmp`;
}

export function isBuiltInToonTexturePath(texturePath: string): boolean {
  return /^toon0[1-9]\.bmp$|^toon10\.bmp$/i.test(normalizeMmdTexturePath(texturePath));
}

export function createMmdBuiltInToonTextureMap(baseUrl: string | URL): TextureMap {
  const map: TextureMap = {};
  const base = typeof baseUrl === "string" ? baseUrl : baseUrl.toString();
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  for (let index = 0; index < 10; index++) {
    const texturePath = defaultSharedToonTexturePath(index);
    map[texturePath] = isAbsoluteUrl(normalizedBase)
      ? new URL(texturePath, normalizedBase).toString()
      : `${normalizedBase}${texturePath}`;
  }

  return map;
}

export function resolveMmdToonTextureReference(
  material: MmdToonTextureMaterial
): MmdToonTextureReference {
  if (material.toonTexturePath) {
    return {
      path: material.toonTexturePath,
      textureInfo: material.toonTextureInfo,
      shared: false
    };
  }

  const sharedPath = defaultSharedToonTexturePath(material.sharedToonIndex);
  return {
    path: sharedPath,
    textureInfo: undefined,
    shared: sharedPath.length > 0
  };
}

function resolveAdjacentTexture(texturePath: string, modelUrl: string | undefined): string | undefined {
  if (!modelUrl) {
    return undefined;
  }

  if (isAbsoluteUrl(modelUrl)) {
    return new URL(normalizeMmdTexturePath(texturePath), new URL(".", modelUrl)).toString();
  }

  if (typeof location === "undefined") {
    const normalizedModelUrl = normalizeMmdTexturePath(modelUrl);
    const basePath = normalizedModelUrl.includes("/")
      ? normalizedModelUrl.slice(0, normalizedModelUrl.lastIndexOf("/") + 1)
      : "";
    return `${basePath}${normalizeMmdTexturePath(texturePath)}`;
  }

  return new URL(
    normalizeMmdTexturePath(texturePath),
    new URL(".", new URL(modelUrl, location.href))
  ).toString();
}

function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(url);
}
