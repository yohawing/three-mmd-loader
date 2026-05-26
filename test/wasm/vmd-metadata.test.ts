import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initCore } from "../../src/parser/wasm/index.js";

const wavefileCameraIt = existsSync(resolve("data/vmd/wavefile_camera.vmd")) ? it : it.skip;

const localRealWorldVmdFixtures = [
  {
    path: "data/vmd/V_MMD-Motion_HimeTanaka.vmd",
    modelName: "田中ヒメ ver1.30",
    maxFrame: 6180,
    counts: {
      bones: 438851,
      morphs: 19250,
      cameras: 0,
      lights: 0,
      selfShadows: 0,
      properties: 0
    },
    uniqueBoneTracks: 71,
    uniqueMorphTracks: 16
  },
  {
    path: "data/vmd/ラビットホール.vmd",
    modelName: "Sour_Miku_White",
    maxFrame: 4837,
    counts: {
      bones: 219685,
      morphs: 3696,
      cameras: 0,
      lights: 0,
      selfShadows: 0,
      properties: 1
    },
    uniqueBoneTracks: 364,
    uniqueMorphTracks: 132
  }
] as const;

describe("@yw-mmd/core-wasm VMD metadata", () => {
  it("inventories optional local real-world VMD motion fixtures", async () => {
    const missing = localRealWorldVmdFixtures.filter(
      (fixture) => !existsSync(resolve(fixture.path))
    );
    if (missing.length > 0) {
      console.warn(
        `Skipping optional local VMD fixture inventory; missing ${missing.length} fixture(s).`
      );
      return;
    }

    const core = await initCore();
    for (const fixture of localRealWorldVmdFixtures) {
      const animation = core.loadVmd(await readFile(resolve(fixture.path)));

      expect(animation.metadata.modelName).toBe(fixture.modelName);
      expect(animation.metadata.maxFrame).toBe(fixture.maxFrame);
      expect(animation.metadata.counts).toEqual(fixture.counts);
      expect(Object.keys(animation.boneTracks)).toHaveLength(fixture.uniqueBoneTracks);
      expect(Object.keys(animation.morphTracks)).toHaveLength(fixture.uniqueMorphTracks);
    }
  });

  it("loads VMD metadata through the nanoem-backed Wasm parser", async () => {
    const core = await initCore();
    const animation = core.loadVmd(
      await readFile(resolve("test/fixtures/test_1bone_cube_motion.vmd"))
    );

    expect(animation.metadata).toMatchObject({
      modelName: "テスト用モデル_arm",
      counts: {
        bones: 6,
        morphs: 0,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 49
    });
    const parentTrack = animation.boneTracks["全ての親"];
    expect(parentTrack?.frames).toHaveLength(6);
    expect(parentTrack?.frames[0]).toBe(0);
    expect(Array.from(parentTrack?.translations.slice(0, 3) ?? [])).toEqual([0, 0, -0]);
    expect(Array.from(parentTrack?.rotations.slice(0, 4) ?? [])).toEqual([-0, -0, 0, 1]);
    expect(parentTrack?.physicsToggles[0]).toBe(1);
  });

  it("preserves Babylon-MMD VMD bone physics toggle bytes", async () => {
    const core = await initCore();
    const disabled = core.loadVmd(createBonePhysicsToggleVmd(0));
    const enabled = core.loadVmd(createBonePhysicsToggleVmd(1));

    expect(disabled.boneTracks.Root?.physicsToggles[0]).toBe(0);
    expect(enabled.boneTracks.Root?.physicsToggles[0]).toBe(1);
  });

  it("preserves Babylon-MMD public VMD physics-toggle fixtures", async () => {
    const core = await initCore();
    const fixturePaths = [
      "references/babylon-mmd/res/motion/physics_toggle_test_v2_yyb10th.vmd",
      "references/babylon-mmd/res/motion/physics_toggle_test_v3_yyb10th.vmd",
      "references/babylon-mmd/res/motion/physics_toggle_test_yyb10th.vmd"
    ];
    if (skipIfMissing(fixturePaths)) {
      return;
    }

    const v2 = core.loadVmd(await readFile(resolve(fixturePaths[0])));
    const v3 = core.loadVmd(await readFile(resolve(fixturePaths[1])));
    const full = core.loadVmd(await readFile(resolve(fixturePaths[2])));

    expect(v2.metadata).toMatchObject({
      modelName: "YYB式初音ミク_10th_v",
      counts: { bones: 3, morphs: 0, properties: 0 },
      maxFrame: 21
    });
    expect(new Set(Array.from(v2.boneTracks.D4!.physicsToggles))).toEqual(new Set([0, 1]));

    expect(v3.metadata).toMatchObject({
      modelName: "YYB式初音ミク_10th_v",
      counts: { bones: 17, morphs: 0, properties: 0 },
      maxFrame: 20
    });
    expect(v3.boneTracks["右肩P"]?.physicsToggles[0]).toBe(1);

    expect(full.metadata).toMatchObject({
      modelName: "YYB式初音ミク_10th_v",
      counts: { bones: 454, morphs: 100, properties: 1 },
      maxFrame: 100
    });
    expect(full.propertyFrames[0]).toMatchObject({
      frame: 0,
      visible: true,
      physicsSimulation: true,
      ikStates: [
        { boneName: "右足ＩＫ", enabled: true },
        { boneName: "右つま先ＩＫ", enabled: true },
        { boneName: "左足ＩＫ", enabled: true },
        { boneName: "左つま先ＩＫ", enabled: true }
      ]
    });
    expect(full.boneTracks["操作中心"]?.physicsToggles[0]).toBe(1);
  });

  wavefileCameraIt("parses camera and light frame arrays", async () => {
    const core = await initCore();
    const cameraMotion = core.loadVmd(await readFile(resolve("data/vmd/wavefile_camera.vmd")));
    const lightMotion = core.loadVmd(createLightOnlyVmd());

    expect(cameraMotion.cameraFrames).toHaveLength(cameraMotion.metadata.counts.cameras);
    expect(cameraMotion.cameraFrames[0]?.frame).toBeGreaterThanOrEqual(0);
    expect(cameraMotion.cameraFrames.every((frame) => Number.isFinite(frame.fov))).toBe(true);
    expect(lightMotion.lightFrames).toHaveLength(lightMotion.metadata.counts.lights);
  });

  it("parses VMD property and self-shadow frames", async () => {
    const core = await initCore();
    const animation = core.loadVmd(createPropertyVmd("leg IK_L"));

    expect(animation.metadata.counts.selfShadows).toBe(1);
    expect(animation.metadata.counts.properties).toBe(2);
    expect(animation.selfShadowFrames[0]).toMatchObject({
      frame: 12,
      mode: 1
    });
    expect(animation.selfShadowFrames[0]?.distance).toBeCloseTo(0.4);
    expect(animation.propertyFrames[0]).toMatchObject({
      frame: 0,
      visible: false,
      physicsSimulation: true,
      ikStates: [{ boneName: "leg IK_L", enabled: false }]
    });
    expect(animation.propertyFrames[1]).toMatchObject({
      frame: 30,
      visible: true,
      physicsSimulation: true,
      ikStates: [{ boneName: "leg IK_L", enabled: true }]
    });
  });

  it("rejects broken VMD data", async () => {
    const core = await initCore();
    expect(() => core.loadVmd(new TextEncoder().encode("broken"))).toThrow(
      /Invalid VMD header|Unexpected end/
    );
  });
});

function skipIfMissing(paths: readonly string[]): boolean {
  const missing = paths.filter((path) => !existsSync(resolve(path)));
  if (missing.length > 0) {
    console.warn(`Skipping optional Babylon-MMD fixture test; missing ${missing.join(", ")}`);
    return true;
  }
  return false;
}

function createLightOnlyVmd(): Uint8Array {
  const bytes = new Uint8Array(30 + 20 + 4 + 4 + 4 + 4 + 2 * (4 + 6 * 4));
  const view = new DataView(bytes.buffer);
  let offset = 0;

  offset = writeAscii(bytes, offset, "Vocaloid Motion Data 0002", 30);
  offset = writeAscii(bytes, offset, "LightTest", 20);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 2);
  offset = writeLightFrame(view, offset, 0, [1, 0, 1], [0, 0, -1]);
  offset = writeLightFrame(view, offset, 30, [0, 0.5, 0.5], [0, 0, 0]);

  expect(offset).toBe(bytes.byteLength);
  return bytes;
}

