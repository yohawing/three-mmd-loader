import type {
  MaterialFlags,
  MaterialInfo,
  MaterialMorphOffset,
  MaterialTextureInfo,
  MorphData
} from "../../parser/model/modelTypes.js";
import type * as THREE from "three";
import type { MmdMaterialTransparencyMode } from "../textures.js";

export interface MmdMaterialRenderOrderEntry {
  readonly materialIndex: number;
  readonly bucket: MmdMaterialTransparencyMode;
  readonly renderOrder: number;
}

interface MmdMaterialAlphaTestFlags {
  readonly alphaTest?: boolean;
}

export function attachMmdMaterialMetadata(
  material: THREE.Material,
  materialInfo: MaterialInfo,
  materialIndex = 0,
  transparencyMode = mmdMaterialTransparencyMode(materialInfo, false)
): void {
  material.userData.mmdMaterial = {
    materialIndex,
    name: materialInfo.name,
    englishName: materialInfo.englishName,
    diffuse: [...materialInfo.diffuse],
    specular: [...materialInfo.specular],
    ambient: [...materialInfo.ambient],
    texturePath: materialInfo.texturePath,
    textureInfo: cloneMaterialTextureInfo(materialInfo.textureInfo),
    sphereTexturePath: materialInfo.sphereTexturePath,
    sphereTextureInfo: cloneMaterialTextureInfo(materialInfo.sphereTextureInfo),
    sphereMode: materialInfo.sphereMode,
    toonTexturePath: materialInfo.toonTexturePath,
    toonTextureInfo: cloneMaterialTextureInfo(materialInfo.toonTextureInfo),
    sharedToonIndex: materialInfo.sharedToonIndex,
    specularPower: materialInfo.specularPower,
    evaluatedTransparency: materialInfo.evaluatedTransparency,
    edgeColor: [...materialInfo.edgeColor],
    edgeSize: materialInfo.edgeSize,
    transparencyMode,
    renderOrderBucket: mmdMaterialRenderOrderBucket(transparencyMode),
    unsupportedDrawFlags: unsupportedMmdDrawFlags(materialInfo.flags),
    flags: { ...materialInfo.flags },
    faceCount: materialInfo.faceCount
  };
}

export function mmdMaterialCastsShadow(flags: MaterialFlags): boolean {
  return flags.groundShadow || flags.selfShadowMap;
}

export function syncMmdModelShadowFlags(
  mesh: THREE.Object3D,
  materials: readonly MaterialInfo[]
): void {
  mesh.castShadow = materials.some((material) => mmdMaterialCastsShadow(material.flags));
  mesh.receiveShadow = materials.some((material) => material.flags.selfShadow);
}

export function mmdMaterialSuppressesColorAtAlpha(
  alpha: number,
  flags: MaterialFlags | undefined
): boolean {
  if (!flags) {
    return false;
  }
  return alpha <= 0 && mmdMaterialCastsShadow(flags);
}

export function mmdMaterialAlphaTest(
  material: MaterialInfo,
  hasDiffuseTexture: boolean,
  textureTransparencyMode?: MmdMaterialTransparencyMode
): number {
  return mmdMaterialTransparencyMode(material, hasDiffuseTexture, textureTransparencyMode) ===
    "alphaTest"
    ? 0.01
    : 0;
}

export function mmdMaterialTransparencyMode(
  material: MaterialInfo,
  _hasDiffuseTexture: boolean,
  textureTransparencyMode?: MmdMaterialTransparencyMode
): MmdMaterialTransparencyMode {
  if (material.diffuse[3] < 1) {
    return "alphaBlend";
  }
  if ((material.flags as MmdMaterialAlphaTestFlags).alphaTest) {
    return "alphaTest";
  }
  const evaluatedTransparencyMode = mmdEvaluatedTransparencyMode(material.evaluatedTransparency);
  if (evaluatedTransparencyMode) {
    return evaluatedTransparencyMode;
  }
  if (textureTransparencyMode === "opaque") {
    return "opaque";
  }
  return "opaque";
}

export function mmdMaterialDepthWrite(_transparencyMode: MmdMaterialTransparencyMode): boolean {
  return true;
}

export function mmdMaterialMorphCanAffectAlpha(
  morphs: readonly MorphData[],
  materialIndex: number
): boolean {
  const visited = new Set<number>();
  const canAffectMorph = (morphIndex: number): boolean => {
    if (visited.has(morphIndex)) {
      return false;
    }
    visited.add(morphIndex);
    const morph = morphs[morphIndex];
    if (!morph) {
      return false;
    }
    if (
      morph.materialOffsets.some(
        (offset) =>
          (offset.materialIndex === -1 || offset.materialIndex === materialIndex) &&
          materialMorphOffsetCanAffectAlpha(offset)
      )
    ) {
      return true;
    }
    return (
      morph.groupOffsets.some((offset) => canAffectMorph(offset.morphIndex)) ||
      (morph.flipOffsets ?? []).some((offset) => canAffectMorph(offset.morphIndex))
    );
  };
  return morphs.some((_morph, morphIndex) => canAffectMorph(morphIndex));
}

export function computeMmdMaterialRenderOrder(
  materials: readonly { materialIndex: number; transparencyMode: MmdMaterialTransparencyMode }[]
): MmdMaterialRenderOrderEntry[] {
  // MMD draws materials in PMX definition order. Transparency buckets stay on
  // the entries for diagnostics; they must not reorder draw calls here.
  return materials
    .map((material) => ({
      materialIndex: material.materialIndex,
      bucket: mmdMaterialRenderOrderBucket(material.transparencyMode)
    }))
    .sort((a, b) => a.materialIndex - b.materialIndex)
    .map((entry, renderOrder) => ({ ...entry, renderOrder }));
}

export function materialTransparencyMode(
  material: THREE.Material | undefined,
  materialInfo: MaterialInfo
): MmdMaterialTransparencyMode {
  return (
    (material?.userData.mmdMaterial?.transparencyMode as MmdMaterialTransparencyMode | undefined) ??
    mmdMaterialTransparencyMode(materialInfo, false)
  );
}

function cloneMaterialTextureInfo(
  textureInfo: MaterialTextureInfo | undefined
): MaterialTextureInfo | undefined {
  return textureInfo ? { ...textureInfo } : undefined;
}

function materialMorphOffsetCanAffectAlpha(offset: MaterialMorphOffset): boolean {
  const alpha = offset.diffuse[3];
  return offset.operation === "multiply" ? Math.abs(alpha - 1) > 1e-6 : Math.abs(alpha) > 1e-6;
}

function mmdEvaluatedTransparencyMode(
  evaluatedTransparency: number | undefined
): MmdMaterialTransparencyMode | undefined {
  if (evaluatedTransparency === undefined || !Number.isFinite(evaluatedTransparency)) {
    return undefined;
  }
  const isNotOpaque = (evaluatedTransparency >> 4) & 0x03;
  if (isNotOpaque === 0x03) {
    return undefined;
  }
  return isNotOpaque === 0 ? "opaque" : "alphaBlend";
}

function mmdMaterialRenderOrderBucket(
  transparencyMode: MmdMaterialTransparencyMode
): MmdMaterialTransparencyMode {
  return transparencyMode;
}

function unsupportedMmdDrawFlags(flags: MaterialFlags): string[] {
  const unsupported: string[] = [];
  if (flags.vertexColor) {
    unsupported.push("vertexColor");
  }
  if (flags.pointDraw) {
    unsupported.push("pointDraw");
  }
  if (flags.lineDraw) {
    unsupported.push("lineDraw");
  }
  return unsupported;
}
