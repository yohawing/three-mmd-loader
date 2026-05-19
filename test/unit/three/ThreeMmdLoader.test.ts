import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import type {
  MmdAnimation,
  ModelSource,
  ThreeMmdLoaderOptions,
  ThreeMmdTextureLoader
} from "../../../src/index.js";

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
  });

  it("loads a PMX model into a minimal Three.js skinned mesh", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.name).toBe("TestModel");
    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.skeleton.bones).toHaveLength(1);
    expect(model.mesh.geometry.getAttribute("position").count).toBe(14);
    expect(model.mesh.geometry.index?.count).toBe(36);
    expect(model.source).toEqual({ kind: "bytes", byteLength: source.byteLength });
    expect(model.textureDiagnostics).toEqual([]);
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

  it("eagerly exposes outline meshes and a stable render-order mesh array without added-event side effects", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = createMinimalPmxModelBytes({
      materialCount: 1,
      triangle: true,
      edge: true
    });

    const model = await loader.loadModel(source);
    const scene = new THREE.Scene();

    expect(model.mesh.children.some((child) => child.userData.mmdOutlineProxy)).toBe(false);
    scene.add(model.mesh);
    expect(model.mesh.children.some((child) => child.userData.mmdOutlineProxy)).toBe(false);
    const outlineMeshes = model.outlineMeshes;
    expect(model.outlineMeshes).toBe(outlineMeshes);
    expect(outlineMeshes).toHaveLength(1);
    expect(outlineMeshes.every((mesh) => !!mesh.userData.mmdOutlineProxy)).toBe(true);
    const renderOrderMeshes = model.renderOrderMeshes;
    expect(model.renderOrderMeshes).toBe(renderOrderMeshes);
    expect(renderOrderMeshes).toEqual([]);
  });

  it("does not create render-order proxy meshes by default", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true
      })
    );

    expect(model.renderOrderMeshes).toEqual([]);
  });

  it("creates render-order proxy meshes when explicitly requested", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true
      }),
      { renderOrderProxies: true }
    );

    expect(model.renderOrderMeshes).toHaveLength(1);
    expect(model.renderOrderMeshes.every((mesh) => !!mesh.userData.mmdMaterialRenderProxy)).toBe(
      true
    );
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
  });

  it("applies load-time frustum culling to the mesh and generated proxy meshes", async () => {
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(
      createMinimalPmxModelBytes({
        materialCount: 1,
        triangle: true,
        edge: true
      }),
      { frustumCulled: false, renderOrderProxies: true }
    );

    expect(model.mesh.frustumCulled).toBe(false);
    expect(model.outlineMeshes.every((mesh) => mesh.frustumCulled === false)).toBe(true);
    expect(model.renderOrderMeshes.every((mesh) => mesh.frustumCulled === false)).toBe(true);
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

  it("exposes unimplemented async animation loading methods explicitly", async () => {
    const loader = new ThreeMmdLoader();

    await expect(loader.loadAnimation(new Uint8Array())).rejects.toThrow(
      "ThreeMmdLoader.loadAnimation is not implemented in this migration slice"
    );
    await expect(loader.loadPose(new Uint8Array())).rejects.toThrow(
      "ThreeMmdLoader.loadPose is not implemented in this migration slice"
    );
    await expect(loader.loadPoseAnimation(new Uint8Array(), "pose")).rejects.toThrow(
      "ThreeMmdLoader.loadPoseAnimation is not implemented in this migration slice"
    );
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
