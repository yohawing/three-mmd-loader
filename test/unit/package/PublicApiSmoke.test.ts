import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  detectModelFormat,
  parsePmdSectionInventory,
  parsePmxMetadata,
  parsePmxSectionInventory,
  parseVmdSectionInventory,
  parseVpdPose,
  parseVpdPoseInventory
} from "../../../src/parser/index.js";
import {
  DefaultMmdRuntime,
  ThreeMmdLoader,
  createAmmoMmdPhysicsBackend,
  createThreeBufferGeometry,
  createThreeSkeleton,
  createDisabledMmdPhysicsBackend,
  createMmdBuiltInToonTextureMap,
  type AmmoNamespace,
  type MmdPhysicsStepContext,
  isModelSource,
  mmdWorldMatrixToThree,
  resolveMappedTexture
} from "../../../src/index.js";
import * as publicApi from "../../../src/index.js";

describe("public API smoke", () => {
  it("runs the README parser sample against the one-bone PMX fixture", async () => {
    const bytes = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));
    const format = detectModelFormat(bytes);

    expect(format).toBe("pmx");

    if (format === "pmx") {
      const metadata = parsePmxMetadata(bytes);

      expect(metadata.name).toBe("テスト用モデル");
      expect(metadata.englishName).toBe("TestModel");
      expect(metadata.counts).toMatchObject({
        vertices: 14,
        faces: 12,
        materials: 1,
        bones: 1
      });
      expect(metadata.trailingBytes).toBe(0);
    }
  });

  it("runs the README VPD pose parser sample", () => {
    const vpdBytes = new TextEncoder().encode(`Vocaloid Pose Data file
sample.pmx;
1;
Bone0{
center
0,1,2;
0,0,0,1;
}
`);

    const pose = parseVpdPose(vpdBytes);

    expect(pose.modelFile).toBe("sample.pmx");
    expect(pose.bonePoses).toEqual([
      {
        boneName: "center",
        translation: [0, 1, 2],
        rotation: [0, 0, 0, 1]
      }
    ]);
  });

  it("exports lightweight parser inventory APIs from the public parser barrel", () => {
    expect(parsePmdSectionInventory).toBeTypeOf("function");
    expect(parsePmxSectionInventory).toBeTypeOf("function");
    expect(parseVmdSectionInventory).toBeTypeOf("function");
    expect(parseVpdPose).toBeTypeOf("function");
    expect(parseVpdPoseInventory).toBeTypeOf("function");
  });

  it("exports Three.js adapter geometry helpers from the public barrel", () => {
    expect(createThreeBufferGeometry).toBeTypeOf("function");
  });

  it("does not expose Three.js AnimationClip creation from the public barrel", () => {
    expect("createThreeAnimationClip" in publicApi).toBe(false);
    expect("createThreePoseAnimationClip" in publicApi).toBe(false);
  });

  it("exports Three.js adapter skeleton helpers from the public barrel", () => {
    expect(createThreeSkeleton).toBeTypeOf("function");
  });

  it("exports representative Three.js adapter utility helpers from the public barrel", () => {
    const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]);

    expect(Array.from(mmdWorldMatrixToThree(matrix, 0).elements.slice(12, 15))).toEqual([
      1,
      2,
      -3
    ]);
    expect(createMmdBuiltInToonTextureMap("toon")["toon01.bmp"]).toBe("toon/toon01.bmp");
    expect(resolveMappedTexture("Textures\\Body.BMP", { "textures/body.bmp": "body-texture" })).toBe(
      "body-texture"
    );
  });

  it("exports ModelSource validation from the public barrel", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(isModelSource("model.pmx")).toBe(true);
    expect(isModelSource(bytes)).toBe(true);
  });

  it("imports root package facades and exposes explicit loader errors", async () => {
    const runtime = new DefaultMmdRuntime({ frameRate: 60 });
    const physics = createDisabledMmdPhysicsBackend({ reason: "README smoke" });
    const loader = new ThreeMmdLoader();

    expect(runtime.evaluate(0.5)).toMatchObject({ seconds: 0.5, frame: 30, frameRate: 60 });
    expect(physics.step(runtime.frameState())).toMatchObject({
      simulated: false,
      diagnostics: [
        {
          code: "PHYSICS_BACKEND_DISABLED",
          level: "warning"
        }
      ]
    });
    await expect(loader.loadModel(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      "Unable to detect MMD model format"
    );
  });

  it("runs the README minimal loader sample against the one-bone PMX fixture", async () => {
    const pmxBytes = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(pmxBytes);

    expect(model.mesh.name).toBe("TestModel");
    expect(model.mesh.skeleton.bones).toHaveLength(1);
    expect(model.mesh.geometry.getAttribute("position").count).toBe(14);
  });

  it("exports the concrete Ammo physics backend and follows the lifecycle gate", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;

    const backend = createAmmoMmdPhysicsBackend(Ammo);

    expect(backend.disabled).toBe(false);
    expect(backend.disposed).toBe(false);
    expect(backend.step(createAmmoStepContext()).simulated).toBe(false);
    expect(backend.disposed).toBe(false);

    backend.dispose?.();
    expect(backend.disposed).toBe(true);
  });

  it("loads a PMX model and disposes a concrete Ammo physics backend", async () => {
    const pmxBytes = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const loader = new ThreeMmdLoader();

    const model = await loader.loadModel(pmxBytes);
    const backend = createAmmoMmdPhysicsBackend(Ammo);

    expect(model.mesh.name).toBe("TestModel");
    expect(backend.disposed).toBe(false);

    backend.dispose?.();
    expect(backend.disposed).toBe(true);
  });
});

function createAmmoStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);

  return {
    seconds: 0,
    deltaSeconds: 0,
    frame: 0,
    frameRate: 60,
    skeleton: {
      bones: [
        {
          index: 0,
          name: "bone",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        name: "body",
        boneIndex: 0,
        motionType: "dynamic",
        shape: {
          type: "sphere",
          size: [0.25, 0.25, 0.25]
        },
        localTranslation: [0, 1, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.5,
        collisionGroup: 0,
        collisionMask: 0xffff
      }
    ],
    joints: [],
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output: {
      translations: new Float32Array(inputTranslations),
      rotations: new Float32Array(inputRotations),
      worldMatricesColumnMajor: new Float32Array(inputWorldMatricesColumnMajor),
      updatedBoneIndices: []
    }
  };
}
