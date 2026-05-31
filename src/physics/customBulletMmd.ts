import type {
  MmdDirectBufferPhysicsBackend,
  MmdPhysicsDiagnostic,
  MmdPhysicsMatrix4ColumnMajorTuple,
  MmdPhysicsMutableIndexBuffer,
  MmdPhysicsMutableNumericBuffer,
  MmdPhysicsNumericBuffer,
  MmdPhysicsResetContext,
  MmdPhysicsStepBufferLayout,
  MmdPhysicsStepBuffers,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult
} from "./index.js";

export const customBulletMmdScriptPath = "./mmd/yw_mmd_bullet.js";

export interface CustomBulletMmdLoaderOptions {
  readonly baseUrl?: string;
  readonly scriptUrl?: string;
  readonly timeoutMs?: number;
}

export interface CustomBulletMmdPhysicsBackendOptions {
  readonly fixedTimeStep?: number;
  readonly maxSubSteps?: number;
  readonly resetCatchUpSteps?: number;
  readonly dynamicWithBoneRotationFeedbackScale?: number;
  readonly collisionMargin?: number;
  readonly solverIterations?: number;
  readonly splitImpulse?: boolean;
  readonly splitImpulsePenetrationThreshold?: number;
}

export interface CustomBulletMmdModule {
  readonly HEAPF32?: Float32Array;
  readonly HEAPU8?: Uint8Array;
  readonly HEAPU32?: Uint32Array;
  refreshMemoryViews?(): void;
  _yw_mmd_bullet_create_world(): number;
  _yw_mmd_bullet_destroy_world(world: number): void;
  _yw_mmd_bullet_ensure_step_buffers(world: number, boneCount: number): number;
  _yw_mmd_bullet_begin_model(world: number, rigidBodyCount: number, modelIdentity: number): number;
  _yw_mmd_bullet_add_rigid_body(
    world: number,
    boneIndex: number,
    parentBoneIndex: number,
    boneDepth: number,
    motionType: number,
    shapeType: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    restX: number,
    restY: number,
    restZ: number,
    localX: number,
    localY: number,
    localZ: number,
    localQx: number,
    localQy: number,
    localQz: number,
    localQw: number,
    mass: number,
    linearDamping: number,
    angularDamping: number,
    restitution: number,
    friction: number,
    group: number,
    mask: number
  ): number;
  _yw_mmd_bullet_add_joint(
    world: number,
    rigidBodyIndexA: number,
    rigidBodyIndexB: number,
    translationX: number,
    translationY: number,
    translationZ: number,
    rotationX: number,
    rotationY: number,
    rotationZ: number,
    rotationW: number,
    linearLowerX: number,
    linearLowerY: number,
    linearLowerZ: number,
    linearUpperX: number,
    linearUpperY: number,
    linearUpperZ: number,
    angularLowerX: number,
    angularLowerY: number,
    angularLowerZ: number,
    angularUpperX: number,
    angularUpperY: number,
    angularUpperZ: number,
    springLinearX: number,
    springLinearY: number,
    springLinearZ: number,
    springAngularX: number,
    springAngularY: number,
    springAngularZ: number
  ): number;
  _yw_mmd_bullet_commit_model(world: number): number;
  _yw_mmd_bullet_model_identity(world: number): number;
  _yw_mmd_bullet_set_tuning?(
    world: number,
    fixedTimeStep: number,
    maxSubSteps: number,
    resetCatchUpSteps: number,
    dynamicWithBoneRotationFeedbackScale: number,
    collisionMargin: number,
    solverIterations: number,
    splitImpulse: number,
    splitImpulsePenetrationThreshold: number
  ): number;
  _yw_mmd_bullet_reset_world(world: number): void;
  _yw_mmd_bullet_reset_pose_sync?(world: number, catchUpSteps: number): number;
  _yw_mmd_bullet_step(
    world: number,
    seconds: number,
    deltaSeconds: number,
    frame: number,
    frameRate: number,
    seeking: number
  ): number;
  _yw_mmd_bullet_input_translations(world: number): number;
  _yw_mmd_bullet_input_rotations(world: number): number;
  _yw_mmd_bullet_input_world_matrices(world: number): number;
  _yw_mmd_bullet_output_translations(world: number): number;
  _yw_mmd_bullet_output_rotations(world: number): number;
  _yw_mmd_bullet_output_world_matrices(world: number): number;
  _yw_mmd_bullet_bone_physics_toggles(world: number): number;
  _yw_mmd_bullet_updated_bone_indices(world: number): number;
  _yw_mmd_bullet_debug_contact_count?(world: number): number;
  _yw_mmd_bullet_debug_contact_pair_count?(world: number): number;
  _yw_mmd_bullet_debug_contact_pairs?(world: number): number;
  _yw_mmd_bullet_debug_rigid_body_count?(world: number): number;
  _yw_mmd_bullet_debug_rigid_body_world_matrices?(world: number): number;
}

