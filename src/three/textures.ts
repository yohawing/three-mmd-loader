export {
  evaluateMmdTextureAlphaSamples,
  evaluateMmdTextureTransparencySamples,
  evaluateMmdTextureAlphaRgba,
  evaluateMmdTextureAlphaTexture,
  evaluateMmdTextureAlphaGeometry
} from "./texture-alpha.js";
export type { MmdMaterialTransparencyMode, MmdTextureAlphaEvaluationOptions } from "./texture-alpha.js";
export { evaluateMmdBmpTextureAlpha, injectMmdBmp32BitAlphaHeader } from "./texture-bmp.js";
export { decodeMmdTgaTexture } from "./texture-tga.js";
export {
  isMmdBmpLikeTexturePath,
  isMmdTgaLikeTexturePath,
  isMmdDdsTexturePath,
  createTextureResolver,
  resolveMappedTexture,
  normalizeMmdTexturePath
} from "./texture-source.js";
export type { TextureResolver, TextureMap } from "./texture-source.js";
export {
  loadToonTexture,
  rotateMmdToonTexture,
  createMmdBuiltInToonTextureMap,
  defaultSharedToonTexturePath,
  resolveMmdToonTextureReference,
  createFallbackMmdMaterial,
  getDefaultToonGradientMap
} from "./texture-toon.js";
export type { MmdToonTextureReference, MmdToonTextureMaterial } from "./texture-toon.js";
export { loadMaterialTextureWithDiagnostics, configureMmdTexture } from "./texture-loading.js";
