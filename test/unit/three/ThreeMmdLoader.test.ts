import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FallbackCore, ThreeMmdLoader } from "../../../src/index.js";
import type {
  MmdAnimation,
  MmdCore,
  MmdModel,
  ModelSource,
  ThreeMmdLoaderOptions,
  ThreeMmdTextureLoader
} from "../../../src/index.js";
import * as Textures from "../../../src/three/textures.js";

describe("ThreeMmdLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves construction options as a public facade shell", () => {
    const options: ThreeMmdLoaderOptions = {
      runtime: { frameRate: 60 },
      textureMap: {
        "toon01.bmp": "toon/toon01.png",
        "toon02.bmp": new URL("https://example.test/toon02.png")
      },
      textureResolver: {
        async resolve(path) {
          return path;
        }
      }
    };

    const loader = new ThreeMmdLoader(options);

    expect(loader.options).toBe(options);
  });

  it("rejects invalid option shapes before load implementation exists", () => {
    expect(() => new ThreeMmdLoader(null as unknown as ThreeMmdLoaderOptions)).toThrow(
      "ThreeMmdLoader options must be an object"
    );
    expect(
      () => new ThreeMmdLoader({ textureResolver: {} as ThreeMmdLoaderOptions["textureResolver"] })
    ).toThrow("ThreeMmdLoader textureResolver.resolve must be a function");
    expect(() => new ThreeMmdLoader({ textureMap: [] as unknown as ThreeMmdLoaderOptions["textureMap"] })).toThrow(
      "ThreeMmdLoader textureMap must be an object"
    );
    expect(() => new ThreeMmdLoader({ textureMap: { bad: 1 as unknown as string } })).toThrow(
      'ThreeMmdLoader textureMap entry "bad" must be a string, URL, or Blob'
    );
    expect(() => new ThreeMmdLoader({ runtime: 30 as unknown as ThreeMmdLoaderOptions["runtime"] })).toThrow(
      "ThreeMmdLoader runtime options must be an object"
    );
    expect(
      () =>
        new ThreeMmdLoader({
          onCoreFallback: "warn" as unknown as ThreeMmdLoaderOptions["onCoreFallback"]
        })
    ).toThrow("ThreeMmdLoader onCoreFallback must be a function");
  });

  it("loads a PMX model into a minimal Three.js skinned mesh", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.name).toBe("TestModel");
    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.object).toBeInstanceOf(THREE.Group);
    expect(model.object.children).toEqual([
      model.mesh,
      ...model.renderOrderMeshes,
      ...model.outlineMeshes
    ]);
    expect(model.mesh.skeleton.bones).toHaveLength(1);
    expect(model.mesh.geometry.getAttribute("position").count).toBe(14);
    expect(model.mesh.geometry.index?.count).toBe(36);
    expect(model.source).toEqual({ kind: "bytes", byteLength: source.byteLength });
    expect(model.textureDiagnostics).toEqual([]);
  });

  it("uses the configured core for model loading", async () => {
    const core = new FallbackCore();
    const loadModel = vi.spyOn(core, "loadModel");
    const loader = new ThreeMmdLoader({ core });
    const source: ModelSource = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));

    await loader.loadModel(source);

    expect(loadModel).toHaveBeenCalledOnce();
  });

  it("reports implicit core model fallback without exposing raw console output", async () => {
    const error = new Error("wasm parser unavailable");
    const onCoreFallback = vi.fn();
    const loader = new ThreeMmdLoader({ onCoreFallback });
    const core: MmdCore = {
      ...createIkFlagCore(),
      loadModel: () => {
        throw error;
      }
    };
    (loader as unknown as { corePromise: Promise<MmdCore> }).corePromise = Promise.resolve(core);
    const source: ModelSource = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.name).toBe("TestModel");
    expect(onCoreFallback).toHaveBeenCalledWith({ operation: "loadModel", error });
  });

  it("loads a PMX model from a string URL source", async () => {
    const bytes = createMinimalPmxModelBytes({ materialCount: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes))
    );
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel("https://example.test/models/minimal.pmx");

    expect(fetch).toHaveBeenCalledWith("https://example.test/models/minimal.pmx");
    expect(model.source).toEqual({
      kind: "url",
      byteLength: bytes.byteLength,
      name: "minimal.pmx"
    });
    expect(model.mesh.isSkinnedMesh).toBe(true);
  });

  it("defaults to MMD-compatible outline and render-order proxies without added-event side effects", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = createMinimalPmxModelBytes({
      materialCount: 1,
      triangle: true,
      edge: true
    });

    const model = await loader.loadModel(source);
    const scene = new THREE.Scene();

    expect(model.mesh.children.some((child) => child.userData.mmdOutlineProxy)).toBe(false);
    scene.add(model.object);
    expect(model.mesh.children.some((child) => child.userData.mmdOutlineProxy)).toBe(false);
    const outlineMeshes = model.outlineMeshes;
    expect(model.outlineMeshes).toBe(outlineMeshes);
    expect(outlineMeshes).toHaveLength(1);
    expect(outlineMeshes.every((mesh) => !!mesh.userData.mmdOutlineProxy)).toBe(true);
    expect(outlineMeshes[0]?.userData.mmdOutlineProxy.sourceMaterialIndex).toBe(0);
    const renderOrderMeshes = model.renderOrderMeshes;
    expect(model.renderOrderMeshes).toBe(renderOrderMeshes);
    expect(renderOrderMeshes).toHaveLength(1);
    expect(renderOrderMeshes[0]?.userData.mmdMaterialRenderProxy.materialIndex).toBe(0);
    expect(model.mesh.geometry.drawRange).toEqual({ start: 0, count: 0 });
    expect(model.object.children).toEqual([model.mesh, ...renderOrderMeshes, ...outlineMeshes]);
  });

  it("allows loadModel callers to disable generated render-order proxy meshes explicitly", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        edge: true
      }),
      { renderOrderProxies: false }
    );

    expect(model.renderOrderMeshes).toEqual([]);
    expect(model.mesh.geometry.drawRange.count).toBe(Number.POSITIVE_INFINITY);
    expect(model.object.children).toEqual([model.mesh, ...model.outlineMeshes]);
  });

  it("allows loadModel callers to disable generated outline meshes explicitly", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        edge: true
      }),
      { outlines: false }
    );

    expect(model.outlineMeshes).toEqual([]);
    expect(model.renderOrderMeshes).toEqual([]);
    expect(model.object.children).toEqual([model.mesh]);
  });

  it("splits sparse large morph geometry into local body meshes without dense global morph targets", async () => {
    const loader = new ThreeMmdLoader({ core: createSparseMorphStressCore() });

    const model = await loader.loadModel(new Uint8Array([1]), {
      outlines: false,
      renderOrderProxies: false
    });

    const bodyMeshes = model.mesh.userData.mmdMorphSplitBodyMeshes as THREE.SkinnedMesh[];
    expect(bodyMeshes).toHaveLength(2);
    expect(model.mesh.geometry.morphAttributes.position).toBeUndefined();
    expect(model.mesh.geometry.drawRange).toEqual({ start: 0, count: 0 });
    expect(model.object.children).toEqual([model.mesh, ...bodyMeshes]);
    expect(bodyMeshes.map((mesh) => mesh.morphTargetInfluences?.length)).toEqual([1, 1]);
    expect(bodyMeshes.map((mesh) => mesh.geometry.morphAttributes.position?.length ?? 0)).toEqual([
      1,
      1
    ]);
    expect(bodyMeshes.map((mesh) => mesh.renderOrder)).toEqual([0, 2]);
    expect(bodyMeshes.map((mesh) => mesh.castShadow)).toEqual([true, false]);
    expect(bodyMeshes.map((mesh) => mesh.receiveShadow)).toEqual([false, true]);
    expect(bodyMeshes.map((mesh) => Array.from(mesh.userData.mmdMorphSplitBody.morphTargetIndices))).toEqual([
      [0],
      [1]
    ]);

    const sourceInfluences = model.mesh.morphTargetInfluences;
    if (!sourceInfluences) {
      throw new Error("Expected source morph influences");
    }
    sourceInfluences[0] = 0.25;
    sourceInfluences[1] = 0.75;
    bodyMeshes.forEach((mesh) => {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) {
        throw new Error("Expected split mesh material");
      }
      mesh.onBeforeRender(
        {} as THREE.WebGLRenderer,
        {} as THREE.Scene,
        {} as THREE.Camera,
        mesh.geometry,
        material,
        null
      );
    });
    expect(bodyMeshes.map((mesh) => mesh.morphTargetInfluences?.[0])).toEqual([0.25, 0.75]);
  });

  it("applies load-time frustum culling to the mesh and generated proxy meshes", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        edge: true
      }),
      { frustumCulled: false }
    );

    expect(model.mesh.frustumCulled).toBe(false);
    expect(model.outlineMeshes.every((mesh) => mesh.frustumCulled === false)).toBe(true);
    expect(model.renderOrderMeshes.every((mesh) => mesh.frustumCulled === false)).toBe(true);
  });

  it("applies root object transforms to the base mesh and generated proxy meshes", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        edge: true
      })
    );

    model.object.position.set(1, 2, 3);
    model.object.rotation.set(0, Math.PI / 2, 0);
    model.object.scale.set(2, 2, 2);
    model.object.updateMatrixWorld(true);

    const basePosition = new THREE.Vector3();
    model.mesh.getWorldPosition(basePosition);
    expect(basePosition.toArray()).toEqual([1, 2, 3]);

    for (const proxy of [...model.renderOrderMeshes, ...model.outlineMeshes]) {
      const proxyPosition = new THREE.Vector3();
      proxy.getWorldPosition(proxyPosition);
      expect(proxy.parent).toBe(model.object);
      expect(proxyPosition.toArray()).toEqual(basePosition.toArray());
      expect(proxy.matrixWorld.elements).toEqual(model.mesh.matrixWorld.elements);
    }
  });

  it("keeps imported PMX vertex normals on the loaded Three.js geometry", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        normal: [0.25, 0.5, -0.82915619758885]
      })
    );

    const normal = model.mesh.geometry.getAttribute("normal");
    expect(Array.from(normal.array)).toEqual([0.25, 0.5, 0.829156219959259]);
  });

  it("keeps diffuse texture repeat wrapping when loaded through loadModel", async () => {
    const textureLoader: ThreeMmdTextureLoader = {
      load(url, onLoad) {
        const texture = new THREE.Texture();
        texture.name = url;
        onLoad?.(texture);
        return texture;
      }
    };
    const loader = new ThreeMmdLoader({
      textureMap: { "tex.png": "resolved/tex.png" },
      textureLoader
    });

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        texturePath: "tex.png"
      })
    );
    const material = Array.isArray(model.mesh.material) ? model.mesh.material[0] : model.mesh.material;

    expect(material.map).toBeInstanceOf(THREE.Texture);
    expect(material.map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(material.map?.wrapT).toBe(THREE.RepeatWrapping);
  });

  it("enables geometry-aware alpha internally for default MMD-compatible outlines", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader = createDataTextureLoader(texture);
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const loader = new ThreeMmdLoader({
      textureMap: { "tex.png": "resolved/tex.png" },
      textureLoader
    });

    await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        texturePath: "tex.png"
      })
    );

    expect(geometryAlphaSpy).toHaveBeenCalledOnce();
  });

  it("does not enable internal geometry-aware alpha when outlines are disabled", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader = createDataTextureLoader(texture);
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const loader = new ThreeMmdLoader({
      textureMap: { "tex.png": "resolved/tex.png" },
      textureLoader
    });

    await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        texturePath: "tex.png"
      }),
      { outlines: false }
    );

    expect(geometryAlphaSpy).not.toHaveBeenCalled();
  });

  it("keeps explicit geometry-aware alpha opt-in active when outlines are disabled", async () => {
    const texture = createReadableAlphaDataTexture();
    const textureLoader = createDataTextureLoader(texture);
    const geometryAlphaSpy = vi.spyOn(Textures, "evaluateMmdTextureAlphaGeometry");
    const loader = new ThreeMmdLoader({
      geometryAwareAlpha: true,
      textureMap: { "tex.png": "resolved/tex.png" },
      textureLoader
    });

    await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        texturePath: "tex.png"
      }),
      { outlines: false }
    );

    expect(geometryAlphaSpy).toHaveBeenCalledOnce();
  });


  it("exposes PMX IK chains on mesh userData when the fixture contains IK", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_basic_bone.pmx"));

    const model = await loader.loadModel(source);
    const chains = model.mesh.userData.mmdIkChains;
    expect(Array.isArray(chains)).toBe(true);
    expect(chains.length).toBeGreaterThan(0);
    expect(chains[0]).toMatchObject({
      goalBoneIndex: expect.any(Number),
      effectorBoneIndex: expect.any(Number),
      links: expect.any(Array)
    });
    expect(chains[0].links.length).toBeGreaterThan(0);
  });

  it("keeps PMX IK chains even when the manipulation flag is disabled", async () => {
    const loader = new ThreeMmdLoader({ core: createIkFlagCore() });

    const model = await loader.loadModel(new Uint8Array([1]));

    expect(model.mesh.userData.mmdIkChains).toEqual([
      expect.objectContaining({
        goalBoneIndex: 1,
        effectorBoneIndex: 0
      }),
      expect.objectContaining({
        goalBoneIndex: 2,
        effectorBoneIndex: 1
      })
    ]);
    expect(model.mesh.skeleton.bones[2]?.userData.mmdIkStateName).toBe("enabled IK state");
  });

  it("passes PMX fixed-axis links only for hand-twist IK chains", async () => {
    const loader = new ThreeMmdLoader({ core: createFixedAxisIkCore() });

    const model = await loader.loadModel(new Uint8Array([1]));
    const chains = model.mesh.userData.mmdIkChains;

    expect(chains[0]?.links[0]?.fixedAxis).toBeUndefined();
    expect(chains[1]?.links[0]?.fixedAxis).toEqual([-1, 0, 0]);
  });

  it("evaluates a runtime frame for an IK-enabled mesh without throwing", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_basic_bone.pmx"));

    const model = await loader.loadModel(source);
    const animation = createEmptyMmdAnimation();

    expect(model.mesh.userData.mmdIkChains.length).toBeGreaterThan(0);
    if (!model.runtime) {
      throw new Error("Expected a runtime");
    }
    expect(() => {
      model.runtime?.setAnimation(animation, model.mesh);
      model.runtime?.evaluate(1 / 30);
    }).not.toThrow();
  });

  it("wires append transform metadata from the append bone fixture", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_append_bone.pmx"));

    const model = await loader.loadModel(source);
    const appendBones = model.mesh.skeleton.bones.filter((bone) => {
      return bone.userData.mmdAppendTransform !== undefined;
    });

    expect(appendBones.length).toBeGreaterThan(0);
    expect(appendBones[0]?.userData.mmdAppendTransform).toEqual(
      expect.objectContaining({
        parentIndex: expect.any(Number),
        weight: expect.any(Number)
      })
    );
    expect(appendBones[0]?.userData.mmdFlags).toEqual(
      expect.objectContaining({
        appendRotate: expect.any(Boolean),
        appendTranslate: expect.any(Boolean)
      })
    );
  });

  it("loads a meshless PMX model into a skinned mesh with empty geometry indices", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_fix_axis.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.skeleton.bones.length).toBeGreaterThanOrEqual(1);
    expect(model.mesh.geometry.index?.count ?? 0).toBe(0);
  });

  it("loads a synthetic PMX model with empty geometry indices into a skinned mesh", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(createMinimalPmxModelBytes({ materialCount: 1 }));

    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.skeleton.bones.length).toBeGreaterThanOrEqual(0);
    expect(model.mesh.geometry.index?.count ?? 0).toBe(0);
  });

  it("loads a synthetic PMX model with empty materials into a skinned mesh", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(createMinimalPmxModelBytes({ materialCount: 0 }));

    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.skeleton.bones.length).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(model.mesh.material)).toBe(false);
    expect(model.mesh.geometry.index?.count ?? 0).toBe(0);
  });

  it("rejects empty animation and pose sources", async () => {
    const loader = new ThreeMmdLoader();

    await expect(loader.loadAnimation(new Uint8Array())).rejects.toThrow(
      "ThreeMmdLoader.loadAnimation source must not be empty"
    );
    await expect(loader.loadPose(new Uint8Array())).rejects.toThrow(
      "ThreeMmdLoader.loadPose source must not be empty"
    );
    await expect(loader.loadPoseAnimation(new Uint8Array(), "pose")).rejects.toThrow(
      "ThreeMmdLoader.loadPoseAnimation source must not be empty"
    );
  });

  it("loads VMD animations through the configured core", async () => {
    const animation: MmdAnimation = {
      ...createEmptyMmdAnimation(),
      metadata: {
        ...createEmptyMmdAnimation().metadata,
        modelName: "core-motion"
      }
    };
    const loadVmd = vi.fn(() => animation);
    const core: MmdCore = {
      ...createIkFlagCore(),
      loadVmd
    };
    const loader = new ThreeMmdLoader({ core });
    const bytes = new Uint8Array([1, 2, 3]);

    const loaded = await loader.loadAnimation(bytes);

    expect(loadVmd).toHaveBeenCalledWith(bytes);
    expect(loaded).toEqual({
      source: bytes,
      name: "core-motion",
      animation
    });
  });

  it("rejects loadModel bytes before model assembly when the model format is unknown", async () => {
    const loader = new ThreeMmdLoader();

    await expect(loader.loadModel(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      "Unable to detect MMD model format"
    );
  });

  it("rejects invalid load sources before the explicit implementation error", async () => {
    const loader = new ThreeMmdLoader();

    await expect(loader.loadModel(null as unknown as ModelSource)).rejects.toThrow(
      "ThreeMmdLoader.loadModel source must be a string, File, ArrayBuffer, or Uint8Array"
    );
    await expect(loader.loadAnimation({} as unknown as ModelSource)).rejects.toThrow(
      "ThreeMmdLoader.loadAnimation source must be a string, File, ArrayBuffer, or Uint8Array"
    );
    await expect(loader.loadPose(1 as unknown as ModelSource)).rejects.toThrow(
      "ThreeMmdLoader.loadPose source must be a string, File, ArrayBuffer, or Uint8Array"
    );
    await expect(loader.loadPoseAnimation([] as unknown as ModelSource)).rejects.toThrow(
      "ThreeMmdLoader.loadPoseAnimation source must be a string, File, ArrayBuffer, or Uint8Array"
    );
  });
});

