import type {
  MmdPhysicsBackend,
  MmdPhysicsContact,
  MmdPhysicsDebugSnapshot,
  MmdPhysicsDiagnostic,
  MmdPhysicsMatrix4ColumnMajorTuple,
  MmdPhysicsMutableNumericBuffer,
  MmdPhysicsResetContext,
  MmdPhysicsRigidBody,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult
} from "./index.js";
import {
  normalizeMmdPhysicsDebugSnapshot,
  validateConcreteMmdPhysicsStepContext
} from "./index.js";

type AmmoVector3Tuple = [number, number, number];
type AmmoQuaternionTuple = [number, number, number, number];

interface AmmoSkeletonBone {
  readonly index: number;
  readonly name?: string;
  readonly parentIndex: number;
  readonly position: AmmoVector3Tuple;
}

interface AmmoStepContext {
  readonly seconds: number;
  readonly deltaSeconds: number;
  readonly frame: number;
  readonly frameRate: number;
  readonly skeleton: { readonly bones: readonly AmmoSkeletonBone[] };
  readonly rigidBodies: readonly AmmoRigidBodyData[];
  readonly joints: readonly AmmoJointData[];
  readonly inputTranslations: NonNullable<MmdPhysicsStepContext["inputTranslations"]>;
  readonly inputRotations: NonNullable<MmdPhysicsStepContext["inputRotations"]>;
  readonly inputWorldMatricesColumnMajor: NonNullable<MmdPhysicsStepContext["inputWorldMatricesColumnMajor"]>;
  readonly output: NonNullable<MmdPhysicsStepContext["output"]>;
  readonly bonePhysicsToggles: MmdPhysicsStepContext["bonePhysicsToggles"];
  readonly morphImpulses: MmdPhysicsStepContext["morphImpulses"];
  readonly debug: MmdPhysicsStepContext["debug"];
}

interface AmmoRigidBodyData {
  readonly name?: string;
  readonly boneIndex: number;
  readonly group: number;
  readonly mask: number;
  readonly shape: MmdPhysicsRigidBody["shape"]["type"];
  readonly size: AmmoVector3Tuple;
  readonly position: AmmoVector3Tuple;
  readonly rotation: AmmoQuaternionTuple;
  readonly mass: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly restitution: number;
  readonly friction: number;
  readonly mode: MmdPhysicsRigidBody["motionType"];
}

interface AmmoJointData {
  readonly name?: string;
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly position: AmmoVector3Tuple;
  readonly rotation: AmmoQuaternionTuple;
  readonly translationLowerLimit: AmmoVector3Tuple;
  readonly translationUpperLimit: AmmoVector3Tuple;
  readonly rotationLowerLimit: AmmoVector3Tuple;
  readonly rotationUpperLimit: AmmoVector3Tuple;
  readonly springTranslationFactor: AmmoVector3Tuple;
  readonly springRotationFactor: AmmoVector3Tuple;
}

type AmmoMmdPhysicsContactDebug = MmdPhysicsContact & {
  readonly bodyNameA: string;
  readonly bodyNameB: string;
  readonly shapeA: MmdPhysicsRigidBody["shape"]["type"];
  readonly shapeB: MmdPhysicsRigidBody["shape"]["type"];
  readonly modeA: MmdPhysicsRigidBody["motionType"];
  readonly modeB: MmdPhysicsRigidBody["motionType"];
  readonly groupA: number;
  readonly groupB: number;
  readonly maskA: number;
  readonly maskB: number;
  readonly contactCount: number;
  readonly minDistance: number;
};

export interface AmmoVector3 {
  x(): number;
  y(): number;
  z(): number;
  setValue?(x: number, y: number, z: number): void;
}

export interface AmmoQuaternion {
  x?(): number;
  y?(): number;
  z?(): number;
  w?(): number;
  setValue?(x: number, y: number, z: number, w: number): void;
}

export interface AmmoTransform {
  setIdentity(): void;
  setOrigin(origin: AmmoVector3): void;
  getOrigin(): AmmoVector3;
  setRotation?(rotation: AmmoQuaternion): void;
  getRotation?(): AmmoQuaternion | undefined;
}

export interface AmmoMotionState {
  getWorldTransform(target: AmmoTransform): void;
  setWorldTransform?(transform: AmmoTransform): void;
}

export interface AmmoShape {
  calculateLocalInertia(mass: number, inertia: AmmoVector3): void;
  setMargin?(margin: number): void;
}

export interface AmmoRigidBodyConstructionInfo {
  set_m_additionalDamping?(enabled: boolean): void;
}

export interface AmmoRigidBody {
  setDamping(linear: number, angular: number): void;
  setRestitution(value: number): void;
  setFriction(value: number): void;
  setSleepingThresholds?(linear: number, angular: number): void;
  setWorldTransform?(transform: AmmoTransform): void;
  setLinearVelocity?(velocity: AmmoVector3): void;
  setAngularVelocity?(velocity: AmmoVector3): void;
  applyCentralForce?(force: AmmoVector3): void;
  applyTorqueImpulse?(impulse: AmmoVector3): void;
  setActivationState?(state: number): void;
  activate?(force?: boolean): void;
  getCollisionFlags?(): number;
  setCollisionFlags?(flags: number): void;
  getMotionState(): AmmoMotionState;
}

export interface AmmoManifoldPoint {
  getDistance(): number;
}

export interface AmmoPersistentManifold {
  getBody0(): object;
  getBody1(): object;
  getNumContacts(): number;
  getContactPoint(index: number): AmmoManifoldPoint;
}

export interface AmmoDispatcher {
  getNumManifolds(): number;
  getManifoldByIndexInternal(index: number): AmmoPersistentManifold;
}

export interface AmmoGeneric6DofConstraint {
  setLinearLowerLimit(value: AmmoVector3): void;
  setLinearUpperLimit(value: AmmoVector3): void;
  setAngularLowerLimit(value: AmmoVector3): void;
  setAngularUpperLimit(value: AmmoVector3): void;
  setParam?(parameter: number, value: number, axis: number): void;
  enableSpring?(index: number, enabled: boolean): void;
  setStiffness?(index: number, stiffness: number): void;
  setEquilibriumPoint?(index?: number): void;
}

export interface AmmoPoint2PointConstraint {
  setPivotA?(pivot: AmmoVector3): void;
  setPivotB?(pivot: AmmoVector3): void;
}

export interface AmmoConeTwistConstraint {
  setLimit?(
    swingSpan1: number,
    swingSpan2: number,
    twistSpan: number,
    softness?: number,
    biasFactor?: number,
    relaxationFactor?: number
  ): void;
  setDamping?(damping: number): void;
}

export interface AmmoSliderConstraint {
  setLowerLinLimit?(value: number): void;
  setUpperLinLimit?(value: number): void;
  setLowerAngLimit?(value: number): void;
  setUpperAngLimit?(value: number): void;
}

export interface AmmoHingeConstraint {
  setLimit?(
    low: number,
    high: number,
    softness?: number,
    biasFactor?: number,
    relaxationFactor?: number
  ): void;
}

export type AmmoConstraint =
  | AmmoGeneric6DofConstraint
  | AmmoPoint2PointConstraint
  | AmmoConeTwistConstraint
  | AmmoSliderConstraint
  | AmmoHingeConstraint;

export interface AmmoSolverInfo {
  set_m_splitImpulse?(value: boolean): void;
  set_m_splitImpulsePenetrationThreshold?(value: number): void;
  set_m_numIterations?(value: number): void;
}

export interface AmmoWorld {
  setGravity(gravity: AmmoVector3): void;
  addRigidBody(body: AmmoRigidBody, group?: number, mask?: number): void;
  removeRigidBody?(body: AmmoRigidBody): void;
  addConstraint?(constraint: AmmoConstraint, disableCollisionsBetweenLinkedBodies: boolean): void;
  removeConstraint?(constraint: AmmoConstraint): void;
  getDispatcher?(): AmmoDispatcher;
  getSolverInfo?(): AmmoSolverInfo;
  stepSimulation(timeStep: number, maxSubSteps: number, fixedTimeStep: number): void;
}

