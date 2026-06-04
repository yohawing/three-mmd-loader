import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  MmdAnimRuntime,
  exportMmdAnimWasmFormatBytes,
  exportMmdAnimWasmVmdAnimationJsonBytes,
  exportMmdAnimWasmVpdPoseJsonBytes,
  parseMmdAnimWasmFormatJson
} from "../../../src/index.js";
import type { MmdAnimRuntimeWasmModule, MmdAnimation, MmdPhysicsBackend, MmdPhysicsStepContext, MmdPhysicsStepResult } from "../../../src/index.js";

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

class FakeWasmRuntimeInstance {
  lastFrame = -1;
  private readonly worldMatrices = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 2, 3, 1
  ]);

  constructor(_model: FakeWasmModel, _morphCount: number) {}

  evaluateRestPose(): void {
    this.lastFrame = 0;
  }

  evaluateClipFrame(_clip: FakeWasmClip, frame: number): void {
    this.lastFrame = frame;
  }

  worldMatrixF32Len(): number {
    return this.worldMatrices.length;
  }

  copyWorldMatrices(out: Float32Array): boolean {
    if (out.length < this.worldMatrices.length) {
      return false;
    }
    out.set(this.worldMatrices);
    return true;
  }

  morphWeightLen(): number {
    return 0;
  }
}

function createFakeWasmModule(): FakeWasmModule {
  const createdModels: FakeWasmModel[] = [];
  const createdClips: FakeWasmClip[] = [];
  const createdRuntimes: FakeWasmRuntimeInstance[] = [];
  return {
    createdModels,
    createdClips,
    createdRuntimes,
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
    WasmMmdRuntimeInstance: class extends FakeWasmRuntimeInstance {
      constructor(model: FakeWasmModel, morphCount: number) {
        super(model, morphCount);
        createdRuntimes.push(this);
      }
    }
  };
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