function createMinimalPmxModelBytes(options: {
  readonly materialCount: 0 | 1;
  readonly normal?: readonly [number, number, number];
  readonly texturePath?: string;
  readonly triangle?: boolean;
  readonly edge?: boolean;
}): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const i32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const text = (value: string) => {
    const encoded = encoder.encode(value);
    i32(encoded.byteLength);
    bytes.push(...encoded);
  };
  const count = (value = 0) => i32(value);

  bytes.push(...encoder.encode("PMX "));
  f32(2);
  u8(8);
  u8(1);
  u8(0);
  u8(1);
  u8(1);
  u8(1);
  u8(1);
  u8(1);
  u8(1);
  text("synthetic empty mesh");
  text("SyntheticEmptyMesh");
  text("");
  text("");
  count(options.triangle ? 3 : 1);
  writeVertex([0, 0, 0]);
  if (options.triangle) {
    writeVertex([1, 0, 0]);
    writeVertex([0, 1, 0]);
  }
  count(options.triangle ? 3 : 0);
  if (options.triangle) {
    u8(0);
    u8(1);
    u8(2);
  }
  const texturePaths = options.texturePath ? [options.texturePath] : [];
  count(texturePaths.length);
  texturePaths.forEach(text);
  count(options.materialCount);
  if (options.materialCount === 1) {
    writeMaterial();
  }
  count(0);
  count(0);
  count(0);
  count(0);
  count(0);

  return new Uint8Array(bytes);

  function writeVertex(position: readonly [number, number, number]) {
    const normal = options.normal ?? [0, 1, 0];
    f32(position[0]);
    f32(position[1]);
    f32(position[2]);
    f32(normal[0]);
    f32(normal[1]);
    f32(normal[2]);
    f32(0);
    f32(0);
    u8(0);
    u8(0);
    f32(1);
  }

  function writeMaterial() {
    text("mat");
    text("mat");
    f32(0.8);
    f32(0.8);
    f32(0.8);
    f32(1);
    f32(0);
    f32(0);
    f32(0);
    f32(1);
    f32(0.2);
    f32(0.2);
    f32(0.2);
    u8(options.edge ? 0x10 : 0);
    f32(0);
    f32(0);
    f32(0);
    f32(1);
    f32(1);
    u8(options.texturePath ? 0 : 0xff);
    u8(0xff);
    u8(0);
    u8(1);
    u8(0);
    text("");
    i32(options.triangle ? 3 : 0);
  }
}