export interface AmmoNamespace {
  destroy?: (value: object) => void;
  getPointer?: (value: object) => number;
  HEAP32?: Int32Array | Uint32Array;
  btDefaultCollisionConfiguration: new () => object;
  btCollisionDispatcher: new (configuration: object) => object;
  btDbvtBroadphase: new () => object;
  btSequentialImpulseConstraintSolver: new () => object;
  btDiscreteDynamicsWorld: new (
    dispatcher: object,
    broadphase: object,
    solver: object,
    configuration: object
  ) => AmmoWorld;
  btVector3: new (x: number, y: number, z: number) => AmmoVector3;
  btQuaternion?: new (x?: number, y?: number, z?: number, w?: number) => AmmoQuaternion;
  btTransform: new () => AmmoTransform;
  btDefaultMotionState: new (transform: AmmoTransform) => AmmoMotionState;
  btRigidBodyConstructionInfo: new (
    mass: number,
    motionState: AmmoMotionState,
    shape: AmmoShape,
    inertia: AmmoVector3
  ) => AmmoRigidBodyConstructionInfo;
  btRigidBody: new (info: AmmoRigidBodyConstructionInfo) => AmmoRigidBody;
  btBoxShape: new (halfExtents: AmmoVector3) => AmmoShape;
  btCapsuleShape: new (radius: number, height: number) => AmmoShape;
  btSphereShape: new (radius: number) => AmmoShape;
  btGeneric6DofSpringConstraint?: new (
    bodyA: AmmoRigidBody,
    bodyB: AmmoRigidBody,
    frameA: AmmoTransform,
    frameB: AmmoTransform,
    useLinearReferenceFrameA: boolean
  ) => AmmoGeneric6DofConstraint;
  btGeneric6DofConstraint?: new (
    bodyA: AmmoRigidBody,
    bodyB: AmmoRigidBody,
    frameA: AmmoTransform,
    frameB: AmmoTransform,
    useLinearReferenceFrameA: boolean
  ) => AmmoGeneric6DofConstraint;
  btPoint2PointConstraint?: new (
    bodyA: AmmoRigidBody,
    bodyB: AmmoRigidBody,
    pivotA: AmmoVector3,
    pivotB: AmmoVector3
  ) => AmmoPoint2PointConstraint;
  btConeTwistConstraint?: new (
    bodyA: AmmoRigidBody,
    bodyB: AmmoRigidBody,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ) => AmmoConeTwistConstraint;
  btSliderConstraint?: new (
    bodyA: AmmoRigidBody,
    bodyB: AmmoRigidBody,
    frameA: AmmoTransform,
    frameB: AmmoTransform,
    useLinearReferenceFrameA: boolean
  ) => AmmoSliderConstraint;
  btHingeConstraint?: new (
    bodyA: AmmoRigidBody,
    bodyB: AmmoRigidBody,
    frameA: AmmoTransform,
    frameB: AmmoTransform,
    useLinearReferenceFrameA: boolean
  ) => AmmoHingeConstraint;
}

export interface AmmoPhysicsBackendOptions {
  gravity?: [number, number, number];
  fixedTimeStep?: number;
  maxSubSteps?: number;
  resetTimeJumpThresholdSeconds?: number;
  additionalDampingPatch?: boolean;
  additionalDamping?: boolean;
  collisionMargin?: number;
  solverIterations?: number;
  splitImpulse?: boolean;
  splitImpulsePenetrationThreshold?: number;
  warmupSteps?: number;
  warmupTimeStep?: number;
}

const DEFAULT_GRAVITY: [number, number, number] = [0, -98, 0];
const DEFAULT_FIXED_TIME_STEP = 1 / 60;
const DEFAULT_MAX_SUB_STEPS = 4;
const DEFAULT_SPLIT_IMPULSE = true;
const DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD = -0.04;
const MAX_FRAME_STEP_SECONDS = 1 / 15;
const MIN_DYNAMIC_BODY_MASS = 0.001;
const MIN_SHAPE_SIZE = 0.001;
const CF_KINEMATIC_OBJECT = 2;
const CF_NO_CONTACT_RESPONSE = 4;
const ACTIVE_TAG = 1;
const DISABLE_DEACTIVATION = 4;
const BT_CONSTRAINT_STOP_ERP = 0.475;
const BT_CONSTRAINT_STOP_ERP_PARAM = 2;

interface AmmoRigidBodyBinding {
  rigidBody: AmmoRigidBody;
  shape: AmmoShape;
  motionState: AmmoMotionState;
  rigidBodyPointer: number | undefined;
  body: AmmoRigidBodyData;
  effectiveMode: AmmoRigidBodyData["mode"];
  baseCollisionFlags: number | undefined;
  temporalKinematic: boolean;
  physicsEnabled: boolean | undefined;
  disabledSyncMode: "kinematic" | "target" | undefined;
}

export function createAmmoMmdPhysicsBackend(
  ammo: AmmoNamespace,
  options: AmmoPhysicsBackendOptions = {}
): MmdPhysicsBackend {
  return new AmmoMmdPhysicsBackend(ammo, options);
}

