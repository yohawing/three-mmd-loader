import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  MmdAnimRuntime,
  exportMmdAnimWasmFormatBytes,
  exportMmdAnimWasmVmdAnimationJsonBytes,
  exportMmdAnimWasmVpdPoseJsonBytes,
  parseMmdAnimWasmFormatJson
} from "../../../src/index.js";
import type { MmdAnimRuntimeWasmModule, MmdAnimation, MmdPhysicsBackend, MmdPhysicsStepContext, MmdPhysicsStepResult, VmdBoneTrack } from "../../../src/index.js";

describe("MmdAnimRuntime", () => {
  it("constructs an mmd-anim wasm model from PMX bytes and evaluates frame state", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([1, 2, 3]), {
      frameRate: 60
    });

    expect(runtime.evaluate(0.5)).toEqual({
      seconds: 0.5,
      frame: 30,
      frameRate: 60
    });
    expect(wasm.createdModels[0]?.pmxBytes).toEqual([1, 2, 3]);
  });

  it("creates a clip from MmdAnimation bytes and syncs wasm world matrices to a skinned mesh", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]));
    const bone = new THREE.Bone();
    bone.name = "center";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    const animation = createMmdAnimation(new Uint8Array([0x30, 0x31]));

    runtime.setAnimation(animation, mesh);
    runtime.tick(1 / 30, { mesh, physics: false });

    expect(wasm.createdClips[0]?.vmdBytes).toEqual([0x30, 0x31]);
    expect(wasm.createdRuntimes[0]?.lastFrame).toBe(1);
    expect(renderedBoneWorldPosition(mesh, 0).toArray()).toEqual([1, 2, -3]);
  });

  it("uses direct wasm output views without copying frame buffers when available", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]));
    const mesh = createSingleBoneMesh();

    runtime.setAnimation(createMmdAnimation(new Uint8Array([0x30, 0x31])), mesh);
    runtime.tick(1 / 30, { mesh, physics: false });

    expect(wasm.createdRuntimes[0]?.copyWorldMatricesCalls).toBe(0);
    expect(wasm.createdRuntimes[0]?.copyMorphWeightsCalls).toBe(0);
    expect(renderedBoneWorldPosition(mesh, 0).toArray()).toEqual([1, 2, -3]);
  });

  it("passes optional IK solve overrides to mmd-anim wasm when configured", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]), {
      ikTolerance: 0.02,
      ikMaxIterationsCap: 12
    });
    const mesh = createSingleBoneMesh();

    runtime.setAnimation(createMmdAnimation(new Uint8Array([0x30, 0x31])), mesh);
    runtime.tick(1 / 30, { mesh, physics: false });

    expect(wasm.createdRuntimes[0]?.lastIkOptions).toEqual({
      frame: 1,
      tolerance: 0.02,
      maxIterationsCap: 12
    });
  });

  it("uses the wasm default IK tolerance when only the iteration cap is configured", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]), {
      ikMaxIterationsCap: 8
    });
    const mesh = createSingleBoneMesh();

    runtime.setAnimation(createMmdAnimation(new Uint8Array([0x30, 0x31])), mesh);
    runtime.tick(1 / 30, { mesh, physics: false });

    expect(wasm.createdRuntimes[0]?.lastIkOptions).toEqual({
      frame: 1,
      tolerance: 1.0e-2,
      maxIterationsCap: 8
    });
  });

  it("returns stable debug snapshots", () => {
    const runtime = MmdAnimRuntime.fromPmxBytes(createFakeWasmModule(), new Uint8Array([0xaa]));

    runtime.evaluate(0);
    const debug = runtime.debugState();

    expect(debug.stages.physics.worldMatricesColumnMajor.slice(12, 15)).toEqual([1, 2, 3]);
    (debug.stages.physics.worldMatricesColumnMajor as number[])[12] = 99;
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[12]).toBe(1);
  });

  it("treats synthetic empty animations as rest pose clips", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]));
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    runtime.setAnimation(createMmdAnimation(new Uint8Array()), mesh);
    runtime.evaluate(0);

    expect(wasm.createdClips).toEqual([]);
    expect(wasm.createdRuntimes[0]?.lastFrame).toBe(0);
  });

  it("exposes camera and light state even when the wasm clip is empty", () => {
    const runtime = MmdAnimRuntime.fromPmxBytes(createFakeWasmModule(), new Uint8Array([0xaa]));
    const animation = createMmdAnimation(new Uint8Array());
    animation.cameraFrames.push(
      {
        frame: 0,
        distance: 10,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        fov: 45,
        perspective: true
      },
      {
        frame: 30,
        distance: 20,
        position: [30, 0, 0],
        rotation: [0, 1, 0],
        fov: 60,
        perspective: false
      }
    );
    animation.lightFrames.push(
      { frame: 0, color: [0, 0, 1], direction: [1, 0, 0] },
      { frame: 30, color: [1, 0.5, 0.5], direction: [-1, -1, 1] }
    );

    runtime.setAnimation(animation, createSingleBoneMesh());
    runtime.evaluate(0.5);

    expect(runtime.cameraState()).toMatchObject({
      distance: 15,
      position: [15, 0, 0],
      rotation: [0, 0.5, 0],
      fov: 52.5,
      perspective: true
    });
    expect(runtime.lightState()).toEqual({
      color: [0.5, 0.25, 0.75],
      direction: [0, -0.5, 0.5]
    });
  });

  it("samples camera state through the mmd-anim wasm camera track without JSON allocation", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]));
    const animation = createMmdAnimation(createLikelyVmdBytes());
    animation.metadata.counts.cameras = 1;
    animation.cameraFrames.push({
      frame: 0,
      distance: 10,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      fov: 45,
      perspective: true
    });

    runtime.setAnimation(animation, createSingleBoneMesh());
    runtime.evaluate(0.5);
    const cameraState = runtime.cameraState();

    expect(wasm.createdCameraTracks).toHaveLength(1);
    expect(wasm.createdCameraTracks[0]?.sampledFrames).toEqual([15]);
    expect(cameraState?.distance).toBeCloseTo(-40.25);
    expect(cameraState?.position).toEqual([-0.25, 6, 1.625]);
    expect(cameraState?.rotation[0]).toBeCloseTo(-0.1);
    expect(cameraState?.rotation[1]).toBeCloseTo(-0.1);
    expect(cameraState?.rotation[2]).toBeCloseTo(0.75);
    expect(cameraState?.fov).toBeCloseTo(47.5);
    expect(cameraState?.perspective).toBe(true);
  });

  it("samples light state through the mmd-anim wasm light track", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]));
    const animation = createMmdAnimation(createLikelyVmdBytes());
    animation.metadata.counts.lights = 1;
    animation.lightFrames.push({
      frame: 0,
      color: [0, 0, 1],
      direction: [1, 0, 0]
    });

    runtime.setAnimation(animation, createSingleBoneMesh());
    runtime.evaluate(0.5);
    const lightState = runtime.lightState();

    expect(wasm.createdLightTracks).toHaveLength(1);
    expect(wasm.createdLightTracks[0]?.sampledFrames).toEqual([15]);
    expect(lightState?.color[0]).toBeCloseTo(0.125);
    expect(lightState?.color[1]).toBeCloseTo(0.5);
    expect(lightState?.color[2]).toBeCloseTo(0.875);
    expect(lightState?.direction[0]).toBeCloseTo(-0.25);
    expect(lightState?.direction[1]).toBeCloseTo(-0.5);
    expect(lightState?.direction[2]).toBeCloseTo(0.75);
  });

  it("evaluates parsed model tracks when animation bytes are not VMD bytes", () => {
    const wasm = createFakeWasmModule();
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, new Uint8Array([0xaa]));
    const animation = createMmdAnimation(new TextEncoder().encode("Vocaloid Pose Data file"));
    animation.boneTracks.center = createBoneTrack([7, 8, 9]);
    const mesh = createSingleBoneMesh();

    runtime.setAnimation(animation, mesh);
    runtime.tick(0, { mesh, physics: false });

    expect(wasm.createdClips).toEqual([]);
    expect(renderedBoneWorldPosition(mesh, 0).toArray()).toEqual([7, 8, -9]);
  });

  it("steps external physics after wasm pose evaluation", () => {
    const backend = new TranslatingPhysicsBackend([4, 5, 6]);
    const runtime = MmdAnimRuntime.fromPmxBytes(createFakeWasmModule(), new Uint8Array([0xaa]), {
      physics: "external",
      physicsBackend: backend
    });
    const mesh = createSingleBoneMesh();

    runtime.setAnimation(createMmdAnimation(new Uint8Array()), mesh);
    runtime.evaluate(1 / 30);

    expect(backend.resetCount).toBe(1);
    expect(backend.stepCount).toBe(1);
    expect(backend.lastContext?.deltaSeconds).toBeCloseTo(1 / 30);
    expect(mesh.skeleton.bones[0]?.position.toArray()).toEqual([4, 5, -6]);
    expect(runtime.debugRigidBodyWorldTransformsColumnMajor()).toEqual([backend.debugMatrix]);
  });

  it("calls mmd-anim wasm parser and exporter helpers without package coupling", () => {
    const wasm = createFakeWasmModule();
    const bytes = new Uint8Array([1, 2, 3]);

    expect(parseMmdAnimWasmFormatJson(wasm, bytes, "motion.vmd")).toEqual({
      kind: "vmd",
      fileName: "motion.vmd",
      byteLength: 3
    });
    expect(Array.from(exportMmdAnimWasmFormatBytes(wasm, bytes, "motion.vmd"))).toEqual([
      3, 2, 1
    ]);
    expect(Array.from(exportMmdAnimWasmVmdAnimationJsonBytes(wasm, "{\"kind\":\"vmd\"}"))).toEqual([
      0x56, 0x4d, 0x44
    ]);
    expect(Array.from(exportMmdAnimWasmVpdPoseJsonBytes(wasm, "{\"kind\":\"vpd\"}"))).toEqual([
      0x56, 0x50, 0x44
    ]);
  });

  it("throws clear errors when parser/exporter helpers are missing", () => {
    expect(() => parseMmdAnimWasmFormatJson({}, new Uint8Array())).toThrow(
      /parseMmdFormatJson/
    );
    expect(() => exportMmdAnimWasmFormatBytes({}, new Uint8Array())).toThrow(
      /exportMmdFormatBytes/
    );
    expect(() => exportMmdAnimWasmVmdAnimationJsonBytes({}, "{}")).toThrow(
      /exportVmdAnimationJsonBytes/
    );
    expect(() => exportMmdAnimWasmVpdPoseJsonBytes({}, "{}")).toThrow(
      /exportVpdPoseJsonBytes/
    );
  });
});