type CustomBulletMmdFactory = () => CustomBulletMmdModule | Promise<CustomBulletMmdModule>;
type CustomBulletMmdCandidate = CustomBulletMmdModule | CustomBulletMmdFactory;

const DEFAULT_RESET_CATCH_UP_STEPS = 0;
const DEFAULT_FIXED_TIME_STEP = 1 / 60;
const DEFAULT_MAX_SUB_STEPS = 5;
const DEFAULT_DYNAMIC_WITH_BONE_ROTATION_FEEDBACK_SCALE = 1;
const DEFAULT_COLLISION_MARGIN = -1;
const DEFAULT_SOLVER_ITERATIONS = 20;
const DEFAULT_SPLIT_IMPULSE = 1;
const DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD = -0.04;

export function resolveCustomBulletMmdScriptUrl(baseUrl: string = import.meta.url): string {
  return new URL(customBulletMmdScriptPath, baseUrl).href;
}

export async function loadCustomBulletMmdModule(
  options: CustomBulletMmdLoaderOptions = {}
): Promise<CustomBulletMmdModule> {
  const existingCandidate = getCustomBulletMmdCandidate();
  if (existingCandidate) {
    return await initCustomBulletMmdModule(existingCandidate);
  }
  const scriptUrl = options.scriptUrl ?? resolveCustomBulletMmdScriptUrl(options.baseUrl);
  await loadScript(scriptUrl, options.timeoutMs ?? 10000);
  const candidate = getCustomBulletMmdCandidate();
  if (!candidate) {
    throw new Error("YwMmdBullet is not available on globalThis, window, or self.");
  }
  return await initCustomBulletMmdModule(candidate);
}

export function createCustomBulletMmdPhysicsBackend(
  module: CustomBulletMmdModule,
  options: CustomBulletMmdPhysicsBackendOptions = {}
): MmdDirectBufferPhysicsBackend {
  return new CustomBulletMmdPhysicsBackend(module, options);
}

class CustomBulletMmdPhysicsBackend implements MmdDirectBufferPhysicsBackend {
  readonly name = "custom-bullet-mmd";
  readonly disabled = false;
  private world: number;
  private disposedState = false;
  private lastLayout: MmdPhysicsStepBufferLayout | undefined;
  private buffers: MmdPhysicsStepBuffers | undefined;
  private nextModelIdentity = 1;
  private readonly modelIdentities = new WeakMap<object, WeakMap<object, number>>();
  private readonly emptyJointsIdentityKey = {};
  private pendingResetPoseSync = false;

  constructor(
    private readonly module: CustomBulletMmdModule,
    private readonly options: CustomBulletMmdPhysicsBackendOptions
  ) {
    this.world = module._yw_mmd_bullet_create_world();
    if (this.world === 0) {
      throw new Error("Failed to create custom Bullet MMD world.");
    }
  }

  get disposed(): boolean {
    return this.disposedState;
  }