export class AmmoMmdPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "ammo";
  readonly disabled = false;
  private world: AmmoWorld | undefined;
  private bindings: AmmoRigidBodyBinding[] = [];
  private constraints: AmmoConstraint[] = [];
  private constraintFrames: AmmoTransform[] = [];
  private worldResources: object[] = [];
  private lastSeconds: number | undefined;
  private pendingResetPoseSync = false;
  private disposedState = false;
  private contextIdentity:
    | {
        skeleton: MmdPhysicsStepContext["skeleton"];
        rigidBodies: MmdPhysicsStepContext["rigidBodies"];
        joints: MmdPhysicsStepContext["joints"];
      }
    | undefined;

  constructor(
    private readonly ammo: AmmoNamespace,
    private readonly options: AmmoPhysicsBackendOptions
  ) {}

  get disposed(): boolean {
    return this.disposedState;
  }

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    if (this.disposedState) {
      return {
        simulated: false,
        diagnostics: this.diagnostics()
      };
    }
    const validation = validateConcreteMmdPhysicsStepContext(context);
    if (!validation.valid) {
      return {
        simulated: false,
        diagnostics: validation.diagnostics
      };
    }
    const ammoContext = createAmmoStepContext(context);
    if (this.shouldResetForContext(context)) {
      this.reset();
    }
    const world = this.world ?? this.initializeWorld(ammoContext, context);

    const dt = Math.min(
      Math.max(context.seconds - (this.lastSeconds ?? context.seconds), 0),
      MAX_FRAME_STEP_SECONDS
    );
    this.lastSeconds = context.seconds;
    if (this.pendingResetPoseSync) {
      this.syncAllBodiesToCurrentPose(ammoContext);
      this.applyBodyPhysicsToggles(ammoContext);
      if (dt > 0) {
        this.pendingResetPoseSync = false;
      }
      const debug = this.captureStepDebug(context);
      return debug ? { simulated: false, debug } : { simulated: false };
    }
    this.syncKinematicBodies(ammoContext);
    this.applyBodyPhysicsToggles(ammoContext);
    this.applyMorphImpulses(ammoContext);
    if (dt > 0) {
      world.stepSimulation(
        dt,
        this.options.maxSubSteps ?? DEFAULT_MAX_SUB_STEPS,
        this.options.fixedTimeStep ?? DEFAULT_FIXED_TIME_STEP
      );
    }
    this.syncDynamicBodies(ammoContext);
    if (dt > 0) {
      this.restoreTemporalKinematicBodies();
    }
    const debug = this.captureStepDebug(context);
    return debug ? { simulated: dt > 0, debug } : { simulated: dt > 0 };
  }

  reset(_context?: MmdPhysicsResetContext): void {
    this.destroyWorldResources();
    this.bindings = [];
    this.constraints = [];
    this.constraintFrames = [];
    this.worldResources = [];
    this.world = undefined;
    this.lastSeconds = undefined;
    this.pendingResetPoseSync = true;
    this.contextIdentity = undefined;
  }

  dispose(): void {
    this.reset();
    this.disposedState = true;
  }

  diagnostics(): MmdPhysicsDiagnostic[] {
    const diagnostics: MmdPhysicsDiagnostic[] = [
      {
        level: "warning",
        code: "PHYSICS_BACKEND_AMMO_EXPERIMENTAL",
        message:
          "Ammo physics backend is experimental and currently provides smoke-level MMD rigid-body support without native numeric equivalence."
      }
    ];
    if (this.disposedState) {
      diagnostics.push({
        level: "warning",
        code: "PHYSICS_BACKEND_DISPOSED",
        message: "Physics backend has been disposed."
      });
    }
    return diagnostics;
  }

  debugRigidBodyWorldTransformsColumnMajor(): MmdPhysicsMatrix4ColumnMajorTuple[] {
    const Ammo = this.ammo;
    const transform = new Ammo.btTransform();
    return this.bindings.map(({ rigidBody }) => {
      const motionState = rigidBody.getMotionState();
      motionState.getWorldTransform(transform);
      const origin = transform.getOrigin();
      const physicsWorld = {
        position: [origin.x(), origin.y(), origin.z()] as [number, number, number],
        rotation: transform.getRotation
          ? (ammoQuaternionToTuple(transform.getRotation()) ?? [0, 0, 0, 1])
          : ([0, 0, 0, 1] as [number, number, number, number])
      };
      const mmdWorld = physicsTransformToMmd(physicsWorld);
      return transformToColumnMajorMatrix(mmdWorld.position, mmdWorld.rotation);
    });
  }

  debugPhysicsContacts(): AmmoMmdPhysicsContactDebug[] {
    const dispatcher = this.world?.getDispatcher?.();
    if (!dispatcher || !this.ammo.getPointer) {
      return [];
    }
    const bindingByPointer = new Map<
      number,
      { bodyIndex: number; binding: AmmoRigidBodyBinding }
    >();
    this.bindings.forEach((binding, index) => {
      if (binding.rigidBodyPointer !== undefined) {
        bindingByPointer.set(binding.rigidBodyPointer, { bodyIndex: index, binding });
      }
    });
    const contacts: AmmoMmdPhysicsContactDebug[] = [];
    const manifoldCount = dispatcher.getNumManifolds();
    for (let manifoldIndex = 0; manifoldIndex < manifoldCount; manifoldIndex++) {
      const manifold = dispatcher.getManifoldByIndexInternal(manifoldIndex);
      const contactCount = manifold.getNumContacts();
      if (contactCount <= 0) {
        continue;
      }
      const bodyA = bindingByPointer.get(this.ammo.getPointer(manifold.getBody0()));
      const bodyB = bindingByPointer.get(this.ammo.getPointer(manifold.getBody1()));
      if (!bodyA || !bodyB) {
        continue;
      }
      const { bodyIndex: bodyIndexA, binding: bindingA } = bodyA;
      const { bodyIndex: bodyIndexB, binding: bindingB } = bodyB;
      if (bindingA.body.mode === "static" && bindingB.body.mode === "static") {
        continue;
      }
      let minDistance = Infinity;
      for (let contactIndex = 0; contactIndex < contactCount; contactIndex++) {
        const distance = manifold.getContactPoint(contactIndex).getDistance();
        if (Number.isFinite(distance)) {
          minDistance = Math.min(minDistance, distance);
        }
      }
      if (!Number.isFinite(minDistance) || minDistance > 0) {
        continue;
      }
      contacts.push({
        rigidBodyIndexA: bodyIndexA,
        rigidBodyIndexB: bodyIndexB,
        bodyNameA: rigidBodyDebugName(bindingA.body),
        bodyNameB: rigidBodyDebugName(bindingB.body),
        shapeA: bindingA.body.shape,
        shapeB: bindingB.body.shape,
        modeA: bindingA.body.mode,
        modeB: bindingB.body.mode,
        groupA: bindingA.body.group,
        groupB: bindingB.body.group,
        maskA: bindingA.body.mask,
        maskB: bindingB.body.mask,
        contactCount,
        minDistance,
        distance: minDistance
      });
    }
    return contacts.sort((left, right) => left.minDistance - right.minDistance);
  }

  private captureStepDebug(context: MmdPhysicsStepContext): MmdPhysicsDebugSnapshot | undefined {
    const captureRigidBodyTransforms = context.debug?.captureRigidBodyTransforms ?? false;
    const captureContacts = context.debug?.captureContacts ?? false;
    if (!captureRigidBodyTransforms && !captureContacts && !context.debug?.onStepDebug) {
      return undefined;
    }
    const snapshot = normalizeMmdPhysicsDebugSnapshot({
      rigidBodyTransforms: captureRigidBodyTransforms
        ? this.debugRigidBodyWorldTransformsColumnMajor().map((worldMatrixColumnMajor, index) => ({
            rigidBodyIndex: index,
            translation: [
              worldMatrixColumnMajor[12],
              worldMatrixColumnMajor[13],
              worldMatrixColumnMajor[14]
            ],
            rotation: matrixRotation(worldMatrixColumnMajor, 0),
            worldMatrixColumnMajor
          }))
        : [],
      contacts: captureContacts ? this.debugPhysicsContacts() : []
    }).snapshot;
    for (const transform of snapshot.rigidBodyTransforms ?? []) {
      context.debug?.onRigidBodyTransform?.(transform);
    }
    for (const contact of snapshot.contacts ?? []) {
      context.debug?.onContact?.(contact);
    }
    context.debug?.onStepDebug?.(snapshot);
    return snapshot;
  }

  private initializeWorld(
    context: AmmoStepContext,
    identityContext: MmdPhysicsStepContext
  ): AmmoWorld {
    this.contextIdentity = {
      skeleton: identityContext.skeleton,
      rigidBodies: identityContext.rigidBodies,
      joints: identityContext.joints
    };
    const Ammo = this.ammo;
    const collisionConfiguration = this.registerWorldResource(
      new Ammo.btDefaultCollisionConfiguration()
    );
    const dispatcher = this.registerWorldResource(
      new Ammo.btCollisionDispatcher(collisionConfiguration)
    );
    const broadphase = this.registerWorldResource(new Ammo.btDbvtBroadphase());
    const solver = this.registerWorldResource(new Ammo.btSequentialImpulseConstraintSolver());
    this.world = new Ammo.btDiscreteDynamicsWorld(
      dispatcher,
      broadphase,
      solver,
      collisionConfiguration
    );
    this.configureSolver(this.world);
    const gravity = this.options.gravity ?? DEFAULT_GRAVITY;
    const gravityVector = new Ammo.btVector3(gravity[0], gravity[1], gravity[2]);
    this.world.setGravity(gravityVector);
    this.destroy(gravityVector);

    for (const body of context.rigidBodies) {
      const binding = this.createRigidBodyBinding(body, context);
      this.world.addRigidBody(
        binding.rigidBody,
        collisionGroupMask(body.group),
        collisionFilterMask(body)
      );
      this.bindings.push(binding);
    }
    this.promotePhysicsWithBoneChildren(context);
    this.createConstraints(context);
    if (!this.pendingResetPoseSync) {
      this.warmupWorld(context);
    }
    return this.world;
  }

  private configureSolver(world: AmmoWorld): void {
    const solverInfo = world.getSolverInfo?.();
    if (!solverInfo) {
      return;
    }
    const splitImpulse = this.options.splitImpulse ?? DEFAULT_SPLIT_IMPULSE;
    solverInfo.set_m_splitImpulse?.(splitImpulse);
    solverInfo.set_m_splitImpulsePenetrationThreshold?.(
      this.options.splitImpulsePenetrationThreshold ?? DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD
    );
    if (this.options.solverIterations !== undefined) {
      solverInfo.set_m_numIterations?.(this.options.solverIterations);
    }
  }

  private warmupWorld(context: AmmoStepContext): void {
    const steps = Math.max(Math.trunc(this.options.warmupSteps ?? 0), 0);
    if (steps === 0 || !this.world) {
      return;
    }
    this.syncKinematicBodies(context);
    this.applyBodyPhysicsToggles(context);
    const fixedTimeStep = this.options.fixedTimeStep ?? DEFAULT_FIXED_TIME_STEP;
    const timeStep = this.options.warmupTimeStep ?? fixedTimeStep;
    for (let i = 0; i < steps; i++) {
      this.world.stepSimulation(timeStep, 0, fixedTimeStep);
    }
  }

  private createRigidBodyBinding(
    body: AmmoRigidBodyData,
    context: AmmoStepContext
  ): AmmoRigidBodyBinding {
    const Ammo = this.ammo;
    const shape = this.createShape(body);
    const transform = new Ammo.btTransform();
    try {
      transform.setIdentity();
      const bodyWorld = this.bodyWorldTransform(body, context);
      const physicsBodyWorld = mmdTransformToPhysics(bodyWorld);
      this.setTransformOrigin(transform, physicsBodyWorld.position);
      this.setTransformQuaternion(transform, physicsBodyWorld.rotation);
      const motionState = new Ammo.btDefaultMotionState(transform);
      const mass = body.mode === "static" ? 0 : Math.max(body.mass, MIN_DYNAMIC_BODY_MASS);
      const inertia = new Ammo.btVector3(0, 0, 0);
      try {
        if (mass > 0) {
          shape.calculateLocalInertia(mass, inertia);
        }
        const info = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, inertia);
        try {
          info.set_m_additionalDamping?.(this.options.additionalDamping ?? false);
          const rigidBody = new Ammo.btRigidBody(info);
          rigidBody.setDamping(body.linearDamping, body.angularDamping);
          rigidBody.setRestitution(body.restitution);
          rigidBody.setFriction(body.friction);
          rigidBody.setSleepingThresholds?.(0, 0);
          this.configureCollisionFlags(rigidBody, body);
          this.configureAdditionalDamping(rigidBody);
          return {
            rigidBody,
            shape,
            motionState,
            rigidBodyPointer: Ammo.getPointer?.(rigidBody),
            body,
            effectiveMode: body.mode,
            baseCollisionFlags: rigidBody.getCollisionFlags?.(),
            temporalKinematic: false,
            physicsEnabled: undefined,
            disabledSyncMode: undefined
          };
        } finally {
          this.destroy(info);
        }
      } finally {
        this.destroy(inertia);
      }
    } finally {
      this.destroy(transform);
    }
  }

  private configureCollisionFlags(rigidBody: AmmoRigidBody, body: AmmoRigidBodyData): void {
    if (!rigidBody.getCollisionFlags || !rigidBody.setCollisionFlags) {
      return;
    }
    let flags = rigidBody.getCollisionFlags();
    if (body.mode === "static") {
      flags |= CF_KINEMATIC_OBJECT;
      rigidBody.setActivationState?.(DISABLE_DEACTIVATION);
    }
    if (body.mask === 0 || isZeroVolumeRigidBody(body)) {
      flags |= CF_NO_CONTACT_RESPONSE;
    }
    rigidBody.setCollisionFlags(flags);
  }

  private configureAdditionalDamping(rigidBody: AmmoRigidBody): void {
    if (!this.options.additionalDampingPatch) {
      return;
    }
    const pointer = this.ammo.getPointer?.(rigidBody);
    const heap32 = this.ammo.HEAP32;
    if (pointer === undefined || !heap32) {
      return;
    }
    heap32[pointer / 4 + 113] = -1;
  }

  private createShape(body: AmmoRigidBodyData): AmmoShape {
    const Ammo = this.ammo;
    let shape: AmmoShape;
    if (body.shape === "box") {
      const halfExtents = new Ammo.btVector3(
        Math.max(body.size[0], MIN_SHAPE_SIZE),
        Math.max(body.size[1], MIN_SHAPE_SIZE),
        Math.max(body.size[2], MIN_SHAPE_SIZE)
      );
      shape = new Ammo.btBoxShape(halfExtents);
      this.destroy(halfExtents);
    } else if (body.shape === "capsule") {
      const radius = Math.max(body.size[0], MIN_SHAPE_SIZE);
      shape = new Ammo.btCapsuleShape(radius, Math.max(body.size[1], MIN_SHAPE_SIZE));
    } else {
      shape = new Ammo.btSphereShape(Math.max(body.size[0], MIN_SHAPE_SIZE));
    }
    if (this.options.collisionMargin !== undefined) {
      shape.setMargin?.(this.options.collisionMargin);
    }
    return shape;
  }

  private shouldResetForContext(context: MmdPhysicsStepContext): boolean {
    if (!this.world) {
      return false;
    }
    if (
      this.contextIdentity?.skeleton !== context.skeleton ||
      this.contextIdentity?.rigidBodies !== context.rigidBodies ||
      this.contextIdentity?.joints !== context.joints
    ) {
      return true;
    }
    if (this.lastSeconds === undefined) {
      return false;
    }
    const delta = context.seconds - this.lastSeconds;
    if (delta < 0) {
      return true;
    }
    const threshold = this.options.resetTimeJumpThresholdSeconds;
    return threshold !== undefined && threshold > 0 && delta > threshold;
  }

  private bodyWorldTransform(
    body: AmmoRigidBodyData,
    context: AmmoStepContext
  ): { position: [number, number, number]; rotation: [number, number, number, number] } {
    const bodyRotation = body.rotation;
    if (body.boneIndex >= 0 && body.boneIndex < context.skeleton.bones.length) {
      const boneWorld = matrixTransform(context.inputWorldMatricesColumnMajor, body.boneIndex);
      const offset = bodyOffsetFromBoneRest(body, context);
      return {
        position: addVectors(
          boneWorld.position,
          rotateVectorByQuaternion(offset.position, boneWorld.rotation)
        ),
        rotation: normalizeQuaternion(multiplyQuaternions(boneWorld.rotation, bodyRotation))
      };
    }
    return {
      position: [...body.position],
      rotation: bodyRotation
    };
  }

  private createConstraints(context: AmmoStepContext): void {
    const world = this.world;
    if (!world?.addConstraint) {
      return;
    }

    for (const joint of context.joints) {
      const bindingA = this.bindings[joint.rigidBodyIndexA];
      const bindingB = this.bindings[joint.rigidBodyIndexB];
      if (!bindingA || !bindingB) {
        continue;
      }

      const frameA = this.createJointFrame(joint, bindingA.body);
      const frameB = this.createJointFrame(joint, bindingB.body);
      const constraint = this.createJointConstraint(joint, bindingA, bindingB, frameA, frameB);
      if (!constraint) {
        this.destroy(frameB);
        this.destroy(frameA);
        continue;
      }
      world.addConstraint(constraint, false);
      this.constraints.push(constraint);
      this.constraintFrames.push(frameA, frameB);
    }
  }

  private createJointConstraint(
    joint: AmmoJointData,
    bindingA: AmmoRigidBodyBinding,
    bindingB: AmmoRigidBodyBinding,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ): AmmoConstraint | undefined {
    return this.createGeneric6DofConstraint(joint, bindingA, bindingB, frameA, frameB);
  }

  private createGeneric6DofConstraint(
    joint: AmmoJointData,
    bindingA: AmmoRigidBodyBinding,
    bindingB: AmmoRigidBodyBinding,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ): AmmoGeneric6DofConstraint | undefined {
    const Constraint = this.ammo.btGeneric6DofSpringConstraint ?? this.ammo.btGeneric6DofConstraint;
    if (!Constraint) {
      return undefined;
    }
    const constraint = new Constraint(bindingA.rigidBody, bindingB.rigidBody, frameA, frameB, true);
    const limits = mmdJointLimitsToPhysics(joint);
    const linearLowerLimit = this.vector(limits.translationLowerLimit);
    const linearUpperLimit = this.vector(limits.translationUpperLimit);
    const angularLowerLimit = this.vector(limits.rotationLowerLimit);
    const angularUpperLimit = this.vector(limits.rotationUpperLimit);
    try {
      constraint.setLinearLowerLimit(linearLowerLimit);
      constraint.setLinearUpperLimit(linearUpperLimit);
      constraint.setAngularLowerLimit(angularLowerLimit);
      constraint.setAngularUpperLimit(angularUpperLimit);
    } finally {
      this.destroy(angularUpperLimit);
      this.destroy(angularLowerLimit);
      this.destroy(linearUpperLimit);
      this.destroy(linearLowerLimit);
    }
    this.configureConstraintStopErp(constraint);
    this.configureSpring(constraint, joint);
    return constraint;
  }

  private createPoint2PointConstraint(
    joint: AmmoJointData,
    bindingA: AmmoRigidBodyBinding,
    bindingB: AmmoRigidBodyBinding,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ): AmmoConstraint | undefined {
    const Constraint = this.ammo.btPoint2PointConstraint;
    if (!Constraint) {
      return this.createGeneric6DofConstraint(joint, bindingA, bindingB, frameA, frameB);
    }
    return new Constraint(
      bindingA.rigidBody,
      bindingB.rigidBody,
      frameA.getOrigin(),
      frameB.getOrigin()
    );
  }

  private createConeTwistConstraint(
    joint: AmmoJointData,
    bindingA: AmmoRigidBodyBinding,
    bindingB: AmmoRigidBodyBinding,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ): AmmoConstraint | undefined {
    const Constraint = this.ammo.btConeTwistConstraint;
    if (!Constraint) {
      return this.createGeneric6DofConstraint(joint, bindingA, bindingB, frameA, frameB);
    }
    const constraint = new Constraint(bindingA.rigidBody, bindingB.rigidBody, frameA, frameB);
    const limits = mmdJointLimitsToPhysics(joint);
    constraint.setLimit?.(
      symmetricSpan(limits.rotationLowerLimit[0], limits.rotationUpperLimit[0]),
      symmetricSpan(limits.rotationLowerLimit[1], limits.rotationUpperLimit[1]),
      symmetricSpan(limits.rotationLowerLimit[2], limits.rotationUpperLimit[2]),
      0.9,
      0.3,
      1
    );
    constraint.setDamping?.(averageVector(joint.springRotationFactor) > 0 ? 0.01 : 0);
    return constraint;
  }

  private createSliderConstraint(
    joint: AmmoJointData,
    bindingA: AmmoRigidBodyBinding,
    bindingB: AmmoRigidBodyBinding,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ): AmmoConstraint | undefined {
    const Constraint = this.ammo.btSliderConstraint;
    if (!Constraint) {
      return this.createGeneric6DofConstraint(joint, bindingA, bindingB, frameA, frameB);
    }
    const constraint = new Constraint(bindingA.rigidBody, bindingB.rigidBody, frameA, frameB, true);
    const limits = mmdJointLimitsToPhysics(joint);
    constraint.setLowerLinLimit?.(limits.translationLowerLimit[0]);
    constraint.setUpperLinLimit?.(limits.translationUpperLimit[0]);
    constraint.setLowerAngLimit?.(limits.rotationLowerLimit[0]);
    constraint.setUpperAngLimit?.(limits.rotationUpperLimit[0]);
    return constraint;
  }

  private createHingeConstraint(
    joint: AmmoJointData,
    bindingA: AmmoRigidBodyBinding,
    bindingB: AmmoRigidBodyBinding,
    frameA: AmmoTransform,
    frameB: AmmoTransform
  ): AmmoConstraint | undefined {
    const Constraint = this.ammo.btHingeConstraint;
    if (!Constraint) {
      return this.createGeneric6DofConstraint(joint, bindingA, bindingB, frameA, frameB);
    }
    const constraint = new Constraint(bindingA.rigidBody, bindingB.rigidBody, frameA, frameB, true);
    const limits = mmdJointLimitsToPhysics(joint);
    constraint.setLimit?.(limits.rotationLowerLimit[0], limits.rotationUpperLimit[0], 0.9, 0.3, 1);
    return constraint;
  }

  private createJointFrame(joint: AmmoJointData, body: AmmoRigidBodyData): AmmoTransform {
    const localFrame = relativePhysicsTransform(
      {
        position: mmdVectorToPhysics(joint.position),
        rotation: mmdQuaternionToPhysics(joint.rotation)
      },
      {
        position: mmdVectorToPhysics(body.position),
        rotation: mmdQuaternionToPhysics(body.rotation)
      }
    );
    const transform = new this.ammo.btTransform();
    transform.setIdentity();
    this.setTransformOrigin(transform, localFrame.position);
    this.setTransformQuaternion(transform, localFrame.rotation);
    return transform;
  }

  private setTransformOrigin(
    transform: AmmoTransform,
    position: readonly [number, number, number]
  ): void {
    const origin = new this.ammo.btVector3(position[0], position[1], position[2]);
    transform.setOrigin(origin);
    this.destroy(origin);
  }

  private setTransformQuaternion(
    transform: AmmoTransform,
    rotation: readonly [number, number, number, number]
  ): void {
    if (!transform.setRotation || !this.ammo.btQuaternion) {
      return;
    }
    const [x, y, z, w] = normalizeQuaternion(rotation);
    const quaternion = new this.ammo.btQuaternion(x, y, z, w);
    if (quaternion.setValue) {
      quaternion.setValue(x, y, z, w);
    }
    transform.setRotation(quaternion);
    this.destroy(quaternion);
  }

  private configureSpring(constraint: AmmoGeneric6DofConstraint, joint: AmmoJointData): void {
    if (!constraint.enableSpring || !constraint.setStiffness) {
      return;
    }
    for (let axis = 0; axis < 3; axis++) {
      const stiffness = joint.springTranslationFactor[axis];
      if (stiffness !== 0) {
        constraint.enableSpring(axis, true);
        constraint.setStiffness(axis, stiffness);
      } else {
        constraint.enableSpring(axis, false);
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      const stiffness = joint.springRotationFactor[axis];
      const constraintAxis = axis + 3;
      constraint.enableSpring(constraintAxis, true);
      constraint.setStiffness(constraintAxis, stiffness);
    }
  }

  private configureConstraintStopErp(constraint: AmmoGeneric6DofConstraint): void {
    if (!constraint.setParam) {
      return;
    }
    for (let axis = 0; axis < 6; axis++) {
      constraint.setParam(BT_CONSTRAINT_STOP_ERP_PARAM, BT_CONSTRAINT_STOP_ERP, axis);
    }
  }

  private vector(values: readonly [number, number, number]): AmmoVector3 {
    return new this.ammo.btVector3(values[0], values[1], values[2]);
  }

  private promotePhysicsWithBoneChildren(context: AmmoStepContext): void {
    const promoteIfParentPhysics = (candidateIndex: number, parentIndex: number): void => {
      const candidate = this.bindings[candidateIndex];
      const parent = this.bindings[parentIndex];
      if (
        !candidate ||
        !parent ||
        candidate.body.mode !== "dynamicWithBone" ||
        parent.body.mode !== "dynamic" ||
        candidate.body.boneIndex < 0
      ) {
        return;
      }
      const boneParentIndex = context.skeleton.bones[candidate.body.boneIndex]?.parentIndex ?? -1;
      if (boneParentIndex >= 0 && parent.body.boneIndex === boneParentIndex) {
        candidate.effectiveMode = "dynamic";
      }
    };

    for (const joint of context.joints) {
      promoteIfParentPhysics(joint.rigidBodyIndexA, joint.rigidBodyIndexB);
      promoteIfParentPhysics(joint.rigidBodyIndexB, joint.rigidBodyIndexA);
    }
  }

  private syncAllBodiesToCurrentPose(context: AmmoStepContext): void {
    for (const binding of this.bindings) {
      this.setRigidBodyWorldTransform(
        binding.rigidBody,
        this.bodyWorldTransform(binding.body, context)
      );
      this.resetBodyVelocity(binding.rigidBody);
      binding.disabledSyncMode = undefined;
      binding.temporalKinematic = this.makeTemporalKinematic(binding);
      binding.rigidBody.activate?.(true);
    }
  }

  private syncKinematicBodies(context: AmmoStepContext): void {
    for (const binding of this.bindings) {
      const { body, rigidBody } = binding;
      binding.disabledSyncMode = undefined;
      if (body.boneIndex < 0 || body.boneIndex >= context.skeleton.bones.length) {
        continue;
      }
      if (body.mode === "static") {
        this.setRigidBodyWorldTransform(rigidBody, this.bodyWorldTransform(body, context));
        this.resetBodyVelocity(rigidBody);
        rigidBody.activate?.(true);
        continue;
      }
      if (isRigidBodyPhysicsEnabled(body, context)) {
        continue;
      }
      const target = this.bodyWorldTransform(body, context);
      if (this.shouldUseDisabledTargetTransform(binding, context)) {
        binding.disabledSyncMode = "target";
        this.driveRigidBodyTowardTransform(rigidBody, target);
      } else {
        binding.disabledSyncMode = "kinematic";
        this.setRigidBodyWorldTransform(rigidBody, target);
        this.resetBodyVelocity(rigidBody);
      }
      rigidBody.activate?.(true);
    }
  }

  private shouldUseDisabledTargetTransform(
    binding: AmmoRigidBodyBinding,
    context: AmmoStepContext
  ): boolean {
    const { body } = binding;
    if (body.mode === "static" || body.boneIndex < 0) {
      return false;
    }
    let parentIndex = context.skeleton.bones[body.boneIndex]?.parentIndex ?? -1;
    while (parentIndex >= 0) {
      const parentBinding = this.bindings.find(
        (candidate) => candidate.body.boneIndex === parentIndex
      );
      if (!parentBinding) {
        return false;
      }
      if (parentBinding.body.mode === "static") {
        return false;
      }
      if (isRigidBodyPhysicsEnabled(parentBinding.body, context)) {
        return true;
      }
      if (parentBinding.disabledSyncMode === "target") {
        return true;
      }
      if (parentBinding.disabledSyncMode === "kinematic") {
        return false;
      }
      parentIndex = context.skeleton.bones[parentIndex]?.parentIndex ?? -1;
    }
    return false;
  }

  private driveRigidBodyTowardTransform(
    rigidBody: AmmoRigidBody,
    target: { position: [number, number, number]; rotation: [number, number, number, number] }
  ): void {
    const Ammo = this.ammo;
    const physicsTarget = mmdTransformToPhysics(target);
    const currentTransform = new Ammo.btTransform();
    try {
      rigidBody.getMotionState().getWorldTransform(currentTransform);
      const currentOrigin = currentTransform.getOrigin();
      const currentRotation = currentTransform.getRotation
        ? (ammoQuaternionToTuple(currentTransform.getRotation()) ?? [0, 0, 0, 1])
        : ([0, 0, 0, 1] as [number, number, number, number]);
      const forceFactor = 30;
      const linearVelocity = new Ammo.btVector3(
        (physicsTarget.position[0] - currentOrigin.x()) * forceFactor,
        (physicsTarget.position[1] - currentOrigin.y()) * forceFactor,
        (physicsTarget.position[2] - currentOrigin.z()) * forceFactor
      );
      rigidBody.setLinearVelocity?.(linearVelocity);
      this.destroy(linearVelocity);
      const deltaRotation = normalizeQuaternion(
        multiplyQuaternions(physicsTarget.rotation, invertQuaternion(currentRotation))
      );
      const angularVelocity = new Ammo.btVector3(
        ...quaternionToAngularVelocity(deltaRotation, forceFactor)
      );
      rigidBody.setAngularVelocity?.(angularVelocity);
      this.destroy(angularVelocity);
    } finally {
      this.destroy(currentTransform);
    }
  }

  private setRigidBodyWorldTransform(
    rigidBody: AmmoRigidBody,
    world: { position: [number, number, number]; rotation: [number, number, number, number] }
  ): void {
    const transform = new this.ammo.btTransform();
    try {
      transform.setIdentity();
      const physicsWorld = mmdTransformToPhysics(world);
      this.setTransformOrigin(transform, physicsWorld.position);
      this.setTransformQuaternion(transform, physicsWorld.rotation);
      rigidBody.setWorldTransform?.(transform);
      rigidBody.getMotionState().setWorldTransform?.(transform);
    } finally {
      this.destroy(transform);
    }
  }

  private applyBodyPhysicsToggles(context: AmmoStepContext): void {
    for (const binding of this.bindings) {
      const { body, rigidBody, baseCollisionFlags } = binding;
      if (
        body.mode === "static" ||
        body.boneIndex < 0 ||
        body.boneIndex >= context.skeleton.bones.length ||
        !rigidBody.setCollisionFlags ||
        baseCollisionFlags === undefined
      ) {
        continue;
      }
      const disabledByMotion = !isRigidBodyPhysicsEnabled(body, context);
      const useKinematicDisabled =
        binding.temporalKinematic || (disabledByMotion && binding.disabledSyncMode !== "target");
      rigidBody.setCollisionFlags(
        useKinematicDisabled ? baseCollisionFlags | CF_KINEMATIC_OBJECT : baseCollisionFlags
      );
      rigidBody.setActivationState?.(useKinematicDisabled ? DISABLE_DEACTIVATION : ACTIVE_TAG);
      if (
        !disabledByMotion &&
        (binding.physicsEnabled === false || binding.temporalKinematic === true)
      ) {
        this.resetBodyVelocity(rigidBody);
        rigidBody.activate?.(true);
      }
      binding.physicsEnabled = !disabledByMotion;
    }
  }

  private makeTemporalKinematic(binding: AmmoRigidBodyBinding): boolean {
    const { body, rigidBody, baseCollisionFlags } = binding;
    if (
      body.mode === "static" ||
      baseCollisionFlags === undefined ||
      !rigidBody.setCollisionFlags ||
      !rigidBody.setActivationState
    ) {
      return false;
    }
    rigidBody.setCollisionFlags(baseCollisionFlags | CF_KINEMATIC_OBJECT);
    rigidBody.setActivationState(DISABLE_DEACTIVATION);
    return true;
  }

  private restoreTemporalKinematicBodies(): void {
    for (const binding of this.bindings) {
      if (!binding.temporalKinematic) {
        continue;
      }
      const { rigidBody, baseCollisionFlags } = binding;
      if (baseCollisionFlags !== undefined && rigidBody.setCollisionFlags) {
        rigidBody.setCollisionFlags(baseCollisionFlags);
      }
      rigidBody.setActivationState?.(ACTIVE_TAG);
      this.resetBodyVelocity(rigidBody);
      rigidBody.activate?.(true);
      binding.temporalKinematic = false;
    }
  }

  private resetBodyVelocity(rigidBody: AmmoRigidBody): void {
    if (!rigidBody.setLinearVelocity && !rigidBody.setAngularVelocity) {
      return;
    }
    const zero = new this.ammo.btVector3(0, 0, 0);
    rigidBody.setLinearVelocity?.(zero);
    rigidBody.setAngularVelocity?.(zero);
    this.destroy(zero);
  }

  private applyMorphImpulses(context: AmmoStepContext): void {
    for (const impulse of context.morphImpulses ?? []) {
      const binding = this.bindings[impulse.rigidBodyIndex ?? -1];
      if (!binding) {
        continue;
      }
      const velocity = scaleVector(impulse.force ?? [0, 0, 0], impulse.weight);
      const torque = scaleVector(impulse.torque ?? [0, 0, 0], impulse.weight);
      if (isZeroVector(velocity) && isZeroVector(torque)) {
        this.resetBodyVelocity(binding.rigidBody);
        continue;
      }
      const appliedVelocityMmd = velocity;
      const appliedTorqueMmd = torque;
      const appliedVelocity = this.vector(mmdVectorToPhysics(appliedVelocityMmd));
      binding.rigidBody.applyCentralForce?.(appliedVelocity);
      this.destroy(appliedVelocity);
      const appliedTorque = this.vector(mmdVectorToPhysics(appliedTorqueMmd));
      binding.rigidBody.applyTorqueImpulse?.(appliedTorque);
      this.destroy(appliedTorque);
    }
  }

  private syncDynamicBodies(context: AmmoStepContext): void {
    const Ammo = this.ammo;
    const transform = new Ammo.btTransform();
    const worldCache = new PhysicsWorldTransformCache(context);
    for (const binding of sortBindingsByBoneDepth(this.bindings, context)) {
      const { body, rigidBody } = binding;
      if (
        (binding.effectiveMode !== "dynamic" && binding.effectiveMode !== "dynamicWithBone") ||
        body.boneIndex < 0 ||
        body.boneIndex >= context.skeleton.bones.length
      ) {
        continue;
      }
      if (!isRigidBodyPhysicsEnabled(body, context)) {
        continue;
      }
      rigidBody.getMotionState().getWorldTransform(transform);
      const origin = transform.getOrigin();
      const currentBoneWorld = worldCache.get(body.boneIndex);
      const physicsBodyWorld = {
        position: [origin.x(), origin.y(), origin.z()] as [number, number, number],
        rotation: transform.getRotation
          ? (ammoQuaternionToTuple(transform.getRotation()) ??
            mmdQuaternionToPhysics(currentBoneWorld.rotation))
          : mmdQuaternionToPhysics(currentBoneWorld.rotation)
      };
      const bodyWorld = physicsTransformToMmd(physicsBodyWorld);
      const offset = bodyOffsetFromBoneRest(body, context);
      const boneWorldRotation = normalizeQuaternion(
        multiplyQuaternions(bodyWorld.rotation, invertQuaternion(offset.rotation))
      );
      const boneWorld = {
        position:
          binding.effectiveMode === "dynamicWithBone"
            ? currentBoneWorld.position
            : subtractVectors(
                bodyWorld.position,
                rotateVectorByQuaternion(offset.position, boneWorldRotation)
              ),
        rotation: boneWorldRotation
      };
      const local = worldCache.toLocal(boneWorld, body.boneIndex);
      writeVector3ToBuffer(context.output.translations, body.boneIndex, local.position);
      writeQuaternionToBuffer(context.output.rotations, body.boneIndex, local.rotation);
      writeMatrixToBuffer(
        context.output.worldMatricesColumnMajor,
        body.boneIndex,
        transformToColumnMajorMatrix(boneWorld.position, boneWorld.rotation)
      );
      context.output.updatedBoneIndices?.push(body.boneIndex);
      worldCache.set(body.boneIndex, boneWorld);
    }
    this.destroy(transform);
  }

  private destroy(value: object | undefined): void {
    if (value) {
      this.ammo.destroy?.(value);
    }
  }

  private registerWorldResource<T extends object>(value: T): T {
    this.worldResources.push(value);
    return value;
  }

  private destroyWorldResources(): void {
    const world = this.world;
    for (let i = this.constraints.length - 1; i >= 0; i -= 1) {
      const constraint = this.constraints[i];
      if (constraint) {
        world?.removeConstraint?.(constraint);
        this.destroy(constraint);
      }
    }
    for (let i = this.constraintFrames.length - 1; i >= 0; i -= 1) {
      this.destroy(this.constraintFrames[i]);
    }
    for (let i = this.bindings.length - 1; i >= 0; i -= 1) {
      const binding = this.bindings[i];
      if (binding) {
        world?.removeRigidBody?.(binding.rigidBody);
        this.destroy(binding.rigidBody);
        this.destroy(binding.motionState);
        this.destroy(binding.shape);
      }
    }
    this.destroy(world);
    for (let i = this.worldResources.length - 1; i >= 0; i -= 1) {
      this.destroy(this.worldResources[i]);
    }
  }
}

