import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import type { ModelSource, ThreeMmdLoaderOptions } from "../../../src/index.js";

describe("ThreeMmdLoader", () => {
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
    expect(model.textureDiagnostics).toEqual([]);
  });

  it("lazy-creates outline and render-order proxy meshes behind compatible properties", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.children.some((child) => child.userData.mmdOutlineProxy)).toBe(false);
    const outlineMeshes = model.outlineMeshes;
    expect(model.outlineMeshes).toBe(outlineMeshes);
    expect(model.mesh.children.filter((child) => child.userData.mmdOutlineProxy)).toHaveLength(
      outlineMeshes.length
    );
    const renderOrderMeshes = model.renderOrderMeshes;
    expect(model.renderOrderMeshes).toBe(renderOrderMeshes);
    expect(renderOrderMeshes.every((mesh) => !!mesh.userData.mmdMaterialRenderProxy)).toBe(true);
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
    const clip = new THREE.AnimationClip("ik-smoke", -1, []);

    expect(model.mesh.userData.mmdIkChains.length).toBeGreaterThan(0);
    if (!model.runtime) {
      throw new Error("Expected a runtime");
    }
    expect(() => {
      model.runtime?.setAnimation(clip, model.mesh);
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
  count(1);
  writeVertex();
  count(0);
  count(0);
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

  function writeVertex() {
    const normal = options.normal ?? [0, 1, 0];
    f32(0);
    f32(0);
    f32(0);
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
    u8(0);
    f32(0);
    f32(0);
    f32(0);
    f32(1);
    f32(1);
    u8(0xff);
    u8(0xff);
    u8(0);
    u8(1);
    u8(0);
    text("");
    i32(0);
  }
}