  acquireStepBuffers(layout: MmdPhysicsStepBufferLayout): MmdPhysicsStepBuffers | undefined {
    if (this.disposedState) {
      return undefined;
    }
    if (
      this.buffers &&
      this.lastLayout?.boneCount === layout.boneCount &&
      this.currentHeapBuffer() === this.buffers.inputTranslations.buffer
    ) {
      return this.buffers;
    }
    if (this.module._yw_mmd_bullet_ensure_step_buffers(this.world, layout.boneCount) === 0) {
      return undefined;
    }
    const heapBuffer = this.refreshHeapBuffer();
    if (!heapBuffer) {
      return undefined;
    }
    this.lastLayout = layout;
    this.buffers = this.createStepBufferViews(layout, heapBuffer);
    return this.buffers;
  }

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    if (this.disposedState) {
      return { simulated: false, diagnostics: this.diagnostics() };
    }
    if (!this.ensureModelUploaded(context)) {
      return {
        simulated: false,
        diagnostics: [
          {
            level: "error",
            code: "PHYSICS_BACKEND_MODEL_UPLOAD_FAILED",
            message: "Failed to upload MMD rigid bodies to the custom Bullet backend."
          }
        ]
      };
    }
    this.syncTuning();
    const stepBuffers = this.syncContextToStepBuffers(context);
    if (this.pendingResetPoseSync && context.seeking !== true) {
      const resetCatchUpSteps = sanitizeIntegerOption(
        this.options.resetCatchUpSteps,
        DEFAULT_RESET_CATCH_UP_STEPS
      );
      const synced = this.module._yw_mmd_bullet_reset_pose_sync?.(
        this.world,
        resetCatchUpSteps
      );
      this.pendingResetPoseSync = false;
      if (synced === 0) {
        return {
          simulated: false,
          diagnostics: [
            {
              level: "error",
              code: "PHYSICS_BACKEND_RESET_POSE_SYNC_FAILED",
              message: "Failed to synchronize the custom Bullet MMD backend to the reset pose."
            }
          ]
        };
      }
      if (resetCatchUpSteps > 0) {
        return { simulated: false, updatedBoneCount: 0 };
      }
    }
    const updatedBoneCount = this.module._yw_mmd_bullet_step(
      this.world,
      context.seconds,
      context.deltaSeconds,
      context.frame,
      context.frameRate,
      context.seeking === true ? 1 : 0
    );
    this.copyStepBuffersToContextOutput(context, stepBuffers, updatedBoneCount);
    return { simulated: updatedBoneCount > 0, updatedBoneCount };
  }

  reset(_context?: MmdPhysicsResetContext): void {
    if (!this.disposedState) {
      this.module._yw_mmd_bullet_reset_world(this.world);
      this.pendingResetPoseSync = true;
    }
  }

  dispose(): void {
    if (this.disposedState) {
      return;
    }
    this.module._yw_mmd_bullet_destroy_world(this.world);
    this.world = 0;
    this.buffers = undefined;
    this.disposedState = true;
  }

  diagnostics(): readonly MmdPhysicsDiagnostic[] {
    return this.disposedState
      ? [
          {
            level: "warning",
            code: "PHYSICS_BACKEND_DISPOSED",
            message: "Custom Bullet MMD physics backend has been disposed."
          }
        ]
      : [];
  }

  debugContactCount(): number {
    return this.module._yw_mmd_bullet_debug_contact_count?.(this.world) ?? 0;
  }

  debugPhysicsContacts(): readonly {
    readonly rigidBodyIndexA: number;
    readonly rigidBodyIndexB: number;
    readonly distance: number;
  }[] {
    const count = this.module._yw_mmd_bullet_debug_contact_pair_count?.(this.world) ?? 0;
    const pointer = this.module._yw_mmd_bullet_debug_contact_pairs?.(this.world) ?? 0;
    if (count <= 0 || pointer === 0) {
      return [];
    }
    const heapBuffer = this.refreshHeapBuffer();
    if (!heapBuffer) {
      return [];
    }
    const values = new Float32Array(heapBuffer, pointer, count * 3);
    const contacts: {
      rigidBodyIndexA: number;
      rigidBodyIndexB: number;
      distance: number;
    }[] = [];
    for (let index = 0; index < count; index += 1) {
      const base = index * 3;
      contacts.push({
        rigidBodyIndexA: values[base],
        rigidBodyIndexB: values[base + 1],
        distance: values[base + 2]
      });
    }
    return contacts.sort((left, right) => left.distance - right.distance);
  }

  debugRigidBodyWorldTransformsColumnMajor(): readonly MmdPhysicsMatrix4ColumnMajorTuple[] {
    const count = this.module._yw_mmd_bullet_debug_rigid_body_count?.(this.world) ?? 0;
    const pointer = this.module._yw_mmd_bullet_debug_rigid_body_world_matrices?.(this.world) ?? 0;
    if (count <= 0 || pointer === 0) {
      return [];
    }
    const heapBuffer = this.refreshHeapBuffer();
    if (!heapBuffer) {
      return [];
    }
    const values = new Float32Array(heapBuffer, pointer, count * 16);
    const matrices: MmdPhysicsMatrix4ColumnMajorTuple[] = [];
    for (let index = 0; index < count; index += 1) {
      const base = index * 16;
      matrices.push([
        values[base],
        values[base + 1],
        values[base + 2],
        values[base + 3],
        values[base + 4],
        values[base + 5],
        values[base + 6],
        values[base + 7],
        values[base + 8],
        values[base + 9],
        values[base + 10],
        values[base + 11],
        values[base + 12],
        values[base + 13],
        values[base + 14],
        values[base + 15]
      ]);
    }
    return matrices;
  }

  private currentHeapBuffer(): ArrayBuffer | undefined {
    return (this.module.HEAPF32?.buffer ??
      this.module.HEAPU8?.buffer ??
      this.module.HEAPU32?.buffer) as ArrayBuffer | undefined;
  }

  private refreshHeapBuffer(): ArrayBuffer | undefined {
    this.module.refreshMemoryViews?.();
    return this.currentHeapBuffer();
  }

  private createStepBufferViews(
    layout: MmdPhysicsStepBufferLayout,
    heapBuffer: ArrayBuffer
  ): MmdPhysicsStepBuffers {
    const heapU8Buffer = (this.module.HEAPU8?.buffer ?? heapBuffer) as ArrayBuffer;
    const heapU32Buffer = (this.module.HEAPU32?.buffer ?? heapBuffer) as ArrayBuffer;
    return {
      inputTranslations: new Float32Array(
        heapBuffer,
        this.module._yw_mmd_bullet_input_translations(this.world),
        layout.translationValueCount
      ),
      inputRotations: new Float32Array(
        heapBuffer,
        this.module._yw_mmd_bullet_input_rotations(this.world),
        layout.rotationValueCount
      ),
      inputWorldMatricesColumnMajor: new Float32Array(
        heapBuffer,
        this.module._yw_mmd_bullet_input_world_matrices(this.world),
        layout.worldMatrixValueCount
      ),
      outputTranslations: new Float32Array(
        heapBuffer,
        this.module._yw_mmd_bullet_output_translations(this.world),
        layout.translationValueCount
      ),
      outputRotations: new Float32Array(
        heapBuffer,
        this.module._yw_mmd_bullet_output_rotations(this.world),
        layout.rotationValueCount
      ),
      outputWorldMatricesColumnMajor: new Float32Array(
        heapBuffer,
        this.module._yw_mmd_bullet_output_world_matrices(this.world),
        layout.worldMatrixValueCount
      ),
      bonePhysicsToggles: new Uint8Array(
        heapU8Buffer,
        this.module._yw_mmd_bullet_bone_physics_toggles(this.world),
        layout.boneCount
      ),
      updatedBoneIndices: new Uint32Array(
        heapU32Buffer,
        this.module._yw_mmd_bullet_updated_bone_indices(this.world),
        layout.boneCount
      )
    };
  }

  private syncContextToStepBuffers(context: MmdPhysicsStepContext): MmdPhysicsStepBuffers | undefined {
    const boneCount = this.contextBoneCount(context);
    if (boneCount <= 0) {
      return this.buffers;
    }
    const buffers = this.acquireStepBuffers({
      boneCount,
      translationValueCount: boneCount * 3,
      rotationValueCount: boneCount * 4,
      worldMatrixValueCount: boneCount * 16
    });
    if (!buffers) {
      return undefined;
    }
    copyNumericInput(context.inputTranslations, buffers.inputTranslations);
    copyNumericInput(context.inputRotations, buffers.inputRotations);
    copyNumericInput(context.inputWorldMatricesColumnMajor, buffers.inputWorldMatricesColumnMajor);
    copyToggleInput(context.bonePhysicsToggles, buffers.bonePhysicsToggles);
    return buffers;
  }

  private copyStepBuffersToContextOutput(
    context: MmdPhysicsStepContext,
    buffers: MmdPhysicsStepBuffers | undefined,
    updatedBoneCount: number
  ): void {
    if (!buffers || !context.output) {
      return;
    }
    copyNumericOutput(buffers.outputTranslations, context.output.translations);
    copyNumericOutput(buffers.outputRotations, context.output.rotations);
    copyNumericOutput(
      buffers.outputWorldMatricesColumnMajor,
      context.output.worldMatricesColumnMajor
    );
    copyIndexOutput(buffers.updatedBoneIndices, context.output.updatedBoneIndices, updatedBoneCount);
  }

  private contextBoneCount(context: MmdPhysicsStepContext): number {
    return (
      context.skeleton?.bones.length ??
      inferBoneCountFromBuffer(context.inputWorldMatricesColumnMajor, 16) ??
      inferBoneCountFromBuffer(context.inputRotations, 4) ??
      inferBoneCountFromBuffer(context.inputTranslations, 3) ??
      0
    );
  }

  private ensureModelUploaded(context: MmdPhysicsStepContext): boolean {
    const rigidBodies = context.rigidBodies;
    if (!rigidBodies) {
      return true;
    }
    const identity = this.modelIdentityFor(rigidBodies, context.joints);
    if (this.module._yw_mmd_bullet_model_identity(this.world) === identity) {
      return true;
    }
    const joints = context.joints ?? [];
    if (this.module._yw_mmd_bullet_begin_model(this.world, rigidBodies.length, identity) === 0) {
      return false;
    }
    for (const body of rigidBodies) {
      const size = body.shape.size;
      const bone = body.boneIndex === undefined || body.boneIndex < 0
        ? undefined
        : context.skeleton?.bones[body.boneIndex];
      const restTranslation = bone?.restTranslation ?? [0, 0, 0];
      const localTranslation = body.localTranslation ?? [0, 0, 0];
      const localRotation = body.localRotation ?? [0, 0, 0, 1];
      if (
        this.module._yw_mmd_bullet_add_rigid_body(
          this.world,
          body.boneIndex ?? -1,
          bone?.parentIndex ?? -1,
          boneDepth(context, body.boneIndex ?? -1),
          motionTypeToNative(body.motionType),
          shapeTypeToNative(body.shape.type),
          size[0],
          size[1],
          size[2],
          restTranslation[0],
          restTranslation[1],
          restTranslation[2],
          localTranslation[0],
          localTranslation[1],
          localTranslation[2],
          localRotation[0],
          localRotation[1],
          localRotation[2],
          localRotation[3],
          body.mass ?? 0,
          body.linearDamping ?? 0,
          body.angularDamping ?? 0,
          body.restitution ?? 0,
          body.friction ?? 0.5,
          body.collisionGroup ?? 0,
          body.collisionMask ?? 0xffff
        ) === 0
      ) {
        return false;
      }
    }
    for (const joint of joints) {
      const translation = joint.translation ?? [0, 0, 0];
      const rotation = joint.rotation ?? [0, 0, 0, 1];
      const linearLower = joint.linearLimit?.lower ?? [0, 0, 0];
      const linearUpper = joint.linearLimit?.upper ?? [0, 0, 0];
      const angularLower = joint.angularLimit?.lower ?? [0, 0, 0];
      const angularUpper = joint.angularLimit?.upper ?? [0, 0, 0];
      const springLinear = joint.spring?.linear ?? [0, 0, 0];
      const springAngular = joint.spring?.angular ?? [0, 0, 0];
      if (
        this.module._yw_mmd_bullet_add_joint(
          this.world,
          joint.rigidBodyIndexA,
          joint.rigidBodyIndexB,
          translation[0],
          translation[1],
          translation[2],
          rotation[0],
          rotation[1],
          rotation[2],
          rotation[3],
          linearLower[0],
          linearLower[1],
          linearLower[2],
          linearUpper[0],
          linearUpper[1],
          linearUpper[2],
          angularLower[0],
          angularLower[1],
          angularLower[2],
          angularUpper[0],
          angularUpper[1],
          angularUpper[2],
          springLinear[0],
          springLinear[1],
          springLinear[2],
          springAngular[0],
          springAngular[1],
          springAngular[2]
        ) === 0
      ) {
        return false;
      }
    }
    return this.module._yw_mmd_bullet_commit_model(this.world) !== 0;
  }

  private modelIdentityFor(
    rigidBodies: NonNullable<MmdPhysicsStepContext["rigidBodies"]>,
    joints: MmdPhysicsStepContext["joints"]
  ): number {
    const rigidBodyKey = rigidBodies as object;
    const jointKey = (joints as object | undefined) ?? this.emptyJointsIdentityKey;
    let jointIdentities = this.modelIdentities.get(rigidBodyKey);
    if (!jointIdentities) {
      jointIdentities = new WeakMap<object, number>();
      this.modelIdentities.set(rigidBodyKey, jointIdentities);
    }
    const current = jointIdentities.get(jointKey);
    if (current !== undefined) {
      return current;
    }
    const next = this.nextModelIdentity;
    this.nextModelIdentity += 1;
    jointIdentities.set(jointKey, next);
    return next;
  }

  private syncTuning(): void {
    this.module._yw_mmd_bullet_set_tuning?.(
      this.world,
      sanitizePositiveOption(this.options.fixedTimeStep, DEFAULT_FIXED_TIME_STEP),
      sanitizeIntegerOption(this.options.maxSubSteps, DEFAULT_MAX_SUB_STEPS),
      sanitizeIntegerOption(this.options.resetCatchUpSteps, DEFAULT_RESET_CATCH_UP_STEPS),
      sanitizeUnitOption(
        this.options.dynamicWithBoneRotationFeedbackScale,
        DEFAULT_DYNAMIC_WITH_BONE_ROTATION_FEEDBACK_SCALE
      ),
      sanitizeNonNegativeOption(this.options.collisionMargin, DEFAULT_COLLISION_MARGIN),
      sanitizeIntegerOption(this.options.solverIterations, DEFAULT_SOLVER_ITERATIONS),
      this.options.splitImpulse === undefined
        ? DEFAULT_SPLIT_IMPULSE
        : (this.options.splitImpulse ? 1 : 0),
      sanitizeFiniteOption(
        this.options.splitImpulsePenetrationThreshold,
        DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD
      )
    );
  }
}

function sanitizePositiveOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeIntegerOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : fallback;
}

function sanitizeUnitOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, Math.min(value, 1))
    : fallback;
}

function sanitizeNonNegativeOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sanitizeFiniteOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function boneDepth(context: MmdPhysicsStepContext, boneIndex: number): number {
  if (!context.skeleton || boneIndex < 0 || boneIndex >= context.skeleton.bones.length) {
    return Number.MAX_SAFE_INTEGER;
  }
  let depth = 0;
  let parentIndex = context.skeleton.bones[boneIndex]?.parentIndex ?? -1;
  while (parentIndex >= 0 && parentIndex < context.skeleton.bones.length) {
    depth += 1;
    if (depth > context.skeleton.bones.length) {
      return Number.MAX_SAFE_INTEGER;
    }
    parentIndex = context.skeleton.bones[parentIndex]?.parentIndex ?? -1;
  }
  return depth;
}

function motionTypeToNative(motionType: string): number {
  if (motionType === "dynamic") {
    return 1;
  }
  if (motionType === "dynamicWithBone") {
    return 2;
  }
  return 0;
}

function inferBoneCountFromBuffer(
  buffer: MmdPhysicsNumericBuffer | undefined,
  stride: number
): number | undefined {
  if (!buffer || buffer.length === 0) {
    return undefined;
  }
  return Math.floor(buffer.length / stride);
}

