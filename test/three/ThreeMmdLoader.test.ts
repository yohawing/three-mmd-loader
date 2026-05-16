import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../src/index.js";
import type { ModelSource, ThreeMmdLoaderOptions } from "../../src/index.js";

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
    const source: ModelSource = await readFile(resolve("..", "data/unittest/test_1bone_cube.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.name).toBe("TestModel");
    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.skeleton.bones).toHaveLength(1);
    expect(model.mesh.geometry.getAttribute("position").count).toBe(14);
    expect(model.mesh.geometry.index?.count).toBe(36);
    expect(model.textureDiagnostics).toEqual([]);
  });

  it("loads a meshless PMX model into a skinned mesh with empty geometry indices", async () => {
    const loader = new ThreeMmdLoader();
    const source: ModelSource = await readFile(resolve("..", "data/unittest/test_fix_axis.pmx"));

    const model = await loader.loadModel(source);

    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.skeleton.bones.length).toBeGreaterThanOrEqual(1);
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
