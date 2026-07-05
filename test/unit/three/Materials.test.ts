import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachMmdMaterialFactors,
  attachMmdSphereTexture,
  applyThreeMmdMaterialTextures,
  createThreeMmdMaterials,
  getDefaultToonGradientMap,
  syncMmdSpecularDirection
} from "../../../src/three/index.js";
import type { MaterialInfo, MorphData } from "../../../src/parser/model/modelTypes.js";
import type { ThreeMmdTextureLoader } from "../../../src/three/index.js";
import * as Textures from "../../../src/three/textures.js";

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

function createTransparentDataTexture(alphaMode: "opaque" | "alphaTest" | "alphaBlend"): THREE.DataTexture {
  const data = new Uint8Array([
    255, 255, 255, 0,
    255, 255, 255, 0,
    255, 255, 255, 0,
    255, 255, 255, 0
  ]);
  const texture = new THREE.DataTexture(data, 2, 2);
  texture.userData.mmdTextureAlphaMode = alphaMode;
  return texture;
}

function createReadableAlphaDataTexture(): THREE.DataTexture {
  const size = 4;
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = 255;
    data[index * 4 + 1] = 255;
    data[index * 4 + 2] = 255;
    data[index * 4 + 3] = 100;
  }
  data[3] = 0;
  return new THREE.DataTexture(data, size, size);
}

function createAlphaEvaluationGeometry(materialIndex = 0): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, 0.25], 2));
  geometry.setIndex([0, 1, 2]);
  geometry.addGroup(0, 3, materialIndex);
  return geometry;
}

function createAlphaMaterialMorph(materialIndex = 0): MorphData[] {
  return [
    {
      name: "hide material",
      englishName: "hide_material",
      type: "material",
      vertexOffsets: [],
      groupOffsets: [],
      boneOffsets: [],
      uvOffsets: [],
      additionalUvOffsets: [],
      materialOffsets: [
        {
          materialIndex,
          operation: "add",
          diffuse: [0, 0, 0, -1],
          specular: [0, 0, 0],
          specularPower: 0,
          ambient: [0, 0, 0],
          edgeColor: [0, 0, 0, -1],
          edgeSize: 0,
          textureFactor: [0, 0, 0, 0],
          sphereTextureFactor: [0, 0, 0, 0],
          toonTextureFactor: [0, 0, 0, 0]
        }
      ],
      flipOffsets: [],
      impulseOffsets: []
    }
  ];
}

