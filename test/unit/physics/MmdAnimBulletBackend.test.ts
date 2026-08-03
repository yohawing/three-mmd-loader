import { describe, expect, it } from "vitest";

import {
  createMmdAnimBulletPhysicsBackend,
  type MmdAnimBulletModule
} from "../../../src/physics/mmdAnimBullet.js";
import {
  createCustomBulletMmdPhysicsBackend,
  type CustomBulletMmdModule
} from "../../../src/physics/customBulletMmd.js";
import { legacyMmdEulerToQuaternion } from "../../../src/physics/legacyPhysicsBridge.js";

function makeFakeModule() {
  const buffer = new ArrayBuffer(1 << 16);
  const heap = new Float32Array(buffer);
  const heapU8 = new Uint8Array(buffer);
  const heapU32 = new Uint32Array(buffer);
  let next = 256;
  let created = 0;
  let destroyed = 0;
  let resetCount = 0;
  let settleCount = 0;
  let contactCount = 0;
  let stepHook: (() => void) | undefined;
  const stepCalls: Array<[number, number, number]> = [];
  const setBodyCalls: Array<{ index: number; position: [number, number, number] }> = [];
  const bodies: Array<{ position: [number, number, number]; rotation: [number, number, number, number] }> = [];
  const rigidBodyRotations: Array<[number, number, number]> = [];
  const jointRotations: Array<[number, number, number]> = [];
  const freedPointers: number[] = [];
  const contactCalls: Array<{ outContacts: number; capacity: number }> = [];
  const module: MmdAnimBulletModule = {
    HEAPF32: heap,
    HEAPU8: heapU8,
    HEAPU32: heapU32,
    _malloc(size) { const pointer = next; next += Math.max(8, size); return pointer; },
    _free(pointer) { freedPointers.push(pointer); },
    refreshMemoryViews() {},
    _mmd_anim_bullet_world_create(out) { heapU32[out >>> 2] = 64; created += 1; return 0; },
    _mmd_anim_bullet_world_destroy() { destroyed += 1; },
    _mmd_anim_bullet_world_reset() { resetCount += 1; return 0; },
    _mmd_anim_bullet_world_settle_to_current() { settleCount += 1; return 0; },
    _mmd_anim_bullet_world_step(_world, delta, maxSubSteps, fixedSubstepSeconds) {
      stepCalls.push([delta, maxSubSteps, fixedSubstepSeconds]);
      stepHook?.();
      return 0;
    },
    _mmd_anim_bullet_world_add_rigidbody(_world, descriptor, out) {
      const index = descriptor >>> 2;
      rigidBodyRotations.push([heap[index + 7] ?? 0, heap[index + 8] ?? 0, heap[index + 9] ?? 0]);
      const position: [number, number, number] = [heap[index + 4] ?? 0, heap[index + 5] ?? 0, heap[index + 6] ?? 0];
      heapU32[out >>> 2] = bodies.length;
      bodies.push({ position, rotation: [0, 0, 0, 1] });
      return 0;
    },
    _mmd_anim_bullet_world_get_rigidbody_transform(_world, index, position, rotation) {
      const body = bodies[index];
      if (!body) return 2;
      heap.set(body.position, position >>> 2);
      heap.set(body.rotation, rotation >>> 2);
      return 0;
    },
    _mmd_anim_bullet_world_set_rigidbody_transform(_world, index, position, rotation) {
      const body = bodies[index];
      if (!body) return 2;
      const nextPosition: [number, number, number] = [heap[position >>> 2] ?? 0, heap[(position >>> 2) + 1] ?? 0, heap[(position >>> 2) + 2] ?? 0];
      body.position = nextPosition;
      setBodyCalls.push({ index, position: nextPosition });
      body.rotation = [heap[rotation >>> 2] ?? 0, heap[(rotation >>> 2) + 1] ?? 0, heap[(rotation >>> 2) + 2] ?? 0, heap[(rotation >>> 2) + 3] ?? 1];
      return 0;
    },
    _mmd_anim_bullet_world_add_6dof_spring_joint(_world, descriptor, out) {
      const index = descriptor >>> 2;
      jointRotations.push([heap[index + 5] ?? 0, heap[index + 6] ?? 0, heap[index + 7] ?? 0]);
      heapU32[out >>> 2] = jointRotations.length - 1;
      return 0;
    },
    _mmd_anim_bullet_world_collect_contacts(_world, outContacts, capacity, outCount) {
      contactCalls.push({ outContacts, capacity });
      heapU32[outCount >>> 2] = contactCount;
      if (outContacts !== 0 && capacity > 0) {
        const heapI32 = new Int32Array(buffer);
        const base = outContacts >>> 2;
        heapI32[base] = 3;
        heapI32[base + 1] = 7;
        heap[base + 2] = -0.25;
        heap.set([1, 2, 3], base + 3);
        heap.set([4, 5, 6], base + 6);
        heap.set([0, 1, 0], base + 9);
      }
      return 0;
    }
  };
  return {
    module,
    bodies,
    rigidBodyRotations,
    jointRotations,
    stepCalls,
    setBodyCalls,
    contactCalls,
    freedPointers,
    get created() { return created; },
    get destroyed() { return destroyed; },
    get resetCount() { return resetCount; },
    get settleCount() { return settleCount; },
    setContactCount(count: number) { contactCount = count; },
    setStepHook(hook: (() => void) | undefined) { stepHook = hook; }
  };
}