function createIkFlagCore(): MmdCore {
  const model = createIkFlagModel();
  return {
    version: () => "test-core",
    healthCheck: () => true,
    loadModel: () => model,
    loadVmd: () => createEmptyMmdAnimation(),
    loadVpd: () => ({
      kind: "vpd",
      bytes: new Uint8Array(),
      metadata: { modelFile: "", boneCount: 0, morphCount: 0 },
      bones: {},
      morphs: {}
    }),
    loadVpdAnimation: () => createEmptyMmdAnimation()
  };
}

function createSparseMorphStressCore(): MmdCore {
  const model = createSparseMorphStressModel();
  return {
    version: () => "sparse-morph-stress-core",
    healthCheck: () => true,
    loadModel: () => model,
    loadVmd: () => createEmptyMmdAnimation(),
    loadVpd: () => ({
      kind: "vpd",
      bytes: new Uint8Array(),
      metadata: { modelFile: "", boneCount: 0, morphCount: 0 },
      bones: {},
      morphs: {}
    }),
    loadVpdAnimation: () => createEmptyMmdAnimation()
  };
}

function createSparseMorphStressModel(): MmdModel {
  const vertexCount = 6000;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const positionBase = vertexIndex * 3;
    positions[positionBase] = vertexIndex % 100;
    positions[positionBase + 1] = Math.floor(vertexIndex / 100);
    normals[positionBase + 1] = 1;
    const skinBase = vertexIndex * 4;
    skinWeights[skinBase] = 1;
  }
  const morphs = Array.from({ length: 1000 }, (_, index) => ({
    name: `morph${index}`,
    englishName: `morph${index}`,
    type: "vertex" as const,
    vertexOffsets:
      index === 0
        ? [{ vertexIndex: 1, position: [0.1, 0, 0] as [number, number, number] }]
        : index === 1
          ? [{ vertexIndex: 3001, position: [0, 0.2, 0] as [number, number, number] }]
          : [],
    groupOffsets: [],
    boneOffsets: [],
    uvOffsets: [],
    additionalUvOffsets: [],
    materialOffsets: []
  }));
  return {
    metadata: () => ({
      format: "pmx",
      version: 2,
      encoding: "utf-8",
      name: "sparse morph stress",
      englishName: "SparseMorphStress",
      comment: "",
      englishComment: "",
      counts: {
        vertices: vertexCount,
        faces: 2,
        materials: 2,
        bones: 1,
        morphs: morphs.length,
        displayFrames: 0,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      },
      indexSizes: { vertex: 2, texture: 1, material: 1, bone: 1, morph: 2, rigidBody: 1 },
      additionalUvCount: 0,
      diagnostics: []
    }),
    geometry: () => ({
      positions,
      normals,
      uvs,
      additionalUvs: [],
      indices: new Uint16Array([0, 1, 2, 3000, 3001, 3002]),
      materialGroups: [
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 1 }
      ],
      skinIndices,
      skinWeights
    }),
    materials: () => [createStressMaterial(0), createStressMaterial(1)],
    skeleton: () => ({
      bones: [createIkFlagBone("root", -1, true)]
    }),
    morphs: () => morphs,
    displayFrames: () => [],
    rigidBodies: () => [],
    joints: () => [],
    softBodies: () => [],
    embeddedTextures: () => []
  };
}

