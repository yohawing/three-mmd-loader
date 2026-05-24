import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseVmd, parseVmdSectionInventory } from "../../../../src/parser/vmd/index.js";
import { ThreeMmdLoader } from "../../../../src/three/index.js";
import type { VmdBoneFrame, VmdMorphFrame } from "../../../../src/parser/model/modelTypes.js";

const fixtures = [
  "test_1bone_cube_motion.vmd",
  "joint_orient_test.vmd",
  "test_append_bone.vmd"
] as const;

describe("parseVmd", () => {
  it.each(fixtures)("parses %s into sorted MMD animation tracks", async (fixture) => {
    const bytes = await readFile(resolve("test/fixtures", fixture));

    const animation = parseVmd(bytes);

    expect(animation.kind).toBe("vmd");
    expect((animation.metadata as { readonly format?: string }).format).toBe("vmd");
    expect(Object.keys(animation.boneTracks).length).toBeGreaterThan(0);
    expect(animation.morphTracks).toBeDefined();
    for (const frames of Object.values(animation.boneTracks)) {
      expectSortedFrames(frames);
    }
    for (const frames of Object.values(animation.morphTracks)) {
      expectSortedFrames(frames);
    }
  });

  it("loads VMD through ThreeMmdLoader without requiring a model", async () => {
    const bytes = await readFile(resolve("test/fixtures", "test_1bone_cube_motion.vmd"));
    const loader = new ThreeMmdLoader();

    await expect(loader.loadAnimation(bytes)).resolves.toMatchObject({
      source: bytes,
      animation: {
        kind: "vmd"
      }
    });
  });

  it("parses morph-only VMD that ends right after the morph section", () => {
    const animation = parseVmd(createMorphOnlyVmd());

    expect(animation.morphTracks["blink"]).toHaveLength(2);
    expect(animation.morphTracks["blink"]?.map((frame) => frame.frame)).toEqual([0, 10]);
    expect(Object.keys(animation.boneTracks)).toHaveLength(0);
    expect(animation.cameraFrames).toHaveLength(0);
    expect(animation.lightFrames).toHaveLength(0);
    expect(animation.selfShadowFrames).toHaveLength(0);
    expect(animation.propertyFrames).toHaveLength(0);
    expect(animation.metadata.counts).toMatchObject({
      bones: 0,
      morphs: 2,
      cameras: 0,
      lights: 0,
      selfShadows: 0,
      properties: 0
    });
  });

  it("parses VMD that writes camera count 0 then ends before the light section", () => {
    const animation = parseVmd(createMorphOnlyVmd({ trailingZeroCameraCount: true }));

    expect(animation.cameraFrames).toHaveLength(0);
    expect(animation.lightFrames).toHaveLength(0);
    expect(animation.metadata.counts).toMatchObject({ cameras: 0, lights: 0 });
  });

  it("ignores non-count tail bytes after optional VMD sections", () => {
    const animation = parseVmd(
      createMorphOnlyVmd({
        trailingZeroCameraCount: true,
        trailingZeroLightCount: true,
        trailingBytes: createCameraFramePayloadWithoutCount()
      })
    );

    expect(animation.morphTracks["blink"]).toHaveLength(2);
    expect(animation.cameraFrames).toHaveLength(0);
    expect(animation.lightFrames).toHaveLength(0);
    expect(animation.selfShadowFrames).toHaveLength(0);
    expect(animation.propertyFrames).toHaveLength(0);
    expect(animation.metadata.counts).toMatchObject({
      cameras: 0,
      lights: 0,
      selfShadows: 0,
      properties: 0
    });
  });

  it("reads camera interpolation in VMD channel-strided byte layout", () => {
    const animation = parseVmd(createCameraOnlyVmd());
    const interpolation = animation.cameraFrames[0]?.interpolation;

    expect(interpolation).toEqual({
      positionX: [0 / 127, 6 / 127, 12 / 127, 18 / 127],
      positionY: [1 / 127, 7 / 127, 13 / 127, 19 / 127],
      positionZ: [2 / 127, 8 / 127, 14 / 127, 20 / 127],
      rotation: [3 / 127, 9 / 127, 15 / 127, 21 / 127],
      distance: [4 / 127, 10 / 127, 16 / 127, 22 / 127],
      fov: [5 / 127, 11 / 127, 17 / 127, 23 / 127]
    });
  });

  it("reads extended property frame physics simulation bytes", () => {
    const animation = parseVmd(createPropertyOnlyVmd({ physicsSimulation: false }));
    const inventory = parseVmdSectionInventory(createPropertyOnlyVmd({ physicsSimulation: false }));

    expect(animation.propertyFrames).toEqual([
      {
        frame: 7,
        visible: true,
        physicsSimulation: false,
        ikStates: []
      }
    ]);
    expect(inventory.sections.find((section) => section.name === "property")?.byteLength).toBe(10);
    expect(inventory.trailingBytes).toBe(0);
  });

  it("keeps classic property frames physics-enabled when no physics byte is present", () => {
    const animation = parseVmd(createPropertyOnlyVmd({ physicsSimulation: undefined }));
    const inventory = parseVmdSectionInventory(createPropertyOnlyVmd({ physicsSimulation: undefined }));

    expect(animation.propertyFrames[0]).toMatchObject({
      frame: 7,
      visible: true,
      physicsSimulation: true,
      ikStates: []
    });
    expect(inventory.sections.find((section) => section.name === "property")?.byteLength).toBe(9);
    expect(inventory.trailingBytes).toBe(0);
  });
});