describe("mmd-anim Bullet physics backend", () => {
  it("collects native Bullet contacts and forwards them through the compatibility backend", () => {
    const fake = makeFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(fake.module);
    fake.setContactCount(1);

    expect(backend.debugContactCount?.()).toBe(1);
    expect(backend.debugPhysicsContacts?.()).toEqual([{
      rigidBodyIndexA: 3,
      rigidBodyIndexB: 7,
      distance: -0.25,
      positionWorldOnA: [1, 2, 3],
      positionWorldOnB: [4, 5, 6],
      normalWorldOnB: [0, 1, 0]
    }]);
    expect(backend.debugPhysicsContacts?.()).toHaveLength(1);
    expect(fake.contactCalls).toEqual([
      { outContacts: 0, capacity: 0 },
      { outContacts: 0, capacity: 0 },
      expect.objectContaining({ capacity: 1 }),
      { outContacts: 0, capacity: 0 },
      expect.objectContaining({ capacity: 1 })
    ]);

    const contactBufferPointer = fake.contactCalls[2]?.outContacts;
    backend.dispose?.();
    expect(fake.freedPointers).toContain(contactBufferPointer);
    expect(backend.debugContactCount?.()).toBe(0);
    expect(backend.debugPhysicsContacts?.()).toEqual([]);
  });

  it("returns no contacts when the native module does not expose contact collection", () => {
    const fake = makeFakeModule();
    delete fake.module._mmd_anim_bullet_world_collect_contacts;
    const backend = createMmdAnimBulletPhysicsBackend(fake.module);

    expect(backend.debugContactCount?.()).toBe(0);
    expect(backend.debugPhysicsContacts?.()).toEqual([]);
  });

  it("uploads rotations in the native Bullet ZYX encoding", () => {
    const fake = makeFakeModule();
    const backend = createMmdAnimBulletPhysicsBackend(fake.module);
    const bodyEuler: [number, number, number] = [-0.56019646, -0.6526938, 0.9633895];
    const jointEuler: [number, number, number] = [0.4, -0.7, 0.9];

    backend.step({
      seconds: 0,
      deltaSeconds: 0,
      frame: 0,
      frameRate: 30,
      skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [0, 0, 0] }] },
      rigidBodies: [{
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0, 0] },
        localTranslation: [0, 0, 0],
        localRotation: legacyMmdEulerToQuaternion(bodyEuler),
        mass: 1
      }],
      joints: [{
        index: 0,
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 0,
        rotation: legacyMmdEulerToQuaternion(jointEuler),
        linearLimit: { lower: [0, 0, 0], upper: [0, 0, 0] },
        angularLimit: { lower: [0, 0, 0], upper: [0, 0, 0] }
      }]
    });

    expect(nativeBulletEulerToQuaternion(fake.rigidBodyRotations[0] ?? [0, 0, 0]))
      .toEqual(expectQuatCloseTo(legacyMmdEulerToQuaternion(bodyEuler)));
    expect(nativeBulletEulerToQuaternion(fake.jointRotations[0] ?? [0, 0, 0]))
      .toEqual(expectQuatCloseTo(legacyMmdEulerToQuaternion(jointEuler)));
    backend.dispose();
  });

  it("runs behind the stable Custom Bullet API and reuses caller buffers", () => {
    const fake = makeFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(
      fake.module as unknown as CustomBulletMmdModule
    );
    const layout = {
      boneCount: 2,
      translationValueCount: 6,
      rotationValueCount: 8,
      worldMatrixValueCount: 32
    };

    const first = backend.acquireStepBuffers(layout);
    const second = backend.acquireStepBuffers(layout);

    expect(backend.name).toBe("custom-bullet-mmd");
    expect(first).toBe(second);
    expect(first?.inputTranslations).toHaveLength(6);
    expect(first?.bonePhysicsToggles).toHaveLength(2);
    backend.dispose?.();
    expect(backend.disposed).toBe(true);
  });

  it("uploads PMX bind-space body positions without double-applying bone rest translation", () => {
    const fake = makeFakeModule();
    const backend = createMmdAnimBulletPhysicsBackend(fake.module);
    const inputWorld = new Float32Array(16);
    inputWorld[0] = inputWorld[5] = inputWorld[10] = inputWorld[15] = 1;
    inputWorld[12] = 1; inputWorld[13] = 2; inputWorld[14] = 3;
    const outputWorld = new Float32Array(16);
    const outputTranslations = new Float32Array(3);
    const updated = new Uint32Array(1);
    const result = backend.step({
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 30,
      skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [1, 2, 3] }] },
      rigidBodies: [{
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0, 0] },
        localTranslation: [4, 5, 6],
        localRotation: [0, 0, 0, 1],
        mass: 1
      }],
      inputWorldMatricesColumnMajor: inputWorld,
      output: { worldMatricesColumnMajor: outputWorld, translations: outputTranslations, updatedBoneIndices: updated }
    });
    expect(fake.bodies[0]?.position).toEqual([4, 5, 6]);
    expect(outputTranslations).toEqual(new Float32Array([1, 2, 3]));
    expect(updated[0]).toBe(0);
    expect(result.simulated).toBe(false);
    expect(fake.stepCalls).toEqual([]);
  });

  it("converts physics bone world poses back to parent-local output poses", () => {
    const fake = makeFakeModule();
    const backend = createMmdAnimBulletPhysicsBackend(fake.module);
    const inputWorld = new Float32Array(32);
    for (let boneIndex = 0; boneIndex < 2; boneIndex += 1) {
      const base = boneIndex * 16;
      inputWorld[base] = inputWorld[base + 5] = inputWorld[base + 10] = inputWorld[base + 15] = 1;
    }
    inputWorld[12] = 10;
    inputWorld[28] = 12;
    const outputWorld = new Float32Array(32);
    const outputTranslations = new Float32Array(6);
    const outputRotations = new Float32Array(8);
    const updatedBoneIndices: number[] = [];

    const result = backend.step({
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 30,
      skeleton: {
        bones: [
          { index: 0, parentIndex: -1, restTranslation: [10, 0, 0] },
          { index: 1, parentIndex: 0, restTranslation: [12, 0, 0] }
        ]
      },
      rigidBodies: [
        {
          index: 0,
          boneIndex: 0,
          motionType: "dynamic",
          shape: { type: "sphere", size: [0.5, 0, 0] },
          localTranslation: [10, 0, 0],
          localRotation: [0, 0, 0, 1],
          mass: 1
        },
        {
          index: 1,
          boneIndex: 1,
          motionType: "dynamic",
          shape: { type: "sphere", size: [0.5, 0, 0] },
          localTranslation: [12, 0, 0],
          localRotation: [0, 0, 0, 1],
          mass: 1
        }
      ],
      inputWorldMatricesColumnMajor: inputWorld,
      output: {
        worldMatricesColumnMajor: outputWorld,
        translations: outputTranslations,
        rotations: outputRotations,
        updatedBoneIndices
      }
    });

    expect(Array.from(outputTranslations)).toEqual([10, 0, 0, 2, 0, 0]);
    expect(outputWorld[12]).toBe(10);
    expect(outputWorld[28]).toBe(12);
    expect(Array.from(updatedBoneIndices)).toEqual([0, 1]);
    expect(result).toEqual({ simulated: false, updatedBoneCount: 2 });
  });

  it("re-seeds all bodies, re-pins static bodies, and reads dynamic outputs on reset", () => {
    const fake = makeFakeModule();
    const backend = createMmdAnimBulletPhysicsBackend(fake.module);
    const inputWorld = new Float32Array(16 * 3);
    const outputWorld = new Float32Array(16 * 3);
    const inputTranslations = new Float32Array([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9
    ]);
    const outputTranslations = new Float32Array(inputTranslations);
    const inputRotations = new Float32Array(4 * 3);
    const outputRotations = new Float32Array(4 * 3);
    const updatedBoneIndices = new Uint32Array(3);
    for (let boneIndex = 0; boneIndex < 3; boneIndex += 1) {
      const base = boneIndex * 16;
      inputWorld[base] = 1;
      inputWorld[base + 5] = 1;
      inputWorld[base + 10] = 1;
      inputWorld[base + 15] = 1;
      inputWorld[base + 12] = inputTranslations[boneIndex * 3] ?? 0;
      inputWorld[base + 13] = inputTranslations[boneIndex * 3 + 1] ?? 0;
      inputWorld[base + 14] = inputTranslations[boneIndex * 3 + 2] ?? 0;
    }
    const context = {
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 60,
      skeleton: {
        bones: [
          { index: 0, parentIndex: -1, restTranslation: [0, 0, 0] },
          { index: 1, parentIndex: -1, restTranslation: [0, 0, 0] },
          { index: 2, parentIndex: -1, restTranslation: [0, 0, 0] }
        ]
      },
      rigidBodies: [
        { index: 0, boneIndex: 0, motionType: "static" as const, shape: { type: "sphere" as const, size: [0.5, 0.5, 0.5] }, localTranslation: [0, 0, 0], localRotation: [0, 0, 0, 1] },
        { index: 1, boneIndex: 1, motionType: "dynamicWithBone" as const, shape: { type: "sphere" as const, size: [0.5, 0.5, 0.5] }, localTranslation: [0, 0, 0], localRotation: [0, 0, 0, 1], mass: 1 },
        { index: 2, boneIndex: 2, motionType: "dynamic" as const, shape: { type: "sphere" as const, size: [0.5, 0.5, 0.5] }, localTranslation: [0, 0, 0], localRotation: [0, 0, 0, 1], mass: 1 }
      ],
      joints: [],
      inputTranslations,
      inputRotations,
      inputWorldMatricesColumnMajor: inputWorld,
      output: { worldMatricesColumnMajor: outputWorld, translations: outputTranslations, rotations: outputRotations, updatedBoneIndices },
      bonePhysicsToggles: new Uint8Array([1, 1, 1])
    };
    backend.step(context);
    // Initial model seeding feeds all bodies from the animation pose.
    expect(fake.setBodyCalls.map((call) => call.index)).toEqual([0, 1, 2]);

    inputTranslations.set([
      11, 12, 13,
      14, 15, 16,
      17, 18, 19
    ]);
    for (let boneIndex = 0; boneIndex < 3; boneIndex += 1) {
      const base = boneIndex * 16;
      inputWorld[base + 12] = inputTranslations[boneIndex * 3] ?? 0;
      inputWorld[base + 13] = inputTranslations[boneIndex * 3 + 1] ?? 0;
      inputWorld[base + 14] = inputTranslations[boneIndex * 3 + 2] ?? 0;
    }
    backend.reset();
    const result = backend.step(context);
    expect(result.simulated).toBe(false);
    expect(fake.resetCount).toBe(2);
    expect(fake.settleCount).toBe(2);
    expect(fake.stepCalls).toEqual([]);
    expect(fake.setBodyCalls.slice(3).map((call) => call.index)).toEqual([0, 1, 2]);
    expect(fake.setBodyCalls[3]?.position).toEqual([11, 12, 13]);
    expect(fake.setBodyCalls[4]?.position).toEqual([14, 15, 16]);
    expect(fake.setBodyCalls[5]?.position).toEqual([17, 18, 19]);
    expect(Array.from(outputTranslations.slice(3, 9))).toEqual([14, 15, 16, 17, 18, 19]);

    backend.dispose();
    backend.dispose();
    expect(fake.created).toBe(1);
    expect(fake.destroyed).toBe(1);
    expect(backend.disposed).toBe(true);
    expect(backend.step({ seconds: 0, deltaSeconds: 0, frame: 0, frameRate: 30 }).simulated).toBe(false);
  });

  it("keeps physics-disabled dynamic bodies on the animation pose without readback", () => {
    const fake = makeFakeModule();
    const backend = createMmdAnimBulletPhysicsBackend(fake.module);
    const inputWorld = new Float32Array(16);
    inputWorld[0] = inputWorld[5] = inputWorld[10] = inputWorld[15] = 1;
    inputWorld[12] = 10;
    inputWorld[13] = 20;
    inputWorld[14] = 30;
    const outputTranslations = new Float32Array([91, 92, 93]);

    const result = backend.step({
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 60,
      skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [0, 0, 0] }] },
      rigidBodies: [{
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        localTranslation: [0, 0, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1
      }],
      inputWorldMatricesColumnMajor: inputWorld,
      output: { translations: outputTranslations, updatedBoneIndices: new Uint32Array(1) },
      bonePhysicsToggles: new Uint8Array([0])
    });

    expect(fake.setBodyCalls).toEqual([{ index: 0, position: [10, 20, 30] }]);
    expect(Array.from(outputTranslations)).toEqual([91, 92, 93]);
    expect(result).toEqual({ simulated: false, updatedBoneCount: 0 });
  });
});

function nativeBulletEulerToQuaternion([x, y, z]: readonly [number, number, number]): [number, number, number, number] {
  const halfX = x * 0.5;
  const halfY = y * 0.5;
  const halfZ = z * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

function expectQuatCloseTo(expected: readonly number[]) {
  return expected.map((value) => expect.closeTo(value, 5));
}