function createStressMaterial(index: number): ReturnType<MmdModel["materials"]>[number] {
  return {
    name: `mat${index}`,
    englishName: `mat${index}`,
    texturePath: "",
    sphereTexturePath: "",
    sphereMode: "none",
    toonTexturePath: "",
    sharedToonIndex: undefined,
    diffuse: [0.8, 0.8, 0.8, 1],
    specular: [0, 0, 0],
    specularPower: 1,
    ambient: [0.2, 0.2, 0.2],
    edgeColor: [0, 0, 0, 1],
    edgeSize: 0,
    flags: {
      doubleSided: false,
      groundShadow: false,
      selfShadowMap: index === 0,
      selfShadow: index === 1,
      edge: false,
      vertexColor: false,
      pointDraw: false,
      lineDraw: false
    },
    faceCount: 1
  };
}

function createIkFlagModel(): MmdModel {
  return {
    metadata: () => ({
      format: "pmx",
      version: 2,
      encoding: "utf-8",
      name: "ik flags",
      englishName: "IkFlags",
      comment: "",
      englishComment: "",
      counts: {
        vertices: 0,
        faces: 0,
        materials: 0,
        bones: 3,
        morphs: 0,
        displayFrames: 0,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      },
      indexSizes: { vertex: 1, texture: 1, material: 1, bone: 1, morph: 1, rigidBody: 1 },
      additionalUvCount: 0,
      diagnostics: []
    }),
    geometry: () => ({
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      additionalUvs: [],
      indices: new Uint16Array(0),
      skinIndices: new Uint16Array(0),
      skinWeights: new Float32Array(0)
    }),
    materials: () => [],
    skeleton: () => ({
      bones: [
        createIkFlagBone("root", -1, true),
        createIkFlagBone("target", 0, false, {
          targetIndex: 0,
          loopCount: 1,
          limitAngle: 1,
          links: [{ boneIndex: 0 }]
        }),
        createIkFlagBone(
          "enabled IK",
          0,
          true,
          {
            targetIndex: 1,
            loopCount: 1,
            limitAngle: 1,
            links: [{ boneIndex: 0 }]
          },
          { ikStateName: "enabled IK state" }
        )
      ]
    }),
    morphs: () => [],
    displayFrames: () => [],
    rigidBodies: () => [],
    joints: () => [],
    softBodies: () => [],
    embeddedTextures: () => []
  };
}

