import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { MaterialInfo } from "../../../src/parser/model/modelTypes.js";
import {
  applyThreeMmdMaterialTextures,
  createThreeMmdMaterials
} from "../../../src/three/index.js";

function createMaterialInfo(texturePath: string): MaterialInfo {
  return {
    name: "neutral_material",
    englishName: "NeutralMaterial",
    texturePath,
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
    faceCount: 1
  };
}

function createAlphaEvaluationGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setIndex([0, 1, 2]);
  geometry.addGroup(0, 3, 0);
  return geometry;
}

function createSparseAlphaTga(visibleAlpha: number): Uint8Array {
  const width = 32;
  const height = 32;
  const header = new Uint8Array(18);
  header[2] = 2;
  header[12] = width;
  header[14] = height;
  header[16] = 32;
  header[17] = 0x28;

  const bytes = new Uint8Array(header.length + width * height * 4);
  bytes.set(header);
  // Sixteen of 1,024 pixels are visible: below the broad 25% blend rule but
  // above the 0.5% occupancy floor used by the soft-alpha dominance rule.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = header.length + (y * width + x) * 4;
      bytes[target] = 96;
      bytes[target + 1] = 128;
      bytes[target + 2] = 160;
      bytes[target + 3] = x % 8 === 2 && y % 8 === 2 ? visibleAlpha : 0;
    }
  }
  return bytes;
}

async function classifyTga(visibleAlpha: number) {
  const texturePath = "textures/transparency-sample.tga";
  const mmdMaterials = [createMaterialInfo(texturePath)];
  const materials = createThreeMmdMaterials(mmdMaterials);

  await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
    textureMap: { [texturePath]: new Blob([createSparseAlphaTga(visibleAlpha)]) },
    geometry: createAlphaEvaluationGeometry(),
    geometryAwareAlpha: true
  });

  return materials[0]?.userData.mmdMaterial;
}

describe("TGA transparency classification", () => {
  it("classifies sparse binary alpha as alphaTest", async () => {
    const metadata = await classifyTga(255);

    expect(metadata.textureTransparencyMode).toBe("alphaTest");
    expect(metadata.transparencyMode).toBe("alphaTest");
  });

  it("classifies sparse soft alpha as alphaBlend without material-name hints", async () => {
    const metadata = await classifyTga(128);

    expect(metadata.textureTransparencyMode).toBe("alphaBlend");
    expect(metadata.transparencyMode).toBe("alphaBlend");
  });
});