function createAmmoStepContext(context: MmdPhysicsStepContext): AmmoStepContext {
  const required = requireConcreteStepContext(context);
  return {
    seconds: context.seconds,
    deltaSeconds: context.deltaSeconds,
    frame: context.frame,
    frameRate: context.frameRate,
    skeleton: {
      bones: required.skeleton.bones.map((bone) => ({
        index: bone.index,
        name: bone.name,
        parentIndex: bone.parentIndex ?? -1,
        position: tuple3(bone.restTranslation ?? readVector3(required.inputTranslations, bone.index))
      }))
    },
    rigidBodies: required.rigidBodies.map((body) => ({
      name: body.name,
      boneIndex: body.boneIndex ?? -1,
      group: body.collisionGroup ?? 0,
      mask: body.collisionMask ?? 0xffff,
      shape: body.shape.type,
      size: tuple3(body.shape.size),
      position: tuple3(body.localTranslation ?? [0, 0, 0]),
      rotation: tuple4(body.localRotation ?? [0, 0, 0, 1]),
      mass: body.mass ?? 0,
      linearDamping: body.linearDamping ?? 0,
      angularDamping: body.angularDamping ?? 0,
      restitution: body.restitution ?? 0,
      friction: body.friction ?? 0.5,
      mode: body.motionType
    })),
    joints: required.joints.map((joint) => ({
      name: joint.name,
      rigidBodyIndexA: joint.rigidBodyIndexA,
      rigidBodyIndexB: joint.rigidBodyIndexB,
      position: tuple3(joint.translation ?? [0, 0, 0]),
      rotation: tuple4(joint.rotation ?? [0, 0, 0, 1]),
      translationLowerLimit: tuple3(joint.linearLimit?.lower ?? [0, 0, 0]),
      translationUpperLimit: tuple3(joint.linearLimit?.upper ?? [0, 0, 0]),
      rotationLowerLimit: tuple3(joint.angularLimit?.lower ?? [0, 0, 0]),
      rotationUpperLimit: tuple3(joint.angularLimit?.upper ?? [0, 0, 0]),
      springTranslationFactor: tuple3(joint.spring?.linear ?? [0, 0, 0]),
      springRotationFactor: tuple3(joint.spring?.angular ?? [0, 0, 0])
    })),
    inputTranslations: required.inputTranslations,
    inputRotations: required.inputRotations,
    inputWorldMatricesColumnMajor: required.inputWorldMatricesColumnMajor,
    output: required.output,
    bonePhysicsToggles: context.bonePhysicsToggles,
    morphImpulses: context.morphImpulses,
    debug: context.debug
  };
}

