import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyThreeMmdMaterialTextures,
  createThreeMmdMaterials
} from "../../src/three/index.js";
import type { MaterialInfo } from "../../src/parser/model/modelTypes.js";
import type { ThreeMmdTextureLoader } from "../../src/three/index.js";

function createMaterialInfo(overrides: Partial<MaterialInfo> = {}): MaterialInfo {
  return {
    name: "mat",
    englishName: "mat",
    texturePath: "",
    sphereTexturePath: "",
    sphereMode: "none",
    toonTexturePath: "",
    sharedToonIndex: undefined,
    diffuse: [0.5, 0.6, 0.7, 1],
    specular: [0.1, 0.2, 0.3],
    specularPower: 4,
    ambient: [0.2, 0.2, 0.2],
    edgeColor: [0, 0, 0, 1],
    edgeSize: 1,
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

function createTextureLoaderMock(): ThreeMmdTextureLoader {
  return {
    load(url, onLoad) {
      const texture = new THREE.Texture();
      texture.name = url;
      onLoad?.(texture);
      return texture;
    }
  };
}

describe("Three.js MMD materials", () => {
  it("loads diffuse and model-local toon textures while reporting unsupported sphere maps", async () => {
    const mmdMaterials = [
      createMaterialInfo({
        texturePath: "textures/body.png",
        toonTexturePath: "toon/local.bmp",
        sphereTexturePath: "sphere/body.spa",
        sphereMode: "subTexture"
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: {
        "textures/body.png": "resolved/body.png",
        "toon/local.bmp": "resolved/local-toon.png",
        "sphere/body.spa": "resolved/body-sphere.png"
      },
      textureLoader: createTextureLoaderMock()
    });

    expect(diagnostics).toEqual([
      {
        level: "warning",
        code: "SPHERE_MAP_NOT_SUPPORTED",
        materialIndex: 0,
        textureKind: "sphere",
        path: "sphere/body.spa",
        sphereMode: "subTexture"
      }
    ]);
    expect(materials[0]?.map?.name).toBe("resolved/body.png");
    expect(materials[0]?.gradientMap?.name).toBe("resolved/local-toon.png");
    expect(materials[0]?.gradientMap?.minFilter).toBe(THREE.NearestFilter);
    expect(materials[0]?.envMap).toBeUndefined();
  });

  it("loads built-in shared toon references through the texture map", async () => {
    const mmdMaterials = [createMaterialInfo({ sharedToonIndex: 0 })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: {
        "toon01.bmp": "resolved/builtin-toon01.png"
      },
      textureLoader: createTextureLoaderMock()
    });

    expect(diagnostics).toEqual([]);
    expect(materials[0]?.gradientMap?.name).toBe("resolved/builtin-toon01.png");
  });

  it("records texture diagnostics instead of throwing when texture resolution fails", async () => {
    const mmdMaterials = [
      createMaterialInfo({
        texturePath: "missing/body.png",
        sharedToonIndex: 1,
        sphereTexturePath: "missing/body.sph"
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureLoader: createTextureLoaderMock()
    });

    expect(materials[0]?.map).toBeNull();
    expect(materials[0]?.gradientMap).toBeNull();
    expect(materials[0]?.envMap).toBeUndefined();
    expect(diagnostics).toEqual([
      {
        level: "warning",
        code: "TEXTURE_RESOLVE_FAILED",
        materialIndex: 0,
        textureKind: "diffuse",
        path: "missing/body.png"
      },
      {
        level: "warning",
        code: "TEXTURE_RESOLVE_FAILED",
        materialIndex: 0,
        textureKind: "toon",
        path: "toon02.bmp"
      },
      {
        level: "warning",
        code: "SPHERE_MAP_NOT_SUPPORTED",
        materialIndex: 0,
        textureKind: "sphere",
        path: "missing/body.sph",
        sphereMode: "none"
      }
    ]);
  });
});
