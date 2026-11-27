

export interface TextureResolver {
  resolve(path: string, modelUrl?: string): Promise<string | URL | Blob | undefined>;
}

export type TextureMap = Record<string, string | URL | Blob>;

export function isMmdBmpLikeTexturePath(texturePath: string): boolean {
  return /\.(?:bmp|spa|sph)$/i.test(texturePath.trimEnd());
}

export function isMmdTgaLikeTexturePath(texturePath: string): boolean {
  return /\.tga$/i.test(texturePath.trimEnd());
}

export function isMmdDdsTexturePath(texturePath: string): boolean {
  return /\.dds(?:[?#].*)?$/i.test(texturePath.trimEnd());
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

export function normalizeMmdTexturePath(texturePath: string): string {
  // PMX authored on Windows can retain trailing spaces absent from the actual file name.
  return texturePath.trimEnd().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function resolveAdjacentTexture(
  texturePath: string,
  modelUrl: string | undefined
): string | undefined {
  if (!modelUrl) {
    return undefined;
  }

  if (typeof location === "undefined" && !isAbsoluteUrl(modelUrl)) {
    const normalizedModelUrl = normalizeMmdTexturePath(modelUrl);
    const basePath = normalizedModelUrl.includes("/")
      ? normalizedModelUrl.slice(0, normalizedModelUrl.lastIndexOf("/") + 1)
      : "";
    return `${basePath}${normalizeMmdTexturePath(texturePath)}`;
  }

  if (typeof location === "undefined" && isAbsoluteUrl(modelUrl)) {
    return new URL(normalizeMmdTexturePath(texturePath), new URL(".", modelUrl)).toString();
  }

  return new URL(
    normalizeMmdTexturePath(texturePath),
    new URL(".", new URL(modelUrl, browserBaseHref()))
  ).toString();
}

export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(url);
}

function browserBaseHref(): string {
  return typeof location === "undefined" ? "http://localhost/" : location.href;
}