function requireConcreteStepContext(context: MmdPhysicsStepContext): RequiredConcreteStepContext {
  const {
    skeleton,
    rigidBodies,
    joints,
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output
  } = context;
  if (
    !skeleton ||
    !rigidBodies ||
    !joints ||
    !inputTranslations ||
    !inputRotations ||
    !inputWorldMatricesColumnMajor ||
    !output
  ) {
    throw new TypeError("MMD physics concrete step context is incomplete.");
  }
  return {
    skeleton,
    rigidBodies,
    joints,
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output
  };
}

interface RequiredConcreteStepContext {
  readonly skeleton: NonNullable<MmdPhysicsStepContext["skeleton"]>;
  readonly rigidBodies: NonNullable<MmdPhysicsStepContext["rigidBodies"]>;
  readonly joints: NonNullable<MmdPhysicsStepContext["joints"]>;
  readonly inputTranslations: NonNullable<MmdPhysicsStepContext["inputTranslations"]>;
  readonly inputRotations: NonNullable<MmdPhysicsStepContext["inputRotations"]>;
  readonly inputWorldMatricesColumnMajor: NonNullable<
    MmdPhysicsStepContext["inputWorldMatricesColumnMajor"]
  >;
  readonly output: NonNullable<MmdPhysicsStepContext["output"]>;
}

