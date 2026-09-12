import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { beforeAll, expect, it } from "vitest";
import * as THREE from "three";
import * as wasm from "../../src/parser/wasm/generated/mmd_anim_wasm.js";
import { MmdAnimRuntime } from "../../src/runtime/index.js";
import type { MmdAnimRuntimeWasmModule } from "../../src/runtime/index.js";
import { createMmdAnimBulletPhysicsBackend } from "../../src/physics/mmdAnimBullet.js";
import type { MmdAnimBulletModule } from "../../src/physics/mmdAnimBullet.js";

let bullet: MmdAnimBulletModule;
beforeAll(async () => {
  wasm.initSync({ module: readFileSync(new URL("../../artifacts/mmd-anim/runtime/mmd_anim_wasm_bg.wasm", import.meta.url)) });
  const scriptPath = resolve("artifacts/mmd-anim/bullet/mmd_bullet.js");
  const record = { exports: {} as (options: unknown) => Promise<MmdAnimBulletModule> };
  vm.runInNewContext(readFileSync(scriptPath, "utf8"), {
    module: record, exports: record.exports, require: createRequire(import.meta.url),
    __dirname: dirname(scriptPath), __filename: scriptPath, console, process, WebAssembly
  });
  bullet = await record.exports({ locateFile: (path: string) => resolve(dirname(scriptPath), path) });
});

it.each(["dynamic", "dynamicBone"])("runs real Bullet %s through host ownership and repeatable reset", mode => {
  const model = new wasm.WasmMmdModel(new Int32Array([-1, 0]), new Float32Array([0, 10, 0, 0, 2, 0]));
  let protectedBodyY = 10;
  const backend = createMmdAnimBulletPhysicsBackend({
    ...bullet,
    _mmd_anim_bullet_world_get_rigidbody_transform(world, index, position, rotation) {
      const status = bullet._mmd_anim_bullet_world_get_rigidbody_transform(world, index, position, rotation);
      if (status === 0 && index === 0) protectedBodyY = bullet.HEAPF32?.[(position >>> 2) + 1] ?? NaN;
      return status;
    }
  });
  const runtime = new MmdAnimRuntime({ wasm: wasm as unknown as MmdAnimRuntimeWasmModule, model, physics: "external", physicsBackend: backend });
  const root = new THREE.Bone(); root.position.y = 10;
  const child = new THREE.Bone(); child.position.y = 2; root.add(child);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(root); mesh.bind(new THREE.Skeleton([root, child]));
  mesh.userData.mmdPhysics = {
    rigidBodies: [0, 1].map(index => ({
      boneIndex: index, group: 0, mask: 0, shape: "sphere", size: [0.1, 0.1, 0.1],
      position: [0, 10 + index * 2, 0], rotation: [0, 0, 0], mass: 1,
      linearDamping: 0, angularDamping: 0, restitution: 0, friction: 0,
      mode: index === 0 ? "dynamic" : mode
    })), joints: []
  };
  const pose = { positions: new Float32Array(6), rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]), scales: new Float32Array(6).fill(1), morphWeights: new Float32Array(), ikEnabled: new Uint8Array() };
  try {
    runtime.setHostRig({ drivenBoneIndices: new Uint32Array([0]), goalBoneIndices: new Uint32Array() }, mesh);
    runtime.setHostPose(pose);
    runtime.tick(0);
    expect(child.matrixWorld.elements[13]).toBeCloseTo(12, 5);
    for (let frame = 1; frame <= 30; frame++) runtime.tick(frame / 60);
    expect(root.matrixWorld.elements[13]).toBeCloseTo(10, 5);
    const end = child.matrixWorld.elements[13];
    if (mode === "dynamic") expect(end).toBeLessThan(11.5);
    else expect(end).toBeCloseTo(12, 5);
    expect(protectedBodyY).toBeLessThan(9.5);
    runtime.seek(0); runtime.tick(0);
    expect(child.matrixWorld.elements[13]).toBeCloseTo(12, 5);
    for (let frame = 1; frame <= 30; frame++) runtime.tick(frame / 60);
    expect(child.matrixWorld.elements[13]).toBeCloseTo(end, 5);
  } finally { runtime.dispose(); backend.dispose?.(); }
});