describe("Three.js MMD materials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads diffuse, toon, and sphere textures for MMD material shading", async () => {
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

    expect(diagnostics).toEqual([]);
    expect(materials[0]?.map?.name).toBe("resolved/body.png");
    expect(materials[0]?.gradientMap?.name).toBe("resolved/local-toon.png");
    expect(materials[0]?.gradientMap?.minFilter).toBe(THREE.LinearFilter);
    expect(materials[0]?.gradientMap?.magFilter).toBe(THREE.LinearFilter);
    expect(materials[0]?.gradientMap?.generateMipmaps).toBe(false);
    expect(materials[0]?.gradientMap?.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(materials[0]?.gradientMap?.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(materials[0]?.map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(materials[0]?.map?.wrapT).toBe(THREE.RepeatWrapping);
    expect(materials[0]?.userData.mmdSphereTexture?.name).toBe("resolved/body-sphere.png");
    expect(materials[0]?.envMap).toBeUndefined();
  });

  it("marks internally loaded textures as loader-owned for owned disposal", async () => {
    const tgaBytes = new Uint8Array([
      0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 0x20,
      255, 255, 255, 255
    ]);
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.tga" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.tga": new Blob([tgaBytes]) }
    });

    expect(materials[0]?.map?.userData.mmdTextureOwnership).toBe("loader");
  });

  it("deduplicates Blob-backed TGA decodes while returning separate texture instances", async () => {
    const tgaBytes = new Uint8Array([
      0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 0x20,
      255, 255, 255, 255
    ]);
    let readCount = 0;
    class CountingBlob extends Blob {
      override async arrayBuffer(): Promise<ArrayBuffer> {
        readCount += 1;
        return super.arrayBuffer();
      }
    }
    const blob = new CountingBlob([tgaBytes]);
    const mmdMaterials = [
      createMaterialInfo({ texturePath: "textures/body.tga" }),
      createMaterialInfo({ texturePath: "textures/body.tga" })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.tga": blob }
    });

    expect(readCount).toBe(1);
    expect(materials[0]?.map).not.toBe(materials[1]?.map);
    expect((materials[0]?.map as THREE.DataTexture | undefined)?.image.data).toBe(
      (materials[1]?.map as THREE.DataTexture | undefined)?.image.data
    );
    expect(materials[0]?.map?.version).toBeGreaterThan(0);
    expect(materials[1]?.map?.version).toBeGreaterThan(0);
  });

  it("shares material textures with the same resolved path within a loader cache", async () => {
    const mmdMaterials = [
      createMaterialInfo({ texturePath: "textures/body.png" }),
      createMaterialInfo({ texturePath: "textures/body.png" })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const texture = new THREE.Texture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      }
    };
    const loadSpy = vi.spyOn(textureLoader, "load");

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.png": "resolved/body.png" },
      textureLoader,
      textureCache: new Map()
    });

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(materials[0]?.map).toBe(texture);
    expect(materials[1]?.map).toBe(texture);
  });

  it("keeps distinct Blob textures separate when resolved from the same path", async () => {
    const textureCache = new Map<string, Promise<THREE.Texture | undefined>>();
    const loadedUrls: string[] = [];
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        loadedUrls.push(url);
        const texture = new THREE.Texture();
        texture.name = url;
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      }
    };
    const loadSpy = vi.spyOn(textureLoader, "load");
    const firstMaterials = createThreeMmdMaterials([
      createMaterialInfo({ texturePath: "textures/body.png" })
    ]);
    const secondMaterials = createThreeMmdMaterials([
      createMaterialInfo({ texturePath: "textures/body.png" })
    ]);

    await applyThreeMmdMaterialTextures(
      firstMaterials,
      [createMaterialInfo({ texturePath: "textures/body.png" })],
      {
        textureMap: { "textures/body.png": new Blob([new Uint8Array([1, 2, 3])]) },
        textureLoader,
        textureCache
      }
    );
    await applyThreeMmdMaterialTextures(
      secondMaterials,
      [createMaterialInfo({ texturePath: "textures/body.png" })],
      {
        textureMap: { "textures/body.png": new Blob([new Uint8Array([4, 5, 6])]) },
        textureLoader,
        textureCache
      }
    );

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(loadedUrls[0]).not.toBe(loadedUrls[1]);
    expect(firstMaterials[0]?.map).not.toBe(secondMaterials[0]?.map);
  });

  it("evicts failed texture loads from the shared cache so retries can succeed", async () => {
    const textureCache = new Map<string, Promise<THREE.Texture | undefined>>();
    let attempt = 0;
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad, _onProgress, onError) {
        attempt += 1;
        const texture = new THREE.Texture();
        texture.name = url;
        if (attempt === 1) {
          queueMicrotask(() => onError?.(new Error("temporary failure")));
        } else {
          queueMicrotask(() => onLoad?.(texture));
        }
        return texture;
      }
    };
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.png" })];
    const firstMaterials = createThreeMmdMaterials(mmdMaterials);
    const secondMaterials = createThreeMmdMaterials(mmdMaterials);

    const firstDiagnostics = await applyThreeMmdMaterialTextures(firstMaterials, mmdMaterials, {
      textureMap: { "textures/body.png": "resolved/body.png" },
      textureLoader,
      textureCache
    });
    const secondDiagnostics = await applyThreeMmdMaterialTextures(secondMaterials, mmdMaterials, {
      textureMap: { "textures/body.png": "resolved/body.png" },
      textureLoader,
      textureCache
    });

    expect(attempt).toBe(2);
    expect(firstMaterials[0]?.map).toBeNull();
    expect(secondMaterials[0]?.map?.name).toBe("resolved/body.png");
    expect(firstDiagnostics).toEqual([
      {
        level: "warning",
        code: "TEXTURE_RESOLVE_FAILED",
        materialIndex: 0,
        textureKind: "diffuse",
        path: "textures/body.png"
      }
    ]);
    expect(secondDiagnostics).toEqual([]);
  });

  it("revokes generated texture object URLs after successful loads and errors", async () => {
    const loadedUrls: string[] = [];
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
    const successLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        loadedUrls.push(url);
        const texture = new THREE.Texture();
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      }
    };
    const errorLoader: ThreeMmdTextureLoader = {
      load(url, _onLoad, _onProgress, onError) {
        loadedUrls.push(url);
        queueMicrotask(() => onError?.(new Error("failed")));
        return new THREE.Texture();
      }
    };

    await applyThreeMmdMaterialTextures(
      createThreeMmdMaterials([createMaterialInfo({ texturePath: "textures/success.png" })]),
      [createMaterialInfo({ texturePath: "textures/success.png" })],
      {
        textureMap: { "textures/success.png": new Blob([new Uint8Array([1, 2, 3])]) },
        textureLoader: successLoader,
        textureCache: new Map()
      }
    );
    await applyThreeMmdMaterialTextures(
      createThreeMmdMaterials([createMaterialInfo({ texturePath: "textures/error.png" })]),
      [createMaterialInfo({ texturePath: "textures/error.png" })],
      {
        textureMap: { "textures/error.png": new Blob([new Uint8Array([4, 5, 6])]) },
        textureLoader: errorLoader,
        textureCache: new Map()
      }
    );

    expect(revokeSpy).toHaveBeenCalledWith(loadedUrls[0]);
    expect(revokeSpy).toHaveBeenCalledWith(loadedUrls[1]);
  });

  it("loads shared toon references from bundled BMP assets", async () => {
    const mmdMaterials = [createMaterialInfo({ sharedToonIndex: 0 })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureLoader: createTextureLoaderMock()
    });

    expect(diagnostics).toEqual([]);
    expect(materials[0]?.gradientMap?.name).toMatch(/toon01\.bmp$/);
    expect(materials[0]?.gradientMap?.userData.mmdToonTexturePath).toBe("toon01.bmp");
    expect(materials[0]?.gradientMap?.userData.mmdToonTextureShared).toBe(true);
  });

  it("resolves face materials with no explicit toon to the default toon data texture", async () => {
    const mmdMaterials = [createMaterialInfo()];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureLoader: createTextureLoaderMock()
    });

    expect(diagnostics).toEqual([]);
    expect(materials[0]?.gradientMap).toBe(getDefaultToonGradientMap());
    expect(materials[0]?.gradientMap).toBeInstanceOf(THREE.DataTexture);
    expect(materials[0]?.gradientMap?.name).toBe("mmd-default-toon");
    expect(materials[0]?.gradientMap?.userData.mmdFallbackToonGradient).toBe(true);
  });

  it("does not run UV-rasterized texture alpha evaluation by default", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.jpg" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.jpg": "resolved/body.jpg" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(geometryAlphaSpy).not.toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("keeps non-PNG atlas alpha opaque unless PMX material data requests transparency", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.jpg" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.jpg": "resolved/body.jpg" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.alphaTest).toBe(0);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("opaque");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("keeps readable texture alpha opaque when geometry-aware evaluation is not enabled", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.jpg" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.jpg": "resolved/body.jpg" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("opaque");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("skips texture alpha scans when PMX material data is already opaque", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const textureAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaTexture");
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.jpg" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.jpg": "resolved/body.jpg" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(textureAlphaSpy).not.toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("runs texture alpha scans when PMX diffuse alpha requests transparency", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const textureAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaTexture");
    const mmdMaterials = [
      createMaterialInfo({ diffuse: [0.5, 0.6, 0.7, 0.5], texturePath: "textures/hair.jpg" })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/hair.jpg": "resolved/hair.jpg" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(textureAlphaSpy).toHaveBeenCalledTimes(1);
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaBlend");
  });

  it("uses geometry-aware alpha scans for PNG diffuse textures", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const textureAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaTexture");
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/skin.png" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/skin.png": "resolved/skin.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(geometryAlphaSpy).toHaveBeenCalledTimes(1);
    expect(textureAlphaSpy).not.toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaBlend");
  });

  it("does not run geometry-aware scans when PMX material data already makes the body transparent", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const textureAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaTexture");
    const mmdMaterials = [
      createMaterialInfo({ diffuse: [0.5, 0.6, 0.7, 0.5], texturePath: "textures/hair.png" })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/hair.png": "resolved/hair.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(geometryAlphaSpy).not.toHaveBeenCalled();
    expect(textureAlphaSpy).not.toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("does not fall back to full texture alpha scans when geometry-aware evaluation is inconclusive", async () => {
    const texture = new THREE.Texture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const textureAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaTexture");
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/atlas.png" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/atlas.png": "resolved/atlas.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(geometryAlphaSpy).toHaveBeenCalledTimes(1);
    expect(textureAlphaSpy).not.toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("preserves alpha blending when PMX diffuse alpha requests transparency", async () => {
    const texture = createTransparentDataTexture("opaque");
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const mmdMaterials = [
      createMaterialInfo({ diffuse: [0.5, 0.6, 0.7, 0.5], texturePath: "textures/hair.png" })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/hair.png": "resolved/hair.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.opacity).toBe(0.5);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
  });

  it("preserves alpha blending from evaluated PMX transparency metadata", async () => {
    const texture = createTransparentDataTexture("opaque");
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const mmdMaterials = [
      createMaterialInfo({ evaluatedTransparency: 0x10, texturePath: "textures/decal.png" })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/decal.png": "resolved/decal.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
  });

  it("does not force transparent sorting just because a material morph can change alpha", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/skin.png" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureLoader: createTextureLoaderMock(),
      geometry: createAlphaEvaluationGeometry(),
      morphs: createAlphaMaterialMorph()
    });

    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("opaque");
    expect(materials[0]?.userData.mmdMaterial.morphAlphaTransparent).toBe(true);
  });

  it("still runs geometry-aware texture alpha scans when a PNG material has an alpha morph", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/hair-shadow.png" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/hair-shadow.png": "resolved/hair-shadow.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true,
      morphs: createAlphaMaterialMorph()
    });

    expect(geometryAlphaSpy).toHaveBeenCalledTimes(1);
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    expect(materials[0]?.userData.mmdMaterial.morphAlphaTransparent).toBe(true);
  });

  it("scans regular TGA material alpha through the geometry-aware used-UV path", async () => {
    // Real MMD 9.32 blends a regular TGA hair material's texture alpha (golden:
    // mmd-tga-regular-hair-alpha-opaque). With geometry-aware evaluation the used-UV scan
    // is trusted to classify TGA materials too, so it runs and promotes the soft alpha.
    const texture = createReadableAlphaDataTexture();
    texture.userData.mmdTextureAlphaSource = "tga";
    texture.userData.mmdTextureAlphaMode = "alphaBlend";
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const mmdMaterials = [
      createMaterialInfo({
        texturePath: "textures/hair.tga",
        flags: {
          doubleSided: false,
          groundShadow: true,
          selfShadowMap: true,
          selfShadow: true,
          edge: true,
          vertexColor: false,
          pointDraw: false,
          lineDraw: false
        }
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/hair.tga": "resolved/hair.tga" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(geometryAlphaSpy).toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
  });

  it("does not promote regular TGA material alpha metadata without geometry-aware evaluation", async () => {
    const texture = createReadableAlphaDataTexture();
    texture.userData.mmdTextureAlphaSource = "tga";
    texture.userData.mmdTextureAlphaMode = "alphaBlend";
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const mmdMaterials = [
      createMaterialInfo({
        texturePath: "textures/body.tga",
        flags: {
          doubleSided: false,
          groundShadow: true,
          selfShadowMap: true,
          selfShadow: true,
          edge: true,
          vertexColor: false,
          pointDraw: false,
          lineDraw: false
        }
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.tga": "resolved/body.tga" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry()
    });

    expect(materials[0]?.transparent).toBe(false);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("opaque");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBeUndefined();
  });

  it("runs geometry-aware TGA alpha scans for hair shadow overlay materials", async () => {
    const texture = createReadableAlphaDataTexture();
    texture.userData.mmdTextureAlphaSource = "tga";
    texture.userData.mmdTextureAlphaMode = "alphaBlend";
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi
      .spyOn(Textures, "evaluateMmdTextureAlphaGeometry")
      .mockReturnValue("alphaTest");
    const mmdMaterials = [
      createMaterialInfo({
        name: "hairshadow",
        englishName: "hairshadow",
        texturePath: "textures/face.tga"
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/face.tga": "resolved/face.tga" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true,
      morphs: createAlphaMaterialMorph()
    });

    expect(geometryAlphaSpy).toHaveBeenCalledTimes(1);
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaBlend");
  });

  it("treats Japanese hair shadow overlay names as soft alpha blend materials", async () => {
    const texture = createReadableAlphaDataTexture();
    texture.userData.mmdTextureAlphaSource = "tga";
    texture.userData.mmdTextureAlphaMode = "alphaTest";
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const geometryAlphaSpy = vi
      .spyOn(Textures, "evaluateMmdTextureAlphaGeometry")
      .mockReturnValue("alphaTest");
    const mmdMaterials = [
      createMaterialInfo({
        name: "髪影",
        englishName: "",
        texturePath: "textures/face.tga"
      })
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/face.tga": "resolved/face.tga" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(geometryAlphaSpy).toHaveBeenCalledTimes(1);
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaBlend");
  });

  it("keeps geometry-aware texture alpha evaluation available as an opt-in", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/body.jpg" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/body.jpg": "resolved/body.jpg" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaBlend");
  });

  it("resolves default toon and all bundled shared toon BMPs to non-null gradient maps", async () => {
    const mmdMaterials = [
      createMaterialInfo(),
      ...Array.from({ length: 10 }, (_, index) => createMaterialInfo({ sharedToonIndex: index }))
    ];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureLoader: createTextureLoaderMock()
    });

    expect(diagnostics).toEqual([]);
    expect(materials[0]?.gradientMap).toBe(getDefaultToonGradientMap());
    expect(materials[0]?.gradientMap?.name).toBe("mmd-default-toon");
    for (let index = 1; index <= 10; index += 1) {
      const texturePath = `toon${String(index).padStart(2, "0")}.bmp`;
      expect(materials[index]?.gradientMap).not.toBeNull();
      expect(materials[index]?.gradientMap?.name).toMatch(new RegExp(`${texturePath}$`));
      expect(materials[index]?.gradientMap?.userData.mmdToonTexturePath).toBe(texturePath);
      expect(materials[index]?.gradientMap?.userData.mmdToonTextureShared).toBe(true);
    }
  });

  function createMmdShaderScaffold(): {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  } {
    return {
      uniforms: {},
      vertexShader: "",
      fragmentShader: [
        "#include <map_pars_fragment>",
        "#include <map_fragment>",
        "#include <lights_fragment_begin>",
        "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;",
        "#include <lights_fragment_end>",
        "#include <opaque_fragment>"
      ].join("\n")
    };
  }

  it("bakes the fixed MMD directional light color and direction into the material", () => {
    const material = new THREE.MeshToonMaterial();
    material.userData.mmdMaterial = { diffuse: [0.31, 0.56, 0.85, 1] };
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    const lightColor = shader.uniforms.mmdLightColor?.value as THREE.Color;
    expect(lightColor.r).toBeCloseTo(154 / 255, 5);
    expect(lightColor.g).toBeCloseTo(154 / 255, 5);
    expect(lightColor.b).toBeCloseTo(154 / 255, 5);
    const lightDirection = shader.uniforms.mmdLightDirection?.value as THREE.Vector3;
    expect(lightDirection.length()).toBeCloseTo(1, 5);
    const diffuseColor = shader.uniforms.mmdDiffuseColor?.value as THREE.Color;
    expect(diffuseColor.r).toBeCloseTo(0.31, 5);
    expect(diffuseColor.g).toBeCloseTo(0.56, 5);
    expect(diffuseColor.b).toBeCloseTo(0.85, 5);
  });

  it("uses the lit gamma-space base after regular toon and self-shadow toon grading", () => {
    const material = new THREE.MeshToonMaterial();
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain(
      "vec3 ywMmdBase = clamp( mmdDiffuseColor * mmdLightColor + mmdMaterialAmbient, 0.0, 1.0 );"
    );
    expect(shader.fragmentShader).toContain(
      "ywMmdToonLight = mix( ywMmdSelfShadowToon, vec3( 1.0 ), ywMmdToonVisibility );"
    );
    expect(shader.fragmentShader).toContain("vec3 ywMmdColor = ywMmdBase * ywMmdToonLight;");
    // The composite must be gamma-decoded back to linear so Three's sRGB output encode
    // reproduces the gamma-space MMD value.
    expect(shader.fragmentShader).toContain(
      "outgoingLight = ywMmdGammaToLinear( clamp( ywMmdColor, 0.0, 1.0 ) );"
    );
  });

  it("keeps the regular toon ramp and grades self-shadow with a fixed toon color", () => {
    const gradientMap = new THREE.Texture();
    gradientMap.userData.mmdFallbackToonGradient = true;
    const material = new THREE.MeshToonMaterial({ gradientMap });
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain(
      "float ywMmdLightVisibility = clamp( dot( ywMmdNormal, ywMmdLightDir ) * 3.0, 0.0, 1.0 );"
    );
    expect(shader.fragmentShader).toContain(
      "float ywMmdToonVisibility = min( ywMmdToonShadowFactor, ywMmdLightVisibility );"
    );
    expect(shader.fragmentShader).toContain(
      "vec3 ywMmdSelfShadowToon = texture2D( gradientMap, vec2( 0.5, 0.0 ) ).rgb;"
    );
    expect(shader.fragmentShader).toContain("vec3 ywMmdToon = texture2D( gradientMap, vec2( 0.5, ywMmdLn ) ).rgb;");
    expect(shader.fragmentShader).toContain("vec3 ywMmdToonLight = ywMmdToon;");
    expect(shader.fragmentShader).toContain(
      "ywMmdToonLight = mix( ywMmdSelfShadowToon, vec3( 1.0 ), ywMmdToonVisibility );"
    );
    expect(shader.fragmentShader).toContain("if ( ywMmdToonShadowFactor < 0.999 ) {");
    expect(shader.fragmentShader).toContain("vec3 ywMmdColor = ywMmdBase * ywMmdToonLight;");
    expect(shader.fragmentShader).not.toContain("ywMmdColor = mix( ywMmdSelfShadowColor, ywMmdColor");
    expect(shader.fragmentShader).not.toContain(
      "ywMmdColor = ywMmdBase * mix( ywMmdSelfShadowToon, vec3( 1.0 ), ywMmdToonVisibility );"
    );
    expect(shader.fragmentShader).not.toContain("ywMmdToonLight = min( ywMmdToonLight, ywMmdSelfShadowToonLight );");
    expect(shader.fragmentShader).toContain(
      "ywMmdColor += pow( max( 0.0, dot( ywMmdHalf, ywMmdNormal ) ), mmdSpecularPower ) * mmdSpecularColor * mmdLightColor * ywMmdToonVisibility;"
    );
  });

  it("gates the Blinn-Phong specular on a positive specular power", () => {
    const material = new THREE.MeshToonMaterial();
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain("if ( mmdSpecularPower > 0.0 ) {");
    expect(shader.fragmentShader).toContain(
      "ywMmdColor += pow( max( 0.0, dot( ywMmdHalf, ywMmdNormal ) ), mmdSpecularPower ) * mmdSpecularColor * mmdLightColor * ywMmdToonVisibility;"
    );
  });

  it("uses directional self-shadow as a toon visibility cap", () => {
    const material = new THREE.MeshToonMaterial();
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain("float ywMmdToonShadowFactor = 1.0;");
    expect(shader.fragmentShader).toContain(
      "float ywMmdToonVisibility = min( ywMmdToonShadowFactor, ywMmdLightVisibility );"
    );
    expect(shader.fragmentShader).toContain(
      "ywMmdToonShadowFactor = min( ywMmdToonShadowFactor, ( mmdSelfShadowReceive > 0.5 && directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]"
    );
    expect(shader.fragmentShader).not.toContain("#include <lights_fragment_begin>");
  });

  it("does not depend on the scene's reflected light contribution", () => {
    const material = new THREE.MeshStandardMaterial();
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    // The MMD block overwrites outgoingLight from scratch; it must not scale the host
    // scene's reflectedLight accumulators.
    expect(shader.fragmentShader).not.toContain("reflectedLight.directDiffuse *=");
    expect(shader.fragmentShader).toContain("vec3 ywMmdBase = clamp( mmdDiffuseColor * mmdLightColor + mmdMaterialAmbient, 0.0, 1.0 );");
  });

  it("passes PMX self-shadow receiver flags into the material shader", async () => {
    const [material] = createThreeMmdMaterials([
      createMaterialInfo({ flags: { ...createMaterialInfo().flags, selfShadow: false } })
    ]);
    if (!material) {
      throw new Error("missing material");
    }
    attachMmdMaterialFactors(material);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.uniforms.mmdSelfShadowReceive).toEqual({ value: 0 });
    expect(shader.fragmentShader).toContain("uniform float mmdSelfShadowReceive;");
  });

  it("syncs MMD light direction from directional light target instead of raw position", () => {
    const material = new THREE.MeshToonMaterial();
    const light = new THREE.DirectionalLight(new THREE.Color(0.4, 0.5, 0.6), 1);
    light.position.set(0, 10, 0);
    light.target.position.set(0, 2, 0);

    syncMmdSpecularDirection(material, light);

    expect(material.userData.mmdLightUniformState.direction).toEqual([0, 1, 0]);
    expect(material.userData.mmdLightUniformState.directColor).toEqual([0.4, 0.5, 0.6]);

    light.target.position.set(0, 20, 0);
    syncMmdSpecularDirection(material, light);

    expect(material.userData.mmdLightUniformState.direction).toEqual([0, -1, 0]);
    expect(material.userData.mmdLightUniformState.directColor).toEqual([0.4, 0.5, 0.6]);
  });

  it("applies synced MMD light color to material shader uniforms", () => {
    const material = new THREE.MeshToonMaterial();
    const light = new THREE.DirectionalLight(new THREE.Color(0.4, 0.5, 0.6), 1);
    light.position.set(0, 10, 0);
    attachMmdMaterialFactors(material);
    syncMmdSpecularDirection(material, light);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.uniforms.mmdLightDirection?.value).toEqual(new THREE.Vector3(0, 1, 0));
    expect(shader.uniforms.mmdLightColor?.value).toEqual(new THREE.Color(0.4, 0.5, 0.6));
    expect(shader.uniforms.mmdToonCoordinateOffset?.value).toBe(0.5);
  });

  it("uses view-space matcap UVs for sphere texture sampling", () => {
    const material = new THREE.MeshToonMaterial();
    attachMmdMaterialFactors(material);
    const texture = new THREE.Texture();
    attachMmdSphereTexture(material, "add", texture);

    const shader = createMmdShaderScaffold();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain("#define USE_MMD_SPHERE");
    expect(shader.fragmentShader).toContain(
      "vec2 ywMmdSphereUv = vec2( ywMmdNormal.x * 0.5 + 0.5, 1.0 - ( ywMmdNormal.y * 0.5 + 0.5 ) );"
    );
    expect(shader.fragmentShader).not.toContain("vec2( normal.x, -normal.y )");
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
    expect(materials[0]?.gradientMap?.name).toMatch(/toon02\.bmp$/);
    expect(materials[0]?.envMap).toBeUndefined();
    expect(diagnostics).toEqual([
      {
        level: "warning",
        code: "TEXTURE_RESOLVE_FAILED",
        materialIndex: 0,
        textureKind: "diffuse",
        path: "missing/body.png"
      }
    ]);
  });

  it("reports unsupported DDS diffuse textures when no DDS loader is supplied", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "skin.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "skin.dds": "resolved/skin.dds" },
      textureLoader: createTextureLoaderMock()
    });

    expect(materials[0]?.map).toBeNull();
    expect(diagnostics).toContainEqual({
      level: "warning",
      code: "TEXTURE_FORMAT_UNSUPPORTED",
      materialIndex: 0,
      textureKind: "diffuse",
      path: "skin.dds"
    });
  });

  it("allows texture maps to replace DDS references with supported texture files", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "skin.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const textureLoader = createTextureLoaderMock();
    const loadSpy = vi.spyOn(textureLoader, "load");

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "skin.dds": "resolved/skin.png" },
      textureLoader
    });

    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_FORMAT_UNSUPPORTED" })
    );
    expect(loadSpy).toHaveBeenCalledWith(
      "resolved/skin.png",
      expect.any(Function),
      undefined,
      expect.any(Function)
    );
    expect(materials[0]?.map?.name).toBe("resolved/skin.png");
  });

  it("allows texture maps to replace DDS references with typed PNG Blob textures", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "skin.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const textureLoader = createTextureLoaderMock();
    const ddsLoader = createTextureLoaderMock();
    const textureLoadSpy = vi.spyOn(textureLoader, "load");
    const ddsLoadSpy = vi.spyOn(ddsLoader, "load");

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: {
        "skin.dds": new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
      },
      textureLoader,
      ddsLoader
    });

    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_FORMAT_UNSUPPORTED" })
    );
    expect(textureLoadSpy).toHaveBeenCalledOnce();
    expect(ddsLoadSpy).not.toHaveBeenCalled();
    expect(materials[0]?.map?.name).toMatch(/^blob:/);
  });

  it("loads DDS diffuse textures through the supplied DDS loader", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "skin.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const ddsLoader = createTextureLoaderMock();
    const ddsLoadSpy = vi.spyOn(ddsLoader, "load");

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "skin.dds": "resolved/skin.dds" },
      textureLoader: createTextureLoaderMock(),
      ddsLoader
    });

    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_FORMAT_UNSUPPORTED" })
    );
    expect(ddsLoadSpy).toHaveBeenCalledWith(
      "resolved/skin.dds",
      expect.any(Function),
      undefined,
      expect.any(Function)
    );
    expect(materials[0]?.map?.name).toBe("resolved/skin.dds");
  });

  it("loads local DDS File textures through the supplied DDS loader even without a MIME type", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "skin.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const textureLoader = createTextureLoaderMock();
    const ddsLoader = createTextureLoaderMock();
    const textureLoadSpy = vi.spyOn(textureLoader, "load");
    const ddsLoadSpy = vi.spyOn(ddsLoader, "load");

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "skin.dds": new File([new Uint8Array([1, 2, 3])], "skin.dds") },
      textureLoader,
      ddsLoader
    });

    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_FORMAT_UNSUPPORTED" })
    );
    expect(textureLoadSpy).not.toHaveBeenCalled();
    expect(ddsLoadSpy).toHaveBeenCalledOnce();
    expect(materials[0]?.map?.name).toMatch(/^blob:/);
  });

  it("uses the DDS loader for extensionless resolver URLs when the original texture is DDS", async () => {
    const mmdMaterials = [createMaterialInfo({ texturePath: "skin.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const textureLoader = createTextureLoaderMock();
    const ddsLoader = createTextureLoaderMock();
    const textureLoadSpy = vi.spyOn(textureLoader, "load");
    const ddsLoadSpy = vi.spyOn(ddsLoader, "load");

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureResolver: {
        resolve: async () => "https://cdn.example.com/signed-texture"
      },
      textureLoader,
      ddsLoader
    });

    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_FORMAT_UNSUPPORTED" })
    );
    expect(textureLoadSpy).not.toHaveBeenCalled();
    expect(ddsLoadSpy).toHaveBeenCalledWith(
      "https://cdn.example.com/signed-texture",
      expect.any(Function),
      undefined,
      expect.any(Function)
    );
    expect(materials[0]?.map?.name).toBe("https://cdn.example.com/signed-texture");
  });

  it("loads explicit DDS toon textures through the supplied DDS loader", async () => {
    const mmdMaterials = [createMaterialInfo({ toonTexturePath: "toon.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);
    const ddsLoader = createTextureLoaderMock();
    const ddsLoadSpy = vi.spyOn(ddsLoader, "load");

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "toon.dds": "resolved/toon.dds" },
      textureLoader: createTextureLoaderMock(),
      ddsLoader
    });

    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_FORMAT_UNSUPPORTED" })
    );
    expect(ddsLoadSpy).toHaveBeenCalledWith(
      "resolved/toon.dds",
      expect.any(Function),
      undefined,
      expect.any(Function)
    );
    expect(materials[0]?.gradientMap?.name).toBe("resolved/toon.dds");
  });

  it("reports unsupported DDS toon textures when no DDS loader is supplied", async () => {
    const mmdMaterials = [createMaterialInfo({ toonTexturePath: "toon.dds" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    const diagnostics = await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "toon.dds": "resolved/toon.dds" },
      textureLoader: createTextureLoaderMock()
    });

    expect(materials[0]?.gradientMap).toBeDefined();
    expect(diagnostics).toContainEqual({
      level: "warning",
      code: "TEXTURE_FORMAT_UNSUPPORTED",
      materialIndex: 0,
      textureKind: "toon",
      path: "toon.dds"
    });
    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "TEXTURE_RESOLVE_FAILED" })
    );
  });
});