function tuple3(values: readonly number[]): AmmoVector3Tuple {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

function tuple4(values: readonly number[]): AmmoQuaternionTuple {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}

function readVector3(buffer: NonNullable<MmdPhysicsStepContext["inputTranslations"]>, index: number): AmmoVector3Tuple {
  const offset = index * 3;
  return [buffer[offset] ?? 0, buffer[offset + 1] ?? 0, buffer[offset + 2] ?? 0];
}

function writeVector3ToBuffer(
  buffer: MmdPhysicsMutableNumericBuffer | undefined,
  index: number,
  value: AmmoVector3Tuple
): void {
  if (!buffer) {
    return;
  }
  const offset = index * 3;
  buffer[offset] = value[0];
  buffer[offset + 1] = value[1];
  buffer[offset + 2] = value[2];
}

function writeQuaternionToBuffer(
  buffer: MmdPhysicsMutableNumericBuffer | undefined,
  index: number,
  value: AmmoQuaternionTuple
): void {
  if (!buffer) {
    return;
  }
  const offset = index * 4;
  buffer[offset] = value[0];
  buffer[offset + 1] = value[1];
  buffer[offset + 2] = value[2];
  buffer[offset + 3] = value[3];
}

function writeMatrixToBuffer(
  buffer: MmdPhysicsMutableNumericBuffer | undefined,
  index: number,
  value: MmdPhysicsMatrix4ColumnMajorTuple
): void {
  if (!buffer) {
    return;
  }
  const offset = index * 16;
  for (let i = 0; i < 16; i += 1) {
    buffer[offset + i] = value[i];
  }
}

function collisionGroupMask(group: number): number {
  return 1 << clampInteger(group, 0, 15);
}

function collisionFilterMask(body: AmmoRigidBodyData): number {
  return isZeroVolumeRigidBody(body) ? 0 : body.mask & 0xffff;
}

function rigidBodyDebugName(body: AmmoRigidBodyData): string {
  return body.name || "rigidBody";
}

function symmetricSpan(lower: number, upper: number): number {
  return Math.max(Math.abs(lower), Math.abs(upper), 0);
}

function averageVector(values: readonly [number, number, number]): number {
  return (values[0] + values[1] + values[2]) / 3;
}

function isZeroVolumeRigidBody(body: AmmoRigidBodyData): boolean {
  if (body.shape === "box") {
    return body.size[0] === 0 || body.size[1] === 0 || body.size[2] === 0;
  }
  if (body.shape === "capsule") {
    return body.size[0] === 0 || body.size[1] === 0;
  }
  return body.size[0] === 0;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function isRigidBodyPhysicsEnabled(body: AmmoRigidBodyData, context: AmmoStepContext): boolean {
  if (body.boneIndex < 0) {
    return true;
  }
  const toggle = context.bonePhysicsToggles?.[body.boneIndex];
  if (toggle !== undefined) {
    return toggle !== false && toggle !== 0;
  }
  return true;
}

function sortBindingsByBoneDepth(
  bindings: readonly AmmoRigidBodyBinding[],
  context: AmmoStepContext
): AmmoRigidBodyBinding[] {
  const depths = new Map<number, number>();
  return bindings
    .map((binding, order) => ({
      binding,
      order,
      depth: rigidBodyBoneDepth(binding.body, context, depths)
    }))
    .sort((left, right) => left.depth - right.depth || left.order - right.order)
    .map((entry) => entry.binding);
}

function rigidBodyBoneDepth(
  body: AmmoRigidBodyData,
  context: AmmoStepContext,
  depths: Map<number, number>
): number {
  if (body.boneIndex < 0 || body.boneIndex >= context.skeleton.bones.length) {
    return Number.MAX_SAFE_INTEGER;
  }
  return boneDepth(body.boneIndex, context, depths, new Set());
}

function boneDepth(
  boneIndex: number,
  context: AmmoStepContext,
  depths: Map<number, number>,
  visiting: Set<number>
): number {
  const cached = depths.get(boneIndex);
  if (cached !== undefined) {
    return cached;
  }
  if (visiting.has(boneIndex)) {
    return Number.MAX_SAFE_INTEGER;
  }
  const bone = context.skeleton.bones[boneIndex];
  if (!bone) {
    return Number.MAX_SAFE_INTEGER;
  }
  visiting.add(boneIndex);
  const parentIndex = bone.parentIndex;
  const depth =
    parentIndex < 0 || parentIndex >= context.skeleton.bones.length
      ? 0
      : boneDepth(parentIndex, context, depths, visiting) + 1;
  visiting.delete(boneIndex);
  depths.set(boneIndex, depth);
  return depth;
}

function scaleVector(
  vector: readonly [number, number, number],
  scale: number
): [number, number, number] {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function isZeroVector(vector: readonly [number, number, number]): boolean {
  return vector[0] === 0 && vector[1] === 0 && vector[2] === 0;
}

function mmdVectorToPhysics(vector: readonly [number, number, number]): [number, number, number] {
  return [vector[0], vector[1], -vector[2]];
}

function mmdQuaternionToPhysics(
  quaternion: readonly [number, number, number, number]
): [number, number, number, number] {
  return normalizeQuaternion([-quaternion[0], -quaternion[1], quaternion[2], quaternion[3]]);
}

function mmdTransformToPhysics(transform: {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number, number];
}): { position: [number, number, number]; rotation: [number, number, number, number] } {
  return {
    position: mmdVectorToPhysics(transform.position),
    rotation: mmdQuaternionToPhysics(transform.rotation)
  };
}

function physicsTransformToMmd(transform: {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number, number];
}): { position: [number, number, number]; rotation: [number, number, number, number] } {
  return {
    position: mmdVectorToPhysics(transform.position),
    rotation: mmdQuaternionToPhysics(transform.rotation)
  };
}

function mmdJointLimitsToPhysics(
  joint: AmmoJointData
): {
  translationLowerLimit: AmmoVector3Tuple;
  translationUpperLimit: AmmoVector3Tuple;
  rotationLowerLimit: AmmoVector3Tuple;
  rotationUpperLimit: AmmoVector3Tuple;
} {
  return {
    translationLowerLimit: [
      joint.translationLowerLimit[0],
      joint.translationLowerLimit[1],
      -joint.translationUpperLimit[2]
    ],
    translationUpperLimit: [
      joint.translationUpperLimit[0],
      joint.translationUpperLimit[1],
      -joint.translationLowerLimit[2]
    ],
    rotationLowerLimit: [
      -joint.rotationUpperLimit[0],
      -joint.rotationUpperLimit[1],
      joint.rotationLowerLimit[2]
    ],
    rotationUpperLimit: [
      -joint.rotationLowerLimit[0],
      -joint.rotationLowerLimit[1],
      joint.rotationUpperLimit[2]
    ]
  };
}

function normalizeQuaternion(
  quaternion: readonly [number, number, number, number]
): [number, number, number, number] {
  const length = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]) || 1;
  return [
    quaternion[0] / length,
    quaternion[1] / length,
    quaternion[2] / length,
    quaternion[3] / length
  ];
}