interface FakeWasmModule extends MmdAnimRuntimeWasmModule {
  readonly createdModels: FakeWasmModel[];
  readonly createdClips: FakeWasmClip[];
  readonly createdRuntimes: FakeWasmRuntimeInstance[];
  readonly createdCameraTracks: FakeWasmCameraTrack[];
  readonly createdLightTracks: FakeWasmLightTrack[];
}

class FakeWasmModel {
  readonly pmxBytes: number[];

  constructor(bytes: Uint8Array) {
    this.pmxBytes = Array.from(bytes);
  }

  boneCount(): number {
    return 1;
  }

  morphCount(): number {
    return 0;
  }
}

class FakeWasmClip {
  readonly vmdBytes: number[];

  constructor(_model: FakeWasmModel, bytes: Uint8Array) {
    this.vmdBytes = Array.from(bytes);
  }
}

class FakeWasmCameraTrack {
  readonly vmdBytes: number[];
  readonly sampledFrames: number[] = [];

  constructor(bytes: Uint8Array) {
    this.vmdBytes = Array.from(bytes);
  }

  frameCount(): number {
    return 2;
  }

  sample(frame: number, out: Float32Array): boolean {
    this.sampledFrames.push(frame);
    if (out.length < 9) {
      return false;
    }
    out.set([-40.25, -0.25, 6, 1.625, -0.1, -0.1, 0.75, 47.5, 1]);
    return true;
  }
}

