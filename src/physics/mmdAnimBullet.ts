import { Matrix4, Quaternion, Vector3 } from "three";
import type {
  MmdPhysicsDiagnostic,
  MmdPhysicsMutableIndexBuffer,
  MmdPhysicsMutableNumericBuffer,
  MmdPhysicsNumericBuffer,
  MmdPhysicsResetContext,
  MmdPhysicsBackend,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult
} from "./index.js";

export interface MmdAnimBulletModule {
  readonly HEAPF32?: Float32Array;
  readonly HEAPU8?: Uint8Array;
  readonly HEAPU32?: Uint32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _mmd_anim_bullet_world_create(outWorld: number): number;
  _mmd_anim_bullet_world_destroy(world: number): void;
  _mmd_anim_bullet_world_reset(world: number): number;
  _mmd_anim_bullet_world_settle_to_current(world: number): number;
  _mmd_anim_bullet_world_step(world: number, delta: number, maxSubSteps: number, fixed: number): number;
  _mmd_anim_bullet_world_add_rigidbody(world: number, descriptor: number, outIndex: number): number;
  _mmd_anim_bullet_world_get_rigidbody_transform(world: number, index: number, position: number, rotation: number): number;
  _mmd_anim_bullet_world_set_rigidbody_transform(world: number, index: number, position: number, rotation: number): number;
  _mmd_anim_bullet_world_add_6dof_spring_joint(world: number, descriptor: number, outIndex: number): number;
  _mmd_anim_bullet_world_collect_contacts?(world: number, outContacts: number, capacity: number, outCount: number): number;
  _mmd_anim_bullet_world_get_rigidbody_count?(world: number): number;
  _mmd_anim_bullet_world_get_constraint_count?(world: number): number;
  refreshMemoryViews?(): void;
}

export function createMmdAnimBulletPhysicsBackend(
  module: MmdAnimBulletModule,
  options: { fixedTimeStep?: number; maxSubSteps?: number } = {}
): MmdPhysicsBackend {
  return new MmdAnimBulletPhysicsBackend(module, options);
}

const RIGID_BODY_DESC_BYTES = 64;
const JOINT_DESC_BYTES = 104;

class MmdAnimBulletPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "mmd-anim-bullet";
  readonly disabled = false;
  private world = 0;
  private disposedState = false;
  private modelKey: object | undefined;
  private pendingReset = false;
  private bodyCount = 0;
  private readonly bodyBoneIndices: number[] = [];
  private readonly bodyModes: string[] = [];
  private readonly bodyFromBone: Matrix4[] = [];
  private readonly boneFromBody: Matrix4[] = [];
  private targetWorldMatrices = new Float32Array(0);
  private targetWorldUpdated = new Uint8Array(0);
  private readonly scratchBone = new Matrix4();
  private readonly scratchBody = new Matrix4();
  private readonly scratchParent = new Matrix4();
  private readonly scratchLocal = new Matrix4();
  private readonly scratchScale = new Vector3(1, 1, 1);
  private readonly scratchTranslation = new Vector3();
  private readonly scratchRotation = new Quaternion();
  private readonly scratchPosition = new Float32Array(3);
  private readonly scratchQuaternion = new Float32Array(4);
  private readonly outWorldPointer: number;
  private readonly outIndexPointer: number;
  private readonly transformPositionPointer: number;
  private readonly transformRotationPointer: number;

  constructor(private readonly module: MmdAnimBulletModule, private readonly options: { fixedTimeStep?: number; maxSubSteps?: number }) {
    this.outWorldPointer = module._malloc(4);
    this.outIndexPointer = module._malloc(4);
    this.transformPositionPointer = module._malloc(12);
    this.transformRotationPointer = module._malloc(16);
    if (module._mmd_anim_bullet_world_create(this.outWorldPointer) !== 0) {
      module._free(this.outWorldPointer);
      module._free(this.outIndexPointer);
      module._free(this.transformPositionPointer);
      module._free(this.transformRotationPointer);
      throw new Error("Failed to create mmd-anim Bullet world.");
    }
    this.module.refreshMemoryViews?.();
    this.world = this.module.HEAPU32?.[this.outWorldPointer >>> 2] ?? 0;
    if (this.world === 0) {
      throw new Error("mmd-anim Bullet world creation returned a null handle.");
    }
  }

  get disposed(): boolean { return this.disposedState; }

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    if (this.disposedState) return { simulated: false, diagnostics: this.diagnostics() };
    if (!this.ensureModel(context)) {
      return { simulated: false, diagnostics: [{ level: "error", code: "PHYSICS_BACKEND_MODEL_UPLOAD_FAILED", message: "Failed to upload MMD model to mmd-anim Bullet." }] };
    }
    const inputWorld = context.inputWorldMatricesColumnMajor;
    const toggles = context.bonePhysicsToggles;
    if (inputWorld && !this.pendingReset && context.seeking !== true) {
      this.feedBodies(inputWorld, toggles, false, true);
    }
    if (this.pendingReset || context.seeking === true) {
      this.module._mmd_anim_bullet_world_reset(this.world);
      if (inputWorld) this.feedBodies(inputWorld, undefined, true, true);
      if (this.module._mmd_anim_bullet_world_step(this.world, 1 / 60, 2, 1 / 120) !== 0) {
        return { simulated: false, diagnostics: [{ level: "error", code: "PHYSICS_BACKEND_STEP_FAILED", message: "mmd-anim Bullet reset step failed." }] };
      }
      if (inputWorld) this.feedBodies(inputWorld, undefined, false, false);
      this.module._mmd_anim_bullet_world_settle_to_current(this.world);
      this.pendingReset = false;
    } else if (this.module._mmd_anim_bullet_world_step(this.world, Math.max(0, context.deltaSeconds), this.options.maxSubSteps ?? 5, this.options.fixedTimeStep ?? 1 / 60) !== 0) {
      return { simulated: false, diagnostics: [{ level: "error", code: "PHYSICS_BACKEND_STEP_FAILED", message: "mmd-anim Bullet step failed." }] };
    }
    const updated = this.copyDynamicOutputs(context, toggles);
    return { simulated: updated > 0, updatedBoneCount: updated };
  }

  reset(_context?: MmdPhysicsResetContext): void {
    if (!this.disposedState) this.pendingReset = true;
  }

  dispose(): void {
    if (this.disposedState) return;
    this.module._mmd_anim_bullet_world_destroy(this.world);
    this.module._free(this.outWorldPointer);
    this.module._free(this.outIndexPointer);
    this.module._free(this.transformPositionPointer);
    this.module._free(this.transformRotationPointer);
    this.world = 0;
    this.disposedState = true;
  }

  diagnostics(): readonly MmdPhysicsDiagnostic[] {
    return this.disposedState
      ? [{ level: "warning", code: "PHYSICS_BACKEND_DISPOSED", message: "mmd-anim Bullet physics backend has been disposed." }]
      : [];
  }

  private ensureModel(context: MmdPhysicsStepContext): boolean {
    const bodies = context.rigidBodies;
    if (!bodies) return true;
    const joints = context.joints ?? [];
    const key = bodies as object;
    if (this.modelKey === key) return true;
    if (this.modelKey !== undefined || this.bodyCount > 0) this.recreateWorld();
    this.bodyCount = bodies.length;
    this.bodyBoneIndices.length = 0;
    this.bodyModes.length = 0;
    this.bodyFromBone.length = 0;
    this.boneFromBody.length = 0;
    let maxBoneIndex = -1;
    for (const body of bodies) {
      maxBoneIndex = Math.max(maxBoneIndex, body.boneIndex ?? -1);
    }
    const boneCount = Math.max(context.skeleton?.bones.length ?? 0, maxBoneIndex + 1);
    this.targetWorldMatrices = new Float32Array(boneCount * 16);
    this.targetWorldUpdated = new Uint8Array(boneCount);
    const bodyPtr = this.module._malloc(RIGID_BODY_DESC_BYTES);
    this.module.refreshMemoryViews?.();
    try {
      for (const body of bodies) {
        this.module.refreshMemoryViews?.();
        const heap = this.module.HEAPF32;
        if (!heap) return false;
        const heapI32 = new Int32Array(heap.buffer);
        const base = bodyPtr >>> 2;
        heapI32[base] = body.shape.type === "box" ? 1 : body.shape.type === "capsule" ? 2 : 0;
        heap.set(body.shape.size, base + 1);
        const bone = context.skeleton?.bones[body.boneIndex ?? -1];
        const rest = bone?.restTranslation ?? [0, 0, 0];
        const bodyPosition = body.localTranslation ?? [0, 0, 0];
        heap.set(bodyPosition, base + 4);
        const localRotation = body.localRotation ?? [0, 0, 0, 1];
        const localEuler = quaternionToEuler(localRotation);
        writeVec3(heap, base + 7, localEuler);
        heap[base + 10] = body.motionType === "static" ? 0 : (body.mass ?? 0);
        heap[base + 11] = body.linearDamping ?? 0;
        heap[base + 12] = body.angularDamping ?? 0;
        heap[base + 13] = body.friction ?? 0.5;
        heap[base + 14] = body.restitution ?? 0;
        const heapU16 = new Uint16Array(heap.buffer);
        heapU16[(bodyPtr + 60) >>> 1] = body.collisionGroup ?? 0;
        heapU16[(bodyPtr + 62) >>> 1] = body.collisionMask ?? 0xffff;
        if (this.module._mmd_anim_bullet_world_add_rigidbody(this.world, bodyPtr, this.outIndexPointer) !== 0) return false;
        this.module.refreshMemoryViews?.();
        this.bodyBoneIndices.push(body.boneIndex ?? -1);
        this.bodyModes.push(body.motionType);
        const bodyBind = new Matrix4().compose(
          new Vector3(bodyPosition[0] ?? 0, bodyPosition[1] ?? 0, bodyPosition[2] ?? 0),
          new Quaternion(...(body.localRotation ?? [0, 0, 0, 1])),
          this.scratchScale
        );
        const boneBind = new Matrix4().makeTranslation(rest[0] ?? 0, rest[1] ?? 0, rest[2] ?? 0);
        const bodyFromBone = boneBind.clone().invert().multiply(bodyBind);
        this.bodyFromBone.push(bodyFromBone);
        this.boneFromBody.push(bodyBind.clone().invert().multiply(boneBind));
      }
      const jointPtr = this.module._malloc(JOINT_DESC_BYTES);
      this.module.refreshMemoryViews?.();
      try {
        for (const joint of joints) {
          this.module.refreshMemoryViews?.();
          const heap = this.module.HEAPF32;
          if (!heap) return false;
          const j = jointPtr >>> 2;
          heap.fill(0, j, j + JOINT_DESC_BYTES / 4);
          const heapI32 = new Int32Array(heap.buffer);
          heapI32[j] = joint.rigidBodyIndexA;
          heapI32[j + 1] = joint.rigidBodyIndexB;
          writeVec3(heap, j + 2, joint.translation ?? [0, 0, 0]);
          writeVec3(heap, j + 5, quaternionToEuler(joint.rotation ?? [0, 0, 0, 1]));
          writeVec3(heap, j + 8, joint.linearLimit?.lower ?? [0, 0, 0]);
          writeVec3(heap, j + 11, joint.linearLimit?.upper ?? [0, 0, 0]);
          writeVec3(heap, j + 14, joint.angularLimit?.lower ?? [0, 0, 0]);
          writeVec3(heap, j + 17, joint.angularLimit?.upper ?? [0, 0, 0]);
          writeVec3(heap, j + 20, joint.spring?.linear ?? [0, 0, 0]);
          writeVec3(heap, j + 23, joint.spring?.angular ?? [0, 0, 0]);
          if (this.module._mmd_anim_bullet_world_add_6dof_spring_joint(this.world, jointPtr, this.outIndexPointer) !== 0) return false;
        }
      } finally { this.module._free(jointPtr); }
      this.modelKey = key;
      return true;
    } finally { this.module._free(bodyPtr); }
  }

  private recreateWorld(): void {
    if (this.world !== 0) this.module._mmd_anim_bullet_world_destroy(this.world);
    this.module.refreshMemoryViews?.();
    if (this.module._mmd_anim_bullet_world_create(this.outWorldPointer) !== 0) {
      this.world = 0;
      return;
    }
    this.module.refreshMemoryViews?.();
    this.world = this.module.HEAPU32?.[this.outWorldPointer >>> 2] ?? 0;
    this.modelKey = undefined;
    this.bodyCount = 0;
  }

  private feedBodies(
    input: MmdPhysicsNumericBuffer,
    toggles: readonly boolean[] | Uint8Array | undefined,
    includeDynamic: boolean,
    includeDynamicWithBone: boolean
  ): void {
    const heap = this.module.HEAPF32;
    if (!heap) return;
    for (let i = 0; i < this.bodyCount; i += 1) {
      const mode = this.bodyModes[i];
      const boneIndex = this.bodyBoneIndices[i] ?? -1;
      if (boneIndex < 0) continue;
      const physicsEnabled = toggles === undefined || toggles[boneIndex] !== 0;
      const shouldFeed =
        mode === "static" ||
        !physicsEnabled ||
        (includeDynamicWithBone && mode === "dynamicWithBone") ||
        (includeDynamic && mode === "dynamic");
      if (!shouldFeed) continue;
      const bodyFromBone = this.bodyFromBone[i];
      if (!bodyFromBone) continue;
      this.scratchBone.fromArray(input as ArrayLike<number>, boneIndex * 16);
      this.scratchBody.multiplyMatrices(this.scratchBone, bodyFromBone);
      this.scratchBody.decompose(this.scratchTranslation, this.scratchRotation, this.scratchScale);
      this.scratchPosition[0] = this.scratchTranslation.x; this.scratchPosition[1] = this.scratchTranslation.y; this.scratchPosition[2] = this.scratchTranslation.z;
      this.scratchQuaternion[0] = this.scratchRotation.x; this.scratchQuaternion[1] = this.scratchRotation.y; this.scratchQuaternion[2] = this.scratchRotation.z; this.scratchQuaternion[3] = this.scratchRotation.w;
      heap.set(this.scratchPosition, this.transformPositionPointer >>> 2);
      heap.set(this.scratchQuaternion, this.transformRotationPointer >>> 2);
      this.module._mmd_anim_bullet_world_set_rigidbody_transform(this.world, i, this.transformPositionPointer, this.transformRotationPointer);
    }
  }

  private copyDynamicOutputs(
    context: MmdPhysicsStepContext,
    toggles: readonly boolean[] | Uint8Array | undefined
  ): number {
    const output = context.output;
    if (!output) return 0;
    this.targetWorldUpdated.fill(0);

    // Pass 1: read every dynamic body once and cache its target bone world pose.
    // Keeping this separate from local conversion makes parent lookup independent
    // of rigid-body ordering and lets duplicate bodies for one bone collapse to one
    // updated index.
    for (let i = 0; i < this.bodyCount; i += 1) {
      if (this.bodyModes[i] === "static") continue;
      const boneIndex = this.bodyBoneIndices[i] ?? -1;
      if (
        boneIndex < 0 ||
        boneIndex >= this.targetWorldUpdated.length ||
        this.targetWorldUpdated[boneIndex] !== 0 ||
        (toggles !== undefined && toggles[boneIndex] === 0)
      ) continue;
      if (this.module._mmd_anim_bullet_world_get_rigidbody_transform(this.world, i, this.transformPositionPointer, this.transformRotationPointer) !== 0) continue;
      const heap = this.module.HEAPF32; if (!heap) continue;
      this.scratchTranslation.fromArray(heap, this.transformPositionPointer >>> 2);
      this.scratchRotation.set(heap[(this.transformRotationPointer >>> 2)], heap[(this.transformRotationPointer >>> 2) + 1], heap[(this.transformRotationPointer >>> 2) + 2], heap[(this.transformRotationPointer >>> 2) + 3]);
      const boneFromBody = this.boneFromBody[i];
      if (!boneFromBody) continue;
      this.scratchBody.compose(this.scratchTranslation, this.scratchRotation, this.scratchScale);
      this.scratchBone.multiplyMatrices(this.scratchBody, boneFromBody);
      const worldOffset = boneIndex * 16;
      writeNumeric16(this.targetWorldMatrices, worldOffset, this.scratchBone.elements);
      if (output.worldMatricesColumnMajor) writeNumeric16(output.worldMatricesColumnMajor, worldOffset, this.scratchBone.elements);
      this.targetWorldUpdated[boneIndex] = 1;
    }

    // Pass 2: convert each target world pose to the bone's local pose using the
    // physics-updated parent world when available, otherwise the animation input.
    let updated = 0;
    const inputWorld = context.inputWorldMatricesColumnMajor;
    const bones = context.skeleton?.bones;
    for (let boneIndex = 0; boneIndex < this.targetWorldUpdated.length; boneIndex += 1) {
      if (this.targetWorldUpdated[boneIndex] === 0) continue;
      const worldOffset = boneIndex * 16;
      this.scratchBone.fromArray(this.targetWorldMatrices, worldOffset);
      const parentIndex = bones?.[boneIndex]?.parentIndex ?? -1;
      if (parentIndex >= 0 && parentIndex < this.targetWorldUpdated.length && this.targetWorldUpdated[parentIndex] !== 0) {
        this.scratchParent.fromArray(this.targetWorldMatrices, parentIndex * 16);
      } else if (parentIndex >= 0 && inputWorld && parentIndex * 16 + 15 < inputWorld.length) {
        this.scratchParent.fromArray(inputWorld as ArrayLike<number>, parentIndex * 16);
      } else {
        this.scratchParent.identity();
      }
      this.scratchParent.invert();
      this.scratchLocal.multiplyMatrices(this.scratchParent, this.scratchBone);
      if (output.translations) {
        const p = this.scratchLocal.elements;
        writeNumeric3(output.translations, boneIndex * 3, p[12] ?? 0, p[13] ?? 0, p[14] ?? 0);
      }
      if (output.rotations) {
        this.scratchLocal.decompose(this.scratchTranslation, this.scratchRotation, this.scratchScale);
        const q = this.scratchRotation;
        writeNumeric4(output.rotations, boneIndex * 4, q.x, q.y, q.z, q.w);
      }
      if (output.updatedBoneIndices) writeIndex(output.updatedBoneIndices, updated, boneIndex);
      updated += 1;
    }
    return updated;
  }
}

