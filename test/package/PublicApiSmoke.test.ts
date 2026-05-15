import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BinaryReader,
  detectModelFormat,
  parsePmdSectionInventory,
  parsePmxMetadata,
  parsePmxSectionInventory,
  parseVmdSectionInventory,
  parseVpdPose,
  parseVpdPoseInventory
} from "../../src/parser/index.js";
import {
  DefaultMmdRuntime,
  ThreeMmdLoader,
  MODEL_SOURCE_STRING_UNRESOLVED,
  createBonePhysicsToggleBuffer,
  createThreeBufferGeometry,
  createThreeSkeleton,
  createDisabledMmdPhysicsBackend,
  createMmdBuiltInToonTextureMap,
  isModelSource,
  legacyMmdRigidBodyModeToPhysicsMotionType,
  mmdWorldMatrixToThree,
  resolveMappedTexture,
  readModelSourceBytes
} from "../../src/index.js";

describe("public API smoke", () => {
  it("runs the README parser sample against the one-bone PMX fixture", async () => {
    const bytes = await readFile(resolve("..", "data/unittest/test_1bone_cube.pmx"));
    const format = detectModelFormat(bytes);
    const reader = new BinaryReader(bytes);

    expect(format).toBe("pmx");
    expect(reader.remaining).toBe(bytes.byteLength);

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

  it("exports ModelSource helpers from the public barrel", async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(isModelSource("model.pmx")).toBe(true);
    expect(isModelSource(bytes)).toBe(true);
    await expect(readModelSourceBytes(bytes)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(readModelSourceBytes("model.pmx")).rejects.toThrow(MODEL_SOURCE_STRING_UNRESOLVED);
  });

  it("exports representative legacy physics bridge helpers from the public barrel", () => {
    expect(legacyMmdRigidBodyModeToPhysicsMotionType("static")).toBe("static");
    expect(legacyMmdRigidBodyModeToPhysicsMotionType("dynamicBone")).toBe("dynamicWithBone");
    expect(
      Array.from(
        createBonePhysicsToggleBuffer(
          [
            { name: "センター", englishName: "center" },
            { name: "髪", englishName: "hair" }
          ],
          { center: false, 髪: true }
        )
      )
    ).toEqual([0, 1]);
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
    await expect(loader.loadModel(new Uint8Array())).rejects.toThrow(
      "ThreeMmdLoader.loadModel is not implemented in this migration slice"
    );
  });
});
