import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MmdAnimRuntime } from "../../../src/runtime/mmdAnimRuntime.js";
import init, * as wasm from "../../../src/parser/wasm/generated/mmd_anim_wasm.js";

describe("mmd-anim retained IK history", () => {
  it("preserves continuous evaluation and restarts after seek or pose reset", async () => {
    await init({ module_or_path: await readFile(new URL(
      "../../../src/parser/wasm/generated/mmd_anim_wasm_bg.wasm", import.meta.url
    )) });
    const bytes = await readFile(new URL(
      "../../../native/third_party/mmd-anim/crates/mmd-anim-format/fixtures/pmx/ik_append_history.pmx", import.meta.url
    ));
    const clip = new wasm.WasmMmdClip(new Uint32Array(), new Uint32Array(), new Float32Array(), new Uint32Array(), new Uint32Array(), new Float32Array(), new Uint32Array(), new Uint8Array(), 0);
    const runtime = MmdAnimRuntime.fromPmxBytes(wasm, bytes, { clip });
    try {
      runtime.evaluate(0);
      const first = runtime.debugState().stages.ik;
      runtime.evaluate(0);
      const continuous = runtime.debugState().stages.ik;
      expect(continuous).not.toEqual(first);
      runtime.seek(0);
      runtime.evaluate(0);
      expect(runtime.debugState().stages.ik).toEqual(first);
      expect(() => runtime.seek(Number.NaN)).toThrow();
      expect(() => runtime.seek(Number.POSITIVE_INFINITY)).toThrow();
      runtime.evaluate(0);
      expect(runtime.debugState().stages.ik).toEqual(continuous);
      runtime.resetPose();
      runtime.evaluate(0);
      expect(runtime.debugState().stages.ik).toEqual(continuous);
      const mesh = new THREE.SkinnedMesh();
      mesh.bind(new THREE.Skeleton());
      runtime.setAnimation({
        kind: "vmd", bytes: new Uint8Array(),
        metadata: { modelName: "", maxFrame: 0, counts: { bones: 0, morphs: 0, cameras: 0, lights: 0, selfShadows: 0, properties: 0 } },
        boneTracks: {}, morphTracks: {}, cameraFrames: [], lightFrames: [], selfShadowFrames: [], propertyFrames: []
      }, mesh);
      runtime.evaluate(0);
      expect(runtime.debugState().stages.ik).toEqual(first);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.skeleton.dispose();
    } finally {
      runtime.dispose();
      clip.free();
    }
  });
});
