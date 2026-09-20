import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import * as wasm from "../../src/parser/wasm/generated/mmd_anim_wasm.js";
import { DefaultMmdRuntime, MmdAnimRuntime } from "../../src/runtime/index.js";
import type { MmdAnimation } from "../../src/parser/index.js";
import { ThreeMmdLoader, disposeMmdModel } from "../../src/three/index.js";
import { createWorkerMmdRuntimeFactory, type MmdRuntimeWorkerLike } from "../../src/worker/index.js";

beforeAll(() => {
  wasm.initSync({ module: readFileSync(new URL("../../artifacts/mmd-anim/runtime/mmd_anim_wasm_bg.wasm", import.meta.url)) });
});

function model() {
  return wasm.WasmMmdModel.withMorphs(
    new Int32Array([-1, -1]), new Float32Array(6), new Float32Array(), new Int32Array(),
    new Uint32Array(), new Float32Array(), new Uint32Array(), new Float32Array(),
    new Uint32Array([1, 0, 2]), new Float32Array([2]), 2,
    new Uint32Array([1, 0]), new Float32Array([0, 1, 0, 0, 0, 0, 1]),
    new Uint32Array([0, 1]), new Float32Array([0.5])
  );
}

function animation(): MmdAnimation {
  return {
    kind: "vmd", bytes: new Uint8Array(),
    metadata: { modelName: "", maxFrame: 0, counts: { bones: 0, morphs: 1, cameras: 0, lights: 0, selfShadows: 0, properties: 0 } },
    boneTracks: {}, morphTracks: { group: { packed: "morph", frames: new Uint32Array([0]), weights: new Float32Array([0.8]) } },
    cameraFrames: [], lightFrames: [], selfShadowFrames: [], propertyFrames: []
  };
}

function mesh() {
  const bones = [new THREE.Bone(), new THREE.Bone()];
  bones[1].userData.mmdAppendTransform = { parentIndex: 0, weight: 2 };
  bones[1].userData.mmdFlags = { appendTranslate: true };
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(...bones);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.morphTargetDictionary = { group: 0, bone: 1 };
  mesh.morphTargetInfluences = [0, 0];
  mesh.userData.mmdMorphs = [
    { type: "group", groupOffsets: [{ morphIndex: 1, weight: 0.5 }] },
    { type: "bone", groupOffsets: [], boneOffsets: [{ boneIndex: 0, translation: [0, 1, 0], rotation: [0, 0, 0, 1] }] }
  ];
  return mesh;
}