function createFixedAxisIkCore(): MmdCore {
  const model: MmdModel = {
    ...createIkFlagModel(),
    metadata: () => ({
      ...createIkFlagModel().metadata(),
      name: "fixed axis ik",
      englishName: "FixedAxisIk",
      counts: {
        ...createIkFlagModel().metadata().counts,
        bones: 5
      }
    }),
    skeleton: () => ({
      bones: [
        createIkFlagBone("root", -1, true),
        createIkFlagBone("ordinary link", 0, true, undefined, { fixedAxis: [0, 1, 0] }),
        createIkFlagBone("ordinary IK", 0, true, {
          targetIndex: 1,
          loopCount: 1,
          limitAngle: 1,
          links: [{ boneIndex: 1 }]
        }),
        createIkFlagBone("hand twist link", 0, true, undefined, { fixedAxis: [1, 0, 0] }),
        createIkFlagBone("右手捩IK", 0, true, {
          targetIndex: 3,
          loopCount: 1,
          limitAngle: 1,
          links: [{ boneIndex: 3 }]
        })
      ]
    })
  };
  return {
    ...createIkFlagCore(),
    loadModel: () => model
  };
}

function createIkFlagBone(
  name: string,
  parentIndex: number,
  enabled: boolean,
  ik?: ReturnType<MmdModel["skeleton"]>["bones"][number]["ik"],
  options: {
    readonly fixedAxis?: [number, number, number];
    readonly ikStateName?: string;
  } = {}
): ReturnType<MmdModel["skeleton"]>["bones"][number] {
  return {
    name,
    englishName: name,
    parentIndex,
    layer: 0,
    position: [0, 0, 0],
    tailIndex: -1,
    tailPosition: undefined,
    flags: {
      indexedTail: false,
      rotatable: true,
      translatable: false,
      visible: enabled,
      enabled,
      ik: ik !== undefined,
      appendLocal: false,
      appendRotate: false,
      appendTranslate: false,
      fixedAxis: options.fixedAxis !== undefined,
      localAxis: false,
      transformAfterPhysics: false,
      externalParentTransform: false
    },
    fixedAxis: options.fixedAxis,
    ikStateName: options.ikStateName,
    ik
  };
}

function createReadableAlphaDataTexture(): THREE.DataTexture {
  const data = new Uint8Array(4 * 4 * 4);
  for (let index = 0; index < 4 * 4; index += 1) {
    data[index * 4] = 255;
    data[index * 4 + 1] = 255;
    data[index * 4 + 2] = 255;
    data[index * 4 + 3] = index === 0 ? 100 : 255;
  }
  return new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
}

function createDataTextureLoader(texture: THREE.Texture): ThreeMmdTextureLoader {
  return {
    load(url, onLoad) {
      texture.name = url;
      onLoad?.(texture);
      return texture;
    }
  };
}

function createEmptyMmdAnimation(): MmdAnimation {
  return {
    kind: "vmd",
    bytes: new Uint8Array(),
    metadata: {
      modelName: "",
      counts: {
        bones: 0,
        morphs: 0,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 0
    },
    boneTracks: {},
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}