function writeVec3(target: Float32Array, offset: number, values: readonly number[]): void { target[offset] = values[0] ?? 0; target[offset + 1] = values[1] ?? 0; target[offset + 2] = values[2] ?? 0; }
function writeNumeric3(target: MmdPhysicsMutableNumericBuffer, offset: number, x: number, y: number, z: number): void {
  if (offset < target.length) target[offset] = x;
  if (offset + 1 < target.length) target[offset + 1] = y;
  if (offset + 2 < target.length) target[offset + 2] = z;
}
function writeNumeric4(target: MmdPhysicsMutableNumericBuffer, offset: number, x: number, y: number, z: number, w: number): void {
  if (offset < target.length) target[offset] = x;
  if (offset + 1 < target.length) target[offset + 1] = y;
  if (offset + 2 < target.length) target[offset + 2] = z;
  if (offset + 3 < target.length) target[offset + 3] = w;
}
function writeNumeric16(target: MmdPhysicsMutableNumericBuffer, offset: number, values: ArrayLike<number>): void {
  for (let index = 0; index < 16 && offset + index < target.length; index += 1) target[offset + index] = values[index] ?? 0;
}
function writeIndex(target: MmdPhysicsMutableIndexBuffer, offset: number, value: number): void {
  if (Array.isArray(target) || offset < target.length) target[offset] = value;
}
function quaternionToEuler(q: readonly number[]): [number, number, number] {
  const x = q[0] ?? 0, y = q[1] ?? 0, z = q[2] ?? 0, w = q[3] ?? 1;
  const sinr = 2 * (w * x + y * z), cosr = 1 - 2 * (x * x + y * y); const roll = Math.atan2(sinr, cosr);
  const sinp = 2 * (w * y - z * x); const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const siny = 2 * (w * z + x * y), cosy = 1 - 2 * (y * y + z * z); return [roll, pitch, Math.atan2(siny, cosy)];
}
