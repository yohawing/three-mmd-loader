import * as THREE from "three";
import { describe, expect, test } from "vitest";

import {
  applyThreeMmdMaterialTextures,
  createThreeMmdMaterials
} from "../../../src/three/index.js";
import type { MaterialInfo } from "../../../src/parser/model/modelTypes.js";
import { visualCaseAssets } from "../../../scripts/fixtures/generate-minimal-pmx.mjs";

// T070-20: a TGA soft-alpha overlay's whole-image alpha scan used to classify
// it as "alphaTest" (see src/three/material/material-texture-set.ts:
// evaluateMmdDefaultMaterialTransparency / evaluateCachedMmdTextureAlphaGeometry,
// which short-circuits to the TGA decoder's whole-image
// texture.userData.mmdTextureAlphaMode via evaluateMmdTextureAlphaGeometry in
// src/three/textures.ts), unless the material name matched the soft-overlay
// vocabulary in isLikelyMmdSoftAlphaOverlayMaterial
// (src/three/material/material-texture-set.ts:237-242).
//
// evaluateAlphaStats (src/three/textures.ts) now also promotes to "alphaBlend"
// on soft-alpha dominance: when the middle-alpha population dominates (>=75%)
// among visible (non-zero-alpha) pixels and covers at least 0.5% of all
// samples, independent of the material-name heuristic. This fixes the real
// "照れデフォ" (頬小.tga cheek overlay) material, which does not match the name
// vocabulary.
// These tests exercise the fixture materials from
// scripts/fixtures/generate-minimal-pmx.mjs's "mmd-tga-soft-cheek-overlay" visual
// case through the real classification pipeline (real TGA bytes, real TGA
// decoder, real evaluateMmdDefaultMaterialTransparency) to document the bug
// without changing any src/ classification logic.

function createMaterialInfo(overrides: Partial<MaterialInfo> = {}): MaterialInfo {
  return {
    name: "mat",
    englishName: "mat",
    texturePath: "",
    sphereTexturePath: "",
    sphereMode: "none",
    toonTexturePath: "",
    sharedToonIndex: undefined,
    diffuse: [1, 1, 1, 1],
    specular: [0.01, 0.01, 0.01],
    specularPower: 4,
    ambient: [0.3, 0.12, 0.13],
    edgeColor: [0, 0, 0, 0],
    edgeSize: 0,
    flags: {
      doubleSided: false,
      groundShadow: false,
      selfShadowMap: false,
      selfShadow: false,
      edge: false,
      vertexColor: false,
      pointDraw: false,
      lineDraw: false
    },
    faceCount: 1,
    ...overrides
  };
}

function createAlphaEvaluationGeometry(materialIndex = 0): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setIndex([0, 1, 2]);
  geometry.addGroup(0, 3, materialIndex);
  return geometry;
}

function cheekOverlayAsset(path: string): Uint8Array {
  const assets = visualCaseAssets("mmd-tga-soft-cheek-overlay");
  const asset = assets.find((entry: { path: string }) => entry.path === path);
  if (!asset) {
    throw new Error(`missing "mmd-tga-soft-cheek-overlay" asset: ${path}`);
  }
  return asset.bytes;
}

describe("T070-20 TGA soft alpha cheek overlay name heuristic", () => {
  test("classifies the binary alpha control material as alphaTest", async () => {
    const tgaBytes = cheekOverlayAsset("tga-cheek-binary-alpha-control.tga");
    const mmdMaterials = [
      createMaterialInfo({
        name: "mat_binary_alpha_control",
        englishName: "BinaryAlphaControl",
        texturePath: "textures/tga-cheek-binary-alpha-control.tga"
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/tga-cheek-binary-alpha-control.tga": new Blob([tgaBytes]) },
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaTest");
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaTest");
  });

  // A soft-alpha TGA overlay is classified alphaBlend regardless of whether the
  // material name happens to be in the soft-overlay vocabulary, via the
  // soft-alpha-dominance rule in evaluateAlphaStats (src/three/textures.ts).
  test(
    "T070-20: classifies the 照れデフォ soft-alpha overlay as alphaBlend",
    async () => {
      const tgaBytes = cheekOverlayAsset("tga-cheek-soft-alpha.tga");
      const mmdMaterials = [
        createMaterialInfo({
          name: "照れデフォ",
          englishName: "TereDefo",
          texturePath: "textures/tga-cheek-soft-alpha.tga"
        })
      ];
      const materials = createThreeMmdMaterials(mmdMaterials);

      await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
        textureMap: { "textures/tga-cheek-soft-alpha.tga": new Blob([tgaBytes]) },
        geometry: createAlphaEvaluationGeometry(),
        geometryAwareAlpha: true
      });

      expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    }
  );
});