function createBonePhysicsToggleVmd(physicsToggle: number): Uint8Array {
  const bytes = new Uint8Array(30 + 20 + 4 + 15 + 4 + 7 * 4 + 64 + 4 + 4 + 4);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const interpolation = linearInterpolationBytes();
  if (physicsToggle === 0) {
    interpolation[2] = 0x63;
    interpolation[3] = 0x0f;
  } else {
    interpolation[2] = 0x00;
    interpolation[3] = 0x00;
  }

  offset = writeAscii(bytes, offset, "Vocaloid Motion Data 0002", 30);
  offset = writeAscii(bytes, offset, "PhysicsToggle", 20);
  offset = writeU32(view, offset, 1);
  offset = writeBoneFrame(bytes, view, offset, 0, [0, 0, 0], interpolation);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);

  expect(offset).toBe(bytes.byteLength);
  return bytes;
}

function createPropertyVmd(ikBoneName: string): Uint8Array {
  const bytes = new Uint8Array(30 + 20 + 4 * 4 + 4 + 9 + 4 + 2 * (4 + 1 + 4 + 20 + 1));
  const view = new DataView(bytes.buffer);
  let offset = 0;

  offset = writeAscii(bytes, offset, "Vocaloid Motion Data 0002", 30);
  offset = writeAscii(bytes, offset, "PropertyTest", 20);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, 1);
  offset = writeU32(view, offset, 12);
  bytes[offset++] = 1;
  offset = writeF32(view, offset, 0.4);
  offset = writeU32(view, offset, 2);
  offset = writePropertyFrame(bytes, view, offset, 0, false, ikBoneName, false);
  offset = writePropertyFrame(bytes, view, offset, 30, true, ikBoneName, true);

  expect(offset).toBe(bytes.byteLength);
  return bytes;
}