function expectSortedFrames(frames: readonly VmdBoneFrame[] | readonly VmdMorphFrame[]): void {
  for (let index = 1; index < frames.length; index += 1) {
    expect(frames[index]?.frame).toBeGreaterThanOrEqual(frames[index - 1]?.frame ?? 0);
  }
}

function createMorphOnlyVmd(
  options: {
    readonly trailingZeroCameraCount?: boolean;
    readonly trailingZeroLightCount?: boolean;
    readonly trailingBytes?: Uint8Array;
  } = {}
): Uint8Array {
  const bytes: number[] = [];
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const morphFrame = (name: string, frame: number, weight: number) => {
    pushFixedText(bytes, name, 15);
    u32(frame);
    f32(weight);
  };

  pushFixedText(bytes, "Vocaloid Motion Data 0002", 30);
  pushFixedText(bytes, "morph-only", 20);
  u32(0); // bone count
  u32(2); // morph count
  morphFrame("blink", 0, 0);
  morphFrame("blink", 10, 1);
  // No camera/light/self-shadow/property sections follow: stream ends here.
  if (options.trailingZeroCameraCount) {
    u32(0); // explicit camera count, then EOF before the light section
  }
  if (options.trailingZeroLightCount) {
    u32(0);
  }
  if (options.trailingBytes) {
    bytes.push(...options.trailingBytes);
  }

  return new Uint8Array(bytes);
}

function createCameraFramePayloadWithoutCount(): Uint8Array {
  const bytes: number[] = [];
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };

  u32(0);
  f32(-35);
  f32(0);
  f32(8.8);
  f32(5.1);
  f32(-0.28);
  bytes.push(...Array.from({ length: 24 }, () => 0x14));
  u32(45);
  bytes.push(0);

  return new Uint8Array(bytes);
}

function createCameraOnlyVmd(): Uint8Array {
  const bytes: number[] = [];
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };

  pushFixedText(bytes, "Vocaloid Motion Data 0002", 30);
  pushFixedText(bytes, "camera", 20);
  u32(0);
  u32(0);
  u32(1);
  u32(0);
  f32(10);
  f32(1);
  f32(2);
  f32(3);
  f32(0.1);
  f32(0.2);
  f32(0.3);
  bytes.push(...Array.from({ length: 24 }, (_, index) => index));
  u32(45);
  bytes.push(0);
  u32(0);

  return new Uint8Array(bytes);
}

function createPropertyOnlyVmd(options: { readonly physicsSimulation: boolean | undefined }): Uint8Array {
  const bytes: number[] = [];
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };

  pushFixedText(bytes, "Vocaloid Motion Data 0002", 30);
  pushFixedText(bytes, "property", 20);
  u32(0);
  u32(0);
  u32(0);
  u32(0);
  u32(0);
  u32(1);
  u32(7);
  bytes.push(1);
  if (options.physicsSimulation !== undefined) {
    bytes.push(options.physicsSimulation ? 1 : 0);
  }
  u32(0);

  return new Uint8Array(bytes);
}

function pushFixedText(bytes: number[], text: string, byteLength: number): void {
  const encoded = new TextEncoder().encode(text);
  for (let index = 0; index < byteLength; index += 1) {
    bytes.push(encoded[index] ?? 0);
  }
}
