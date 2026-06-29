import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { initCore } from "../../src/parser/wasm/index.js";
import { MmdAnimBackedCore } from "../../src/parser/wasm/MmdAnimBackedCore.js";

describe("@yw-mmd/core-wasm VMD metadata", () => {
  it("routes loadVmd through the generated mmd-anim VMD parser when available", () => {
    const parseVmdAnimationJson = vi.fn(() => JSON.stringify(createMmdAnimCameraDto()));
    const core = new MmdAnimBackedCore({
      parsePmxModelJson: () => "{}",
      parseVmdAnimationJson,
      wasm_wrapper_version: () => 7
    });
    const bytes = new Uint8Array([1, 2, 3]);

    const animation = core.loadVmd(bytes);

    expect(parseVmdAnimationJson).toHaveBeenCalledWith(bytes);
    expect(animation.metadata.counts.cameras).toBe(1);
    expect(animation.cameraFrames[0]).toMatchObject({
      frame: 12,
      distance: 42,
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      fov: 35,
      perspective: true
    });
    expect(Array.from(animation.bytes)).toEqual([1, 2, 3]);
  });

  it("loads VMD metadata through the mmd-anim-backed Wasm parser", async () => {
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

  it("preserves VMD bone physics toggle bytes", async () => {
    const core = await initCore();
    const disabled = core.loadVmd(createBonePhysicsToggleVmd(0));
    const enabled = core.loadVmd(createBonePhysicsToggleVmd(1));

    expect(disabled.boneTracks.Root?.physicsToggles[0]).toBe(0);
    expect(enabled.boneTracks.Root?.physicsToggles[0]).toBe(1);
  });

  it("parses light frame arrays", async () => {
    const core = await initCore();
    const lightMotion = core.loadVmd(createLightOnlyVmd());

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
      /Invalid VMD header|Unexpected end|unexpected end of data/
    );
  });
});

function createMmdAnimCameraDto() {
  return {
    kind: "vmd",
    metadata: {
      modelName: "CameraTest",
      counts: {
        bones: 0,
        morphs: 0,
        cameras: 1,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 12
    },
    boneFrames: [],
    morphFrames: [],
    cameraFrames: [
      {
        frame: 12,
        distance: 42,
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        interpolation: [20, 20, 107, 107, 20, 20, 107, 107, 20, 20, 107, 107, 20, 20, 107, 107, 20, 20, 107, 107, 20, 20, 107, 107],
        fov: 35,
        perspective: true
      }
    ],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
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
