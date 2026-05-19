import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachMmdSphereTexture,
  applyThreeMmdMaterialTextures,
  createThreeMmdMaterials,
  getDefaultToonGradientMap
} from "../../../src/three/index.js";
import type { MaterialInfo } from "../../../src/parser/model/modelTypes.js";
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
    expect(materials[0]?.gradientMap?.minFilter).toBe(THREE.NearestFilter);
    expect(materials[0]?.userData.mmdSphereTexture?.name).toBe("resolved/body-sphere.png");
    expect(materials[0]?.envMap).toBeUndefined();
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

  it("treats PNG diffuse textures as alpha blending without scanning pixels", async () => {
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
    const mmdMaterials = [createMaterialInfo({ texturePath: "textures/skin.png" })];
    const materials = createThreeMmdMaterials(mmdMaterials);

    await applyThreeMmdMaterialTextures(materials, mmdMaterials, {
      textureMap: { "textures/skin.png": "resolved/skin.png" },
      textureLoader,
      geometry: createAlphaEvaluationGeometry(),
      geometryAwareAlpha: true
    });

    expect(geometryAlphaSpy).not.toHaveBeenCalled();
    expect(textureAlphaSpy).not.toHaveBeenCalled();
    expect(materials[0]?.transparent).toBe(true);
    expect(materials[0]?.userData.mmdMaterial.transparencyMode).toBe("alphaBlend");
    expect(materials[0]?.userData.mmdMaterial.textureTransparencyMode).toBe("alphaBlend");
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

  it("uses view-space matcap UVs for sphere texture sampling", () => {
    const material = new THREE.MeshToonMaterial();
    const texture = new THREE.Texture();

    attachMmdSphereTexture(material, "add", texture);
    const shader = {
      uniforms: {},
      vertexShader: "",
      fragmentShader: ["#include <map_pars_fragment>", "#include <opaque_fragment>"].join("\n")
    };
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain("vec3 mmdSphereViewDir = normalize( vViewPosition );");
    expect(shader.fragmentShader).toContain(
      "vec2 mmdSphereUv = vec2( dot( mmdSphereX, normal ), dot( mmdSphereY, normal ) ) * 0.495 + 0.5;"
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
});
