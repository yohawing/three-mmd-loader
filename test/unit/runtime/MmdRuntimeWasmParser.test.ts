import { describe, expect, it } from "vitest";

import {
  exportMmdRuntimeWasmVmdAnimationJsonBytes,
  exportMmdRuntimeWasmVpdPoseJsonBytes,
  loadMmdRuntimeWasmVmd,
  loadMmdRuntimeWasmVpd,
  mmdRuntimeWasmVmdDtoToAnimation,
  mmdRuntimeWasmVpdDtoToPose
} from "../../../src/index.js";

describe("mmd-runtime wasm parser adapter", () => {
  it("maps VMD parser DTOs into existing packed MmdAnimation tracks", () => {
    const animation = mmdRuntimeWasmVmdDtoToAnimation(createVmdDto(), new Uint8Array([1, 2]));
    const arm = animation.boneTracks.arm;
    const blink = animation.morphTracks.blink;

    expect(animation.bytes).toEqual(new Uint8Array([1, 2]));
    expect(animation.metadata).toEqual({
      modelName: "miku",
      counts: {
        bones: 2,
        morphs: 1,
        cameras: 1,
        lights: 1,
        selfShadows: 1,
        properties: 1
      },
      maxFrame: 20
    });
    expect(Array.from(arm.frames)).toEqual([5, 10]);
    expect(Array.from(arm.translations)).toEqual([0, 1, 0, 1, 2, 3]);
    expect(Array.from(arm.rotations)).toEqual([0, 0, 0, 1, 0, 0.5, 0, 0.5]);
    expect(arm.interpolations[0]).toBeCloseTo(20 / 127);
    expect(Array.from(blink.frames)).toEqual([7]);
    expect(Array.from(blink.weights)).toEqual([0.75]);
    expect(animation.cameraFrames[0]).toMatchObject({ frame: 9, fov: 45, perspective: true });
    expect(animation.lightFrames[0]?.color).toEqual([1, 0.5, 0.25]);
    expect(animation.selfShadowFrames[0]).toEqual({ frame: 11, mode: 1, distance: 0.6 });
    expect(animation.propertyFrames[0]).toEqual({
      frame: 12,
      visible: true,
      physicsSimulation: false,
      ikStates: [{ boneName: "leg IK_L", enabled: false }]
    });
  });

  it("maps VPD parser DTOs into existing MmdPose records", () => {
    const pose = mmdRuntimeWasmVpdDtoToPose(
      {
        format: "vpd",
        modelFile: "model.pmx",
        boneCount: 1,
        bones: [
          {
            name: "center",
            translation: [1, 2, 3],
            rotation: [0, 0, 0, 1]
          }
        ]
      },
      new Uint8Array([3, 4])
    );

    expect(pose.kind).toBe("vpd");
    expect(pose.bytes).toEqual(new Uint8Array([3, 4]));
    expect(pose.metadata).toEqual({ modelFile: "model.pmx", boneCount: 1, morphCount: 0 });
    expect(pose.bones.center).toEqual({
      name: "center",
      translation: [1, 2, 3],
      rotation: [0, 0, 0, 1]
    });
  });

  it("loads VMD/VPD DTOs from structural mmd-runtime wasm modules", () => {
    const wasm = {
      parseMmdFormatJson(_data: Uint8Array, fileName?: string | null): string {
        return JSON.stringify(fileName?.endsWith(".vpd") ? createVpdDto() : createVmdDto());
      }
    };

    expect(loadMmdRuntimeWasmVmd(wasm, new Uint8Array([1]), "motion.vmd").metadata.modelName).toBe("miku");
    expect(loadMmdRuntimeWasmVpd(wasm, new Uint8Array([2]), "pose.vpd").metadata.modelFile).toBe("model.pmx");
  });

  it("roundtrips DTO JSON through structural mmd-runtime wasm exporters", () => {
    const wasm = {
      exportVmdAnimationJsonBytes(json: string): Uint8Array {
        expect(JSON.parse(json)).toMatchObject({ kind: "vmd" });
        return new Uint8Array([0x56, 0x4d, 0x44]);
      },
      exportVpdPoseJsonBytes(json: string): Uint8Array {
        expect(JSON.parse(json)).toMatchObject({ format: "vpd" });
        return new Uint8Array([0x56, 0x50, 0x44]);
      }
    };

    expect(Array.from(exportMmdRuntimeWasmVmdAnimationJsonBytes(wasm, JSON.stringify(createVmdDto())))).toEqual([
      0x56, 0x4d, 0x44
    ]);
    expect(Array.from(exportMmdRuntimeWasmVpdPoseJsonBytes(wasm, JSON.stringify(createVpdDto())))).toEqual([
      0x56, 0x50, 0x44
    ]);
  });
});

function createVmdDto() {
  return {
    kind: "vmd",
    metadata: {
      modelName: "miku",
      counts: {
        bones: 2,
        morphs: 1,
        cameras: 1,
        lights: 1,
        selfShadows: 1,
        properties: 1
      },
      maxFrame: 20
    },
    boneFrames: [
      {
        boneName: "arm",
        frame: 10,
        translation: [1, 2, 3],
        rotation: [0, 0.5, 0, 0.5],
        interpolation: new Array(64).fill(20)
      },
      {
        boneName: "arm",
        frame: 5,
        translation: [0, 1, 0],
        rotation: [0, 0, 0, 1],
        interpolation: new Array(64).fill(20)
      }
    ],
    morphFrames: [{ morphName: "blink", frame: 7, weight: 0.75 }],
    cameraFrames: [
      {
        frame: 9,
        distance: 30,
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        interpolation: new Array(24).fill(30),
        fov: 45,
        perspective: true
      }
    ],
    lightFrames: [{ frame: 10, color: [1, 0.5, 0.25], direction: [-1, -0.5, -0.25] }],
    selfShadowFrames: [{ frame: 11, mode: 1, distance: 0.6 }],
    propertyFrames: [
      {
        frame: 12,
        visible: true,
        physicsSimulation: false,
        ikStates: [{ boneName: "leg IK_L", enabled: false }]
      }
    ]
  } as const;
}

function createVpdDto() {
  return {
    format: "vpd",
    modelFile: "model.pmx",
    boneCount: 1,
    bones: [{ name: "center", translation: [1, 2, 3], rotation: [0, 0, 0, 1] }]
  } as const;
}