function writePropertyFrame(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  frame: number,
  visible: boolean,
  ikBoneName: string,
  ikEnabled: boolean
): number {
  offset = writeU32(view, offset, frame);
  bytes[offset++] = visible ? 1 : 0;
  offset = writeU32(view, offset, 1);
  offset = writeAscii(bytes, offset, ikBoneName, 20);
  bytes[offset++] = ikEnabled ? 1 : 0;
  return offset;
}

function writeBoneFrame(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  frame: number,
  translation: [number, number, number],
  interpolation: Uint8Array
): number {
  offset = writeAscii(bytes, offset, "Root", 15);
  offset = writeU32(view, offset, frame);
  for (const value of translation) {
    offset = writeF32(view, offset, value);
  }
  offset = writeF32(view, offset, 0);
  offset = writeF32(view, offset, 0);
  offset = writeF32(view, offset, 0);
  offset = writeF32(view, offset, 1);
  bytes.set(interpolation, offset);
  return offset + interpolation.length;
}

function linearInterpolationBytes(): Uint8Array {
  const values = new Uint8Array(64);
  for (let channel = 0; channel < 4; channel++) {
    values[channel] = 20;
    values[channel + 4] = 20;
    values[channel + 8] = 107;
    values[channel + 12] = 107;
  }
  return values;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string, length: number): number {
  const encoded = new TextEncoder().encode(value);
  bytes.set(encoded.subarray(0, length), offset);
  return offset + length;
}

function writeU32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value, true);
  return offset + 4;
}

function writeF32(view: DataView, offset: number, value: number): number {
  view.setFloat32(offset, value, true);
  return offset + 4;
}

function writeLightFrame(
  view: DataView,
  offset: number,
  frame: number,
  color: [number, number, number],
  direction: [number, number, number]
): number {
  offset = writeU32(view, offset, frame);
  for (const value of [...color, ...direction]) {
    offset = writeF32(view, offset, value);
  }
  return offset;
}