class FakeWasmLightTrack {
  readonly vmdBytes: number[];
  readonly sampledFrames: number[] = [];

  constructor(bytes: Uint8Array) {
    this.vmdBytes = Array.from(bytes);
  }

  frameCount(): number {
    return 2;
  }

  sample(frame: number, out: Float32Array): boolean {
    this.sampledFrames.push(frame);
    if (out.length < 6) {
      return false;
    }
    out.set([0.125, 0.5, 0.875, -0.25, -0.5, 0.75]);
    return true;
  }
}

class FakeWasmRuntimeInstance {
  lastFrame = -1;
  lastIkOptions:
    | { frame: number; tolerance: number; maxIterationsCap: number }
    | undefined;
  copyWorldMatricesCalls = 0;
  copyMorphWeightsCalls = 0;
  private readonly worldMatrices = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 2, 3, 1
  ]);
  private readonly morphWeights = new Float32Array();

  constructor(_model: FakeWasmModel, _morphCount: number) {}

  evaluateRestPose(): void {
    this.lastFrame = 0;
  }

  evaluateClipFrame(_clip: FakeWasmClip, frame: number): void {
    this.lastFrame = frame;
  }

  evaluateClipFrameWithIkOptions(
    _clip: FakeWasmClip,
    frame: number,
    tolerance: number,
    maxIterationsCap: number
  ): void {
    this.lastFrame = frame;
    this.lastIkOptions = { frame, tolerance, maxIterationsCap };
  }

  worldMatrixF32Len(): number {
    return this.worldMatrices.length;
  }

  copyWorldMatrices(out: Float32Array): boolean {
    this.copyWorldMatricesCalls += 1;
    if (out.length < this.worldMatrices.length) {
      return false;
    }
    out.set(this.worldMatrices);
    return true;
  }

  worldMatricesView(): Float32Array {
    return this.worldMatrices;
  }

  morphWeightLen(): number {
    return this.morphWeights.length;
  }

  copyMorphWeights(out: Float32Array): boolean {
    this.copyMorphWeightsCalls += 1;
    if (out.length < this.morphWeights.length) {
      return false;
    }
    out.set(this.morphWeights);
    return true;
  }

  morphWeightsView(): Float32Array {
    return this.morphWeights;
  }
}

