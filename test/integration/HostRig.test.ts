import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import * as wasm from "../../src/parser/wasm/generated/mmd_anim_wasm.js";
import { MmdAnimRuntime } from "../../src/runtime/index.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../../src/physics/index.js";
import type { MmdAnimRuntimeWasmModule } from "../../src/runtime/index.js";

beforeAll(() => {
  wasm.initSync({ module: readFileSync(new URL("../../artifacts/mmd-anim/runtime/mmd_anim_wasm_bg.wasm", import.meta.url)) });
});

function fixture(physics: "none" | "external" = "none", physicsBackend?: MmdPhysicsBackend) {
  // Same protected-child/incoming-Append oracle as mmd-anim's host-rig smoke.
  const model = wasm.WasmMmdModel.withAppend(
    new Int32Array([-1, 0, 1, -1]),
    new Float32Array([0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]),
    new Uint32Array([1, 0, 1, 2, 1, 1, 3, 2, 1]),
    new Float32Array([0.5, 0.7, 1])
  );
  const runtime = new MmdAnimRuntime({ wasm: wasm as unknown as MmdAnimRuntimeWasmModule, model, physics, physicsBackend });
  const bones = Array.from({ length: 4 }, () => new THREE.Bone());
  bones[0].add(bones[1]);
  bones[1].add(bones[2]);
  bones[1].position.y = 1;
  bones[2].position.y = 1;
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(bones[0], bones[3]);
  mesh.bind(new THREE.Skeleton(bones));
  const definition = { drivenBoneIndices: new Uint32Array([0, 2]), goalBoneIndices: new Uint32Array() };
  const pose = {
    positions: new Float32Array(12), rotations: new Float32Array(16),
    scales: new Float32Array(12).fill(1), morphWeights: new Float32Array(), ikEnabled: new Uint8Array()
  };
  for (let i = 0; i < 4; i++) pose.rotations[i * 4 + 3] = 1;
  pose.rotations[2] = Math.sin(0.2); pose.rotations[3] = Math.cos(0.2);
  pose.rotations[10] = Math.sin(0.1); pose.rotations[11] = Math.cos(0.1);
  return { runtime, mesh, bones, definition, pose };
}