function copyNumericInput(
  source: MmdPhysicsNumericBuffer | undefined,
  target: Float32Array<ArrayBuffer>
): void {
  if (!source || source === target) {
    return;
  }
  target.set(source);
}

function copyToggleInput(
  source: readonly boolean[] | Uint8Array | undefined,
  target: Uint8Array<ArrayBuffer>
): void {
  if (!source || source === target) {
    return;
  }
  for (let index = 0; index < source.length; index += 1) {
    target[index] = source[index] ? 1 : 0;
  }
}

function copyNumericOutput(
  source: Float32Array<ArrayBuffer>,
  target: MmdPhysicsMutableNumericBuffer | undefined
): void {
  if (!target || target === source) {
    return;
  }
  if (Array.isArray(target)) {
    target.length = source.length;
    for (let index = 0; index < source.length; index += 1) {
      target[index] = source[index];
    }
    return;
  }
  target.set(source.subarray(0, target.length));
}

function copyIndexOutput(
  source: MmdPhysicsMutableIndexBuffer | undefined,
  target: MmdPhysicsMutableIndexBuffer | undefined,
  count: number
): void {
  if (!source || !target || target === source) {
    return;
  }
  if (Array.isArray(target)) {
    const boundedCount = Math.min(count, source.length);
    target.length = boundedCount;
    for (let index = 0; index < boundedCount; index += 1) {
      target[index] = source[index];
    }
    return;
  }
  const boundedCount = Math.min(count, source.length, target.length);
  if (Array.isArray(source)) {
    for (let index = 0; index < boundedCount; index += 1) {
      target[index] = source[index];
    }
    return;
  }
  target.set(source.subarray(0, boundedCount));
}