function addVectors(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtractVectors(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function matrixTransform(
  matrices: NonNullable<MmdPhysicsStepContext["inputWorldMatricesColumnMajor"]>,
  boneIndex: number
): { position: [number, number, number]; rotation: [number, number, number, number] } {
  const base = boneIndex * 16;
  return {
    position: [matrices[base + 12], matrices[base + 13], matrices[base + 14]],
    rotation: normalizeQuaternion(matrixRotation(matrices, base))
  };
}

class PhysicsWorldTransformCache {
  private readonly cache = new Map<
    number,
    { position: [number, number, number]; rotation: [number, number, number, number] }
  >();

  constructor(private readonly context: AmmoStepContext) {}

  get(boneIndex: number): {
    position: [number, number, number];
    rotation: [number, number, number, number];
  } {
    const cached = this.cache.get(boneIndex);
    if (cached) {
      return cached;
    }
    const world = matrixTransform(this.context.inputWorldMatricesColumnMajor, boneIndex);
    this.cache.set(boneIndex, world);
    return world;
  }

  set(
    boneIndex: number,
    world: { position: [number, number, number]; rotation: [number, number, number, number] }
  ): void {
    this.cache.set(boneIndex, {
      position: [...world.position] as [number, number, number],
      rotation: normalizeQuaternion(world.rotation)
    });
  }

  toLocal(
    world: { position: [number, number, number]; rotation: [number, number, number, number] },
    boneIndex: number
  ): { position: [number, number, number]; rotation: [number, number, number, number] } {
    const parentIndex = this.context.skeleton.bones[boneIndex]?.parentIndex ?? -1;
    if (parentIndex < 0) {
      return world;
    }
    const parent = this.get(parentIndex);
    const inverseParentRotation = invertQuaternion(parent.rotation);
    return {
      position: rotateVectorByQuaternion(
        subtractVectors(world.position, parent.position),
        inverseParentRotation
      ),
      rotation: normalizeQuaternion(multiplyQuaternions(inverseParentRotation, world.rotation))
    };
  }
}

function matrixRotation(matrices: readonly number[] | Float32Array | Float64Array, base: number): [number, number, number, number] {
  const m00 = matrices[base];
  const m01 = matrices[base + 4];
  const m02 = matrices[base + 8];
  const m10 = matrices[base + 1];
  const m11 = matrices[base + 5];
  const m12 = matrices[base + 9];
  const m20 = matrices[base + 2];
  const m21 = matrices[base + 6];
  const m22 = matrices[base + 10];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

function transformToColumnMajorMatrix(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number, number]
): MmdPhysicsMatrix4ColumnMajorTuple {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    1 - (yy + zz),
    xy + wz,
    xz - wy,
    0,
    xy - wz,
    1 - (xx + zz),
    yz + wx,
    0,
    xz + wy,
    yz - wx,
    1 - (xx + yy),
    0,
    position[0],
    position[1],
    position[2],
    1
  ];
}

function bodyOffsetFromBoneRest(
  body: AmmoRigidBodyData,
  context: AmmoStepContext
): { position: [number, number, number]; rotation: [number, number, number, number] } {
  const bone = context.skeleton.bones[body.boneIndex];
  if (!bone) {
    return {
      position: [...body.position],
      rotation: body.rotation
    };
  }
  return {
    position: subtractVectors(body.position, bone.position),
    rotation: body.rotation
  };
}

function ammoQuaternionToTuple(
  quaternion: AmmoQuaternion | undefined
): [number, number, number, number] | undefined {
  if (!quaternion?.x || !quaternion.y || !quaternion.z || !quaternion.w) {
    return undefined;
  }
  const tuple: [number, number, number, number] = [
    quaternion.x(),
    quaternion.y(),
    quaternion.z(),
    quaternion.w()
  ];
  if (!tuple.every(Number.isFinite)) {
    return undefined;
  }
  return normalizeQuaternion(tuple);
}

function relativePhysicsTransform(
  transform: {
    position: readonly [number, number, number];
    rotation: readonly [number, number, number, number];
  },
  parent: {
    position: readonly [number, number, number];
    rotation: readonly [number, number, number, number];
  }
): { position: [number, number, number]; rotation: [number, number, number, number] } {
  const inverseParentRotation = invertQuaternion(parent.rotation);
  return {
    position: rotateVectorByQuaternion(
      subtractVectors(transform.position, parent.position),
      inverseParentRotation
    ),
    rotation: normalizeQuaternion(multiplyQuaternions(inverseParentRotation, transform.rotation))
  };
}

function invertQuaternion(
  quaternion: readonly [number, number, number, number]
): [number, number, number, number] {
  const lengthSquared =
    quaternion[0] * quaternion[0] +
    quaternion[1] * quaternion[1] +
    quaternion[2] * quaternion[2] +
    quaternion[3] * quaternion[3];
  if (lengthSquared <= 0) {
    return [0, 0, 0, 1];
  }
  const inverseLength = 1 / lengthSquared;
  return [
    -quaternion[0] * inverseLength,
    -quaternion[1] * inverseLength,
    -quaternion[2] * inverseLength,
    quaternion[3] * inverseLength
  ];
}

function multiplyQuaternions(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

function quaternionToAngularVelocity(
  quaternion: readonly [number, number, number, number],
  factor: number
): [number, number, number] {
  const normalized = normalizeQuaternion(quaternion);
  const sign = normalized[3] < 0 ? -1 : 1;
  const x = normalized[0] * sign;
  const y = normalized[1] * sign;
  const z = normalized[2] * sign;
  const w = normalized[3] * sign;
  const sinHalfAngle = Math.hypot(x, y, z);
  if (sinHalfAngle < 1e-6) {
    return [0, 0, 0];
  }
  const angle = 2 * Math.atan2(sinHalfAngle, w);
  const scale = (angle * factor) / sinHalfAngle;
  return [x * scale, y * scale, z * scale];
}

function rotateVectorByQuaternion(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): [number, number, number] {
  const qVector: [number, number, number, number] = [vector[0], vector[1], vector[2], 0];
  const rotated = multiplyQuaternions(
    multiplyQuaternions(quaternion, qVector),
    invertQuaternion(quaternion)
  );
  return [rotated[0], rotated[1], rotated[2]];
}