function createFakeWasmModule(): FakeWasmModule {
  const createdModels: FakeWasmModel[] = [];
  const createdClips: FakeWasmClip[] = [];
  const createdRuntimes: FakeWasmRuntimeInstance[] = [];
  const createdCameraTracks: FakeWasmCameraTrack[] = [];
  const createdLightTracks: FakeWasmLightTrack[] = [];
  return {
    createdModels,
    createdClips,
    createdRuntimes,
    createdCameraTracks,
    createdLightTracks,
    parseMmdFormatJson(data, fileName) {
      return JSON.stringify({
        kind: "vmd",
        fileName,
        byteLength: data.byteLength
      });
    },
    exportMmdFormatBytes(data) {
      return data.slice().reverse();
    },
    exportVmdAnimationJsonBytes(_json) {
      return new Uint8Array([0x56, 0x4d, 0x44]);
    },
    exportVpdPoseJsonBytes(_json) {
      return new Uint8Array([0x56, 0x50, 0x44]);
    },
    WasmMmdModel: {
      fromPmxBytes(bytes) {
        const model = new FakeWasmModel(bytes);
        createdModels.push(model);
        return model;
      }
    },
    WasmMmdClip: {
      fromVmdBytesForModel(model, bytes) {
        const clip = new FakeWasmClip(model as FakeWasmModel, bytes);
        createdClips.push(clip);
        return clip;
      }
    },
    WasmVmdCameraTrack: {
      fromVmdBytes(bytes) {
        const track = new FakeWasmCameraTrack(bytes);
        createdCameraTracks.push(track);
        return track;
      }
    },
    WasmVmdLightTrack: {
      fromVmdBytes(bytes) {
        const track = new FakeWasmLightTrack(bytes);
        createdLightTracks.push(track);
        return track;
      }
    },
    WasmMmdRuntimeInstance: class extends FakeWasmRuntimeInstance {
      constructor(model: FakeWasmModel, morphCount: number) {
        super(model, morphCount);
        createdRuntimes.push(this);
      }
    }
  };
}

function createLikelyVmdBytes(): Uint8Array {
  const bytes = new TextEncoder().encode("Vocaloid Motion Data 0002");
  const padded = new Uint8Array(30);
  padded.set(bytes.subarray(0, padded.length));
  return padded;
}

function createMmdAnimation(bytes: Uint8Array): MmdAnimation {
  return {
    kind: "vmd",
    bytes,
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

function createBoneTrack(translation: readonly [number, number, number]): VmdBoneTrack {
  return {
    packed: "bone",
    frames: new Uint32Array([0]),
    translations: new Float32Array(translation),
    rotations: new Float32Array([0, 0, 0, 1]),
    interpolations: new Float32Array(16),
    physicsToggles: new Int8Array([-1])
  };
}

class TranslatingPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "test-custom-external";
  readonly disabled = false;
  readonly disposed = false;
  readonly debugMatrix = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    4, 5, 6, 1
  ] as const;
  resetCount = 0;
  stepCount = 0;
  lastContext: MmdPhysicsStepContext | undefined;

  constructor(private readonly translation: readonly [number, number, number]) {}

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    this.stepCount += 1;
    this.lastContext = context;
    context.output?.translations?.set(this.translation, 0);
    context.output?.updatedBoneIndices?.push(0);
    return { simulated: true };
  }

  reset(): void {
    this.resetCount += 1;
  }

  debugRigidBodyWorldTransformsColumnMajor(): readonly (readonly number[])[] {
    return [this.debugMatrix];
  }
}

function createSingleBoneMesh(): THREE.SkinnedMesh {
  const bone = new THREE.Bone();
  bone.name = "center";
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  return mesh;
}

function renderedBoneWorldPosition(mesh: THREE.SkinnedMesh, boneIndex: number): THREE.Vector3 {
  const bone = mesh.skeleton.bones[boneIndex];
  const position = new THREE.Vector3();
  mesh.updateMatrixWorld(true);
  bone.updateWorldMatrix(true, false);
  return position.setFromMatrixPosition(bone.matrixWorld);
}