describe("MmdAnimRuntime host rig with actual WASM", () => {
  it.each([false, true])("restores physics for the current mesh after clearing a rig (prior VMD: %s)", priorVmd => {
    const steps: { name: string | undefined; seeking: boolean | undefined }[] = [];
    const backend: MmdPhysicsBackend = {
      name: "binding-test", disabled: false, disposed: false,
      step(context) {
        steps.push({ name: context.skeleton?.bones[0]?.name, seeking: context.seeking });
        return { simulated: false, updatedBoneCount: 0 };
      }
    };
    const first = fixture("external", backend);
    const next = fixture();
    first.bones[0].name = "old-root";
    next.bones[0].name = "current-root";
    try {
      if (priorVmd) {
        first.runtime.setAnimation({
          kind: "vmd", bytes: new Uint8Array(),
          metadata: { modelName: "", maxFrame: 0, counts: { bones: 0, morphs: 0, cameras: 0, lights: 0, selfShadows: 0, properties: 0 } },
          boneTracks: {}, morphTracks: {}, cameraFrames: [], lightFrames: [], selfShadowFrames: [], propertyFrames: []
        }, first.mesh);
        first.runtime.tick(0);
        first.runtime.tick(1);
        expect(steps.at(-1)).toEqual({ name: "old-root", seeking: false });
      }
      first.runtime.setHostRig(next.definition, next.mesh);
      first.runtime.setHostPose(next.pose);
      first.runtime.tick(2);
      expect(steps.at(-1)?.name).toBe("current-root");
      first.runtime.clearHostRig();
      const before = steps.length;
      first.runtime.tick(3);
      expect(steps).toHaveLength(before + 1);
      expect(steps.at(-1)).toEqual({ name: "current-root", seeking: true });
      first.runtime.tick(4);
      expect(steps.at(-1)).toEqual({ name: "current-root", seeking: false });
    } finally { first.runtime.dispose(); next.runtime.dispose(); }
  });

  it("preserves driven FK, evaluates helpers, converts handedness, and repeats without accumulation", () => {
    const { runtime, mesh, bones, definition, pose } = fixture();
    try {
      runtime.setHostRig(definition, mesh);
      runtime.setHostPose(pose);
      runtime.tick(0);
      expect(bones[2].matrixWorld.elements[12]).toBeCloseTo(-2 * Math.sin(0.4), 5);
      expect(bones[2].matrixWorld.elements[13]).toBeCloseTo(2 * Math.cos(0.4), 5);
      expect(bones[2].matrixWorld.elements[0]).toBeCloseTo(Math.cos(0.6), 5);
      expect(bones[3].matrixWorld.elements[0]).toBeCloseTo(Math.cos(0.2), 5);
      const first = bones.map(bone => bone.matrixWorld.elements.slice());
      for (let i = 0; i < 300; i++) runtime.tick((i % 7) / 30);
      expect(bones.map(bone => bone.matrixWorld.elements)).toEqual(first);
      pose.positions[2] = 3;
      runtime.tick(0);
      expect(bones[0].position.z).toBe(-3);
    } finally { runtime.dispose(); }
  });

  it("rejects invalid input without changing displayed pose or time and recovers", () => {
    const { runtime, mesh, bones, definition, pose } = fixture();
    try {
      runtime.setHostRig(definition, mesh);
      expect(() => runtime.tick(1)).toThrow(/base pose/);
      runtime.setHostPose(pose);
      runtime.tick(0);
      const first = bones[2].matrixWorld.elements.slice();
      expect(() => runtime.setHostRig({ ...definition, drivenBoneIndices: new Uint32Array([99]) }, mesh)).toThrow();
      runtime.tick(0);
      expect(bones[2].matrixWorld.elements).toEqual(first);
      pose.scales[0] = -1;
      expect(() => runtime.tick(2)).toThrow();
      expect(runtime.frameState().seconds).toBe(0);
      expect(bones[2].matrixWorld.elements).toEqual(first);
      pose.scales[0] = 1;
      runtime.tick(2);
      expect(bones[2].matrixWorld.elements).toEqual(first);
      runtime.resetPose();
      expect(() => runtime.tick(0)).toThrow(/base pose/);
      runtime.clearHostRig();
      expect(() => runtime.tick(0)).not.toThrow();
    } finally { runtime.dispose(); }
  });

  it("rejects external physics before configuring a host rig", () => {
    const { runtime, mesh, definition } = fixture("external");
    try { expect(() => runtime.setHostRig(definition, mesh)).toThrow(/physicsBackend/); }
    finally { runtime.dispose(); }
  });

  it("runs world writeback inside rig ownership, preserves driven children, and handles seed/off/seek", () => {
    const frames: { seeking?: boolean; delta?: number }[] = [];
    const backend: MmdPhysicsBackend = {
      name: "world-test", disabled: false, disposed: false,
      step(context) {
        frames.push({ seeking: context.seeking, delta: context.deltaSeconds });
        const output = context.output?.worldMatricesColumnMajor;
        const before = context.inputWorldMatricesColumnMajor;
        if (!output || !before) throw new Error("Missing world buffers");
        const indices = context.output?.updatedBoneIndices as number[];
        for (const index of [0, 1, 2]) {
          for (let k = 0; k < 16; k++) output[index * 16 + k] = before[index * 16 + k];
          output[index * 16 + 12] = 10;
          indices.push(index);
        }
        return { simulated: !context.seeking, updatedBoneCount: 3 };
      }
    };
    const { runtime, mesh, bones, definition, pose } = fixture("external", backend);
    try {
      runtime.setHostRig(definition, mesh);
      runtime.setHostPose(pose);
      runtime.tick(0);
      expect(bones[0].matrixWorld.elements[12]).toBe(0);
      expect(bones[1].matrixWorld.elements[12]).toBeCloseTo(10, 5);
      expect(bones[2].matrixWorld.elements[12]).toBeCloseTo(-2 * Math.sin(0.4), 5);
      runtime.tick(1 / 30);
      expect(frames[1]).toEqual({ seeking: false, delta: 1 / 30 });
      runtime.tick(2 / 30, { physics: false });
      expect(frames).toHaveLength(2);
      runtime.tick(3 / 30);
      expect(frames[2]?.seeking).toBe(true);
      runtime.tick(0);
      expect(frames[3]?.seeking).toBe(true);
      runtime.seek(10);
      runtime.tick(10);
      expect(frames[4]).toEqual({ seeking: true, delta: 0 });
    } finally { runtime.dispose(); }
  });

  it("recovers callback failures without exposing partial output and rejects missing world writes", () => {
    let mode = "valid";
    let lastSeeking: boolean | undefined;
    const backend: MmdPhysicsBackend = {
      name: "failure-test", disabled: false, disposed: false,
      step(context: MmdPhysicsStepContext) {
        lastSeeking = context.seeking;
        if (mode === "throw") throw new Error("solver failed");
        if (mode === "missing") {
          (context.output?.updatedBoneIndices as number[]).push(1);
          return { simulated: true, updatedBoneCount: 1 };
        }
        return { simulated: false, updatedBoneCount: 0 };
      }
    };
    const { runtime, mesh, bones, definition, pose } = fixture("external", backend);
    try {
      runtime.setHostRig(definition, mesh); runtime.setHostPose(pose); runtime.tick(0);
      const first = bones[2].matrixWorld.elements.slice();
      mode = "throw";
      expect(() => runtime.tick(1)).toThrow(/solver failed/);
      expect(runtime.frameState().seconds).toBe(0);
      expect(bones[2].matrixWorld.elements).toEqual(first);
      mode = "missing";
      expect(() => runtime.tick(1)).toThrow(/non-finite/);
      mode = "valid";
      runtime.tick(1);
      expect(lastSeeking).toBe(true);
      expect(bones[2].matrixWorld.elements).toEqual(first);
    } finally { runtime.dispose(); }
  });
});