function shapeTypeToNative(shapeType: string): number {
  if (shapeType === "box") {
    return 1;
  }
  if (shapeType === "capsule") {
    return 2;
  }
  return 0;
}

function loadScript(scriptUrl: string, timeoutMs: number): Promise<void> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("loadCustomBulletMmdModule requires a browser document and window.");
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const timeoutId = window.setTimeout(() => settle(new Error(`Timed out loading ${scriptUrl}`)), timeoutMs);
    const settle = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const handleLoad = () => settle();
    const handleError = () => settle(new Error(`Failed to load ${scriptUrl}`));
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    script.async = true;
    script.src = scriptUrl;
    document.head.appendChild(script);
  });
}

function getCustomBulletMmdCandidate(): CustomBulletMmdCandidate | undefined {
  const globalScopes = [
    typeof globalThis !== "undefined" ? globalThis : undefined,
    typeof window !== "undefined" ? window : undefined,
    typeof globalThis !== "undefined" ? globalThis.self : undefined
  ];
  for (const scope of globalScopes) {
    const candidate = (scope as { YwMmdBullet?: CustomBulletMmdCandidate } | undefined)?.YwMmdBullet;
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

async function initCustomBulletMmdModule(
  candidate: CustomBulletMmdCandidate
): Promise<CustomBulletMmdModule> {
  return typeof candidate === "function" ? await candidate() : candidate;
}