describe("manual morph overrides", () => {
  it.each([false, true])("preserves normal IK settings with a no-op override (clip: %s)", withClip => {
    for (const settings of [{}, { ikMaxIterationsCap: 8 }, { ikTolerance: 0.002 }]) {
      const source = wasm.WasmMmdModel.withMorphs(
        new Int32Array([-1, 0, 1, -1]), new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0.005, 0]),
        new Float32Array(), new Int32Array(), new Uint32Array([3, 2, 0, 1, 16]), new Float32Array([1]),
        new Uint32Array([0, 0]), new Float32Array(6), new Uint32Array(), new Float32Array(),
        1, new Uint32Array(), new Float32Array(), new Uint32Array(), new Float32Array()
      );
      const clip = withClip ? new wasm.WasmMmdClip(new Uint32Array(), new Uint32Array(), new Float32Array(),
        new Uint32Array(), new Uint32Array(), new Float32Array(), new Uint32Array(), new Uint8Array(), 0) : undefined;
      const runtime = new MmdAnimRuntime({ wasm, model: source, clip, ...settings });
      try {
        runtime.evaluate(0);
        const before = runtime.debugState().stages.ik.worldMatricesColumnMajor;
        if (!("ikMaxIterationsCap" in settings)) expect(before[45]).toBeGreaterThan(0.004);
        runtime.evaluate(0, { morphOverrides: { indices: new Uint32Array([0]), weights: new Float32Array([0]) } });
        expect(runtime.debugState().stages.ik.worldMatricesColumnMajor).toEqual(before);
      } finally { runtime.dispose(); clip?.free(); }
    }
  });

  it.each(["sync", "worker", "fallback"])("forwards model updates and releases through %s", async backend => {
    const workerFactory = createWorkerMmdRuntimeFactory({
      sharedMemory: "disabled",
      workerFactory: () => {
        if (backend === "fallback") throw new Error("test worker unavailable");
        return new Worker(resolve("dist/worker/node-entry.js"), { type: "module" }) as unknown as MmdRuntimeWorkerLike;
      }
    });
    const loader = new ThreeMmdLoader({ runtimeFactory: context => {
      const source = mesh();
      context.mesh.morphTargetDictionary = source.morphTargetDictionary;
      context.mesh.morphTargetInfluences = [0, 0];
      context.mesh.userData.mmdMorphs = source.userData.mmdMorphs;
      return backend === "sync" ? new DefaultMmdRuntime() : workerFactory(context);
    } });
    const loaded = await loader.loadModel(readFileSync(resolve("test/fixtures/test_1bone_cube.pmx")), { outline: false });
    const before = loaded.mesh.skeleton.bones[0].position.y;
    loaded.setAnimation(animation());
    const overrides = { indices: new Uint32Array([0]), weights: new Float32Array([1]) };
    try {
      await loaded.runtime.whenReady?.();
      loaded.update(0, { morphOverrides: overrides, physics: false });
      if (backend !== "worker") {
        expect(loaded.mesh.morphTargetInfluences).toEqual([1, 0.5]);
      }
      await loaded.updateAsync(0, { morphOverrides: overrides, physics: false });
      expect(loaded.mesh.morphTargetInfluences).toEqual([1, 0.5]);
      expect(loaded.mesh.skeleton.bones[0].position.y).toBeCloseTo(before + 0.5);
      await loaded.updateAsync(0, { physics: false });
      expect(loaded.mesh.morphTargetInfluences?.[0]).toBeCloseTo(0.8);
    } finally { disposeMmdModel(loaded); }
  });

  it("applies host overrides without modifying caller-owned pose weights", () => {
    const runtime = new MmdAnimRuntime({ wasm, model: model() });
    const boundMesh = mesh();
    const pose = {
      positions: new Float32Array(6), rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      scales: new Float32Array(6).fill(1), morphWeights: new Float32Array([0.8, 0]), ikEnabled: new Uint8Array()
    };
    try {
      runtime.setHostRig({ drivenBoneIndices: new Uint32Array(), goalBoneIndices: new Uint32Array() }, boundMesh);
      runtime.setHostPose(pose);
      runtime.tick(0, { morphOverrides: { indices: new Uint32Array([0]), weights: new Float32Array([1]) } });
      expect(boundMesh.morphTargetInfluences).toEqual([1, 0.5]);
      expect(pose.morphWeights[0]).toBeCloseTo(0.8);
      runtime.tick(0);
      expect(boundMesh.morphTargetInfluences?.[0]).toBeCloseTo(0.8);
    } finally { runtime.dispose(); }
  });
  it("evaluates clip and rest overrides with actual WASM and restores sampled weights", () => {
    const clip = new wasm.WasmMmdClip(new Uint32Array(), new Uint32Array(), new Float32Array(),
      new Uint32Array([0, 0, 1]), new Uint32Array([0]), new Float32Array([0.8]), new Uint32Array(), new Uint8Array(), 0);
    const runtime = new MmdAnimRuntime({ wasm, model: model(), clip });
    const overrides = { indices: new Uint32Array([0, 1]), weights: new Float32Array([0.5, 0.25]) };
    try {
      for (let i = 0; i < 3; i++) {
        runtime.evaluate(i / 30, { morphOverrides: overrides });
        expect(runtime.debugState().stages.ik.morphWeights).toEqual([0.5, 0.5]);
        expect(runtime.debugState().stages.ik.worldMatricesColumnMajor[29]).toBe(1);
      }
      runtime.evaluate(0);
      expect(runtime.debugState().stages.ik.morphWeights[0]).toBeCloseTo(0.8);
      runtime.clearAnimation();
      runtime.evaluate(0, { morphOverrides: overrides });
      expect(runtime.debugState().stages.ik.morphWeights).toEqual([0.5, 0.5]);
      runtime.evaluate(0);
      expect(runtime.debugState().stages.ik.morphWeights).toEqual([0, 0]);
    } finally { runtime.dispose(); clip.free(); }
  });

  it.each(["javascript", "parsed-wasm"])("handles override/release and rest poses through %s", backend => {
    const runtime = backend === "javascript" ? new DefaultMmdRuntime() : new MmdAnimRuntime({ wasm, model: model() });
    const boundMesh = mesh();
    runtime.setAnimation(animation(), boundMesh);
    const overrides = { indices: new Uint32Array([0, 1]), weights: new Float32Array([0.5, 0.25]) };
    try {
      for (let i = 0; i < 3; i++) {
        runtime.tick(0, { mesh: boundMesh, morphOverrides: overrides });
        expect(boundMesh.morphTargetInfluences).toEqual([0.5, 0.5]);
        expect(boundMesh.skeleton.bones[0].position.y).toBe(0.5);
        expect(boundMesh.skeleton.bones[1].position.y).toBe(1);
      }
      overrides.weights.fill(0);
      runtime.evaluate(0, { morphOverrides: overrides });
      expect(boundMesh.skeleton.bones[0].position.y).toBe(0);
      runtime.evaluate(0);
      expect(boundMesh.skeleton.bones[0].position.y).toBeCloseTo(0.4);
      runtime.clearAnimation();
      overrides.weights[0] = 1;
      runtime.evaluate(0, { morphOverrides: overrides });
      expect(boundMesh.skeleton.bones[0].position.y).toBe(0.5);
      runtime.evaluate(0);
      expect(boundMesh.skeleton.bones[0].position.y).toBe(0);
    } finally { if (runtime instanceof MmdAnimRuntime) runtime.dispose(); }
  });

  it("rejects invalid WASM input without modifying output", () => {
    const source = model();
    const runtime = wasm.WasmMmdRuntimeInstance.forModel(source);
    try {
      runtime.evaluateRestPoseWithMorphOverrides(new Uint32Array([0]), new Float32Array([1]), 0.01, 0, true);
      const before = runtime.morphWeights();
      for (const [indices, weights] of [[new Uint32Array([0, 2]), new Float32Array([0, 1])],
        [new Uint32Array([0]), new Float32Array([NaN])], [new Uint32Array([0]), new Float32Array()]]) {
        expect(() => runtime.evaluateRestPoseWithMorphOverrides(indices as Uint32Array, weights as Float32Array, 0.01, 0, true)).toThrow();
        expect(runtime.morphWeights()).toEqual(before);
      }
    } finally { runtime.free(); source.free(); }
  });

  it("rejects render-only indices and invalid weights before changing the JS pose", () => {
    const runtime = new DefaultMmdRuntime();
    const boundMesh = mesh();
    runtime.setAnimation(animation(), boundMesh);
    runtime.evaluate(0);
    // A render split adds an influence, but not another PMX morph.
    boundMesh.morphTargetInfluences?.push(0);
    const before = boundMesh.skeleton.bones[0].position.y;
    const invalid = [
      { indices: new Uint32Array([2]), weights: new Float32Array([1]) },
      { indices: new Uint32Array([0]), weights: new Float32Array([NaN]) },
      { indices: new Uint32Array([0]), weights: new Float32Array() }
    ];
    for (const morphOverrides of invalid) {
      expect(() => runtime.evaluate(1, { morphOverrides })).toThrow();
      expect(runtime.frameState().seconds).toBe(0);
      expect(boundMesh.skeleton.bones[0].position.y).toBe(before);
    }
  });

  it("keeps old WASM usable but rejects unsupported overrides explicitly", () => {
    const source = model();
    const oldWasm = {
      WasmMmdRuntimeInstance: class extends wasm.WasmMmdRuntimeInstance {
        static forModel(model: wasm.WasmMmdModel) {
          const instance = wasm.WasmMmdRuntimeInstance.forModel(model);
          Object.defineProperty(instance, "evaluateRestPoseWithMorphOverrides", { value: undefined });
          return instance;
        }
      }
    };
    const runtime = new MmdAnimRuntime({ wasm: oldWasm, model: source });
    try {
      runtime.evaluate(0);
      expect(() => runtime.evaluate(1, { morphOverrides: { indices: new Uint32Array([0]), weights: new Float32Array([1]) } })).toThrow(/rebuilt/);
      expect(runtime.frameState().seconds).toBe(0);
      runtime.evaluate(1);
    } finally { runtime.dispose(); }
  });
});
