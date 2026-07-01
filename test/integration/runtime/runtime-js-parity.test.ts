import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { DefaultMmdRuntime, ThreeMmdLoader } from "../../../src/index.js";
import type {
  MmdAnimation,
  MmdPhysicsBackend,
  MmdPhysicsJoint,
  MmdPhysicsRigidBody,
  MmdPhysicsSkeleton,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult,
  MmdRuntime
} from "../../../src/index.js";

const fixtureOutputDir = resolve("test/fixtures/generated/runtime-js-parity");
const modelPath = resolve(fixtureOutputDir, "minimal-loader-smoke.pmx");
const skinningModelPath = resolve(fixtureOutputDir, "bdef2-two-bone-strip.pmx");
const appendModelPath = resolve(fixtureOutputDir, "append-rotate-ascii.pmx");
const ikModelPath = resolve(fixtureOutputDir, "ik-chain-ascii.pmx");
const physicsModelPath = resolve(fixtureOutputDir, "physics-handoff-ascii.pmx");
const vmdOutputDir = resolve(fixtureOutputDir, "camera-light-vmd");
const skinningVmdOutputDir = resolve(fixtureOutputDir, "skinning-vmd");
const appendVmdOutputDir = resolve(fixtureOutputDir, "append-vmd");
const ikVmdOutputDir = resolve(fixtureOutputDir, "ik-vmd");
const morphVmdOutputDir = resolve(fixtureOutputDir, "morph-vmd");
const pmxGeneratorPath = resolve("scripts/fixtures/generate-minimal-pmx.mjs");
const vmdGeneratorPath = resolve("scripts/fixtures/generate-minimal-vmd.mjs");
const execFileAsync = promisify(execFile);
const epsilon = 1e-5;
const frameRate = 30;

describe("runtime JS parity generated fixtures", () => {
  beforeAll(async () => {
    await execFileAsync(process.execPath, [
      pmxGeneratorPath,
      "--output",
      modelPath
    ]);
    await execFileAsync(process.execPath, [
      pmxGeneratorPath,
      "--skinning-case",
      "bdef2-two-bone-strip",
      "--output",
      skinningModelPath
    ]);
    await execFileAsync(process.execPath, [
      pmxGeneratorPath,
      "--case",
      "append-rotate-ascii",
      "--output",
      appendModelPath
    ]);
    await execFileAsync(process.execPath, [
      pmxGeneratorPath,
      "--case",
      "ik-chain-ascii",
      "--output",
      ikModelPath
    ]);
    await execFileAsync(process.execPath, [
      pmxGeneratorPath,
      "--case",
      "physics-handoff-ascii",
      "--output",
      physicsModelPath
    ]);
    await execFileAsync(process.execPath, [
      vmdGeneratorPath,
      "--camera-light",
      "--output-dir",
      vmdOutputDir
    ]);
    await execFileAsync(process.execPath, [
      vmdGeneratorPath,
      "--output-dir",
      skinningVmdOutputDir
    ]);
    await execFileAsync(process.execPath, [
      vmdGeneratorPath,
      "--append",
      "--output-dir",
      appendVmdOutputDir
    ]);
    await execFileAsync(process.execPath, [
      vmdGeneratorPath,
      "--ik",
      "--output-dir",
      ikVmdOutputDir
    ]);
    await execFileAsync(process.execPath, [
      vmdGeneratorPath,
      "--morph",
      "--output-dir",
      morphVmdOutputDir
    ]);
  });

  it.each([
    {
      target: "camera",
      motionPath: resolve(vmdOutputDir, "camera-near.vmd"),
      readState: flattenCameraState,
      comparedValues: 9
    },
    {
      target: "light",
      motionPath: resolve(vmdOutputDir, "light-front.vmd"),
      readState: flattenLightState,
      comparedValues: 6
    }
  ])("matches TypeScript and mmd-anim/WASM $target sampling", async ({ motionPath, readState, comparedValues }) => {
    const candidate = await loadRuntimeCase("mmd-anim", modelPath, motionPath);
    const baseline = await loadRuntimeCase("js", modelPath, motionPath);

    candidate.runtime.evaluate(0, { physics: false });
    baseline.runtime.evaluate(0, { physics: false });

    const metrics = compareValues(readState(candidate.runtime), readState(baseline.runtime));

    expect(metrics.comparedValues).toBe(comparedValues);
    expect(metrics.finite).toBe(true);
    expect(metrics.maxAbsError).toBeLessThanOrEqual(epsilon);
  });

  it("matches TypeScript and mmd-anim/WASM bone VMD sampling", async () => {
    const motionPath = resolve(skinningVmdOutputDir, "bend-two-bone-90.vmd");
    const candidate = await loadRuntimeCase("mmd-anim", skinningModelPath, motionPath);
    const baseline = await loadRuntimeCase("js", skinningModelPath, motionPath);

    candidate.runtime.evaluate(0, { physics: false });
    baseline.runtime.evaluate(0, { physics: false });

    const metrics = compareValues(readBoneSamplingState(candidate.runtime), readBoneSamplingState(baseline.runtime));

    expect(metrics.comparedValues).toBe(32);
    expect(metrics.finite).toBe(true);
    expect(metrics.maxAbsError).toBeLessThanOrEqual(epsilon);
  });

  it("matches TypeScript and mmd-anim/WASM append transform stage", async () => {
    const motionPath = resolve(appendVmdOutputDir, "rotate-append-source-90.vmd");
    const candidate = await loadRuntimeCase("mmd-anim", appendModelPath, motionPath);
    const baseline = await loadRuntimeCase("js", appendModelPath, motionPath);

    candidate.runtime.evaluate(0, { physics: false });
    baseline.runtime.evaluate(0, { physics: false });

    const metrics = compareValues(readAppendTransformState(candidate.runtime), readAppendTransformState(baseline.runtime));
    const appendEffectMetrics = compareValues(readAppendTransformState(baseline.runtime), readBoneSamplingState(baseline.runtime));

    expect(metrics.comparedValues).toBe(48);
    expect(metrics.finite).toBe(true);
    expect(metrics.maxAbsError).toBeLessThanOrEqual(epsilon);
    expect(appendEffectMetrics.maxAbsError).toBeGreaterThan(0.1);
  });

  it("matches TypeScript and mmd-anim/WASM IK stage", async () => {
    const motionPath = resolve(ikVmdOutputDir, "ik-target-offset.vmd");
    const candidate = await loadRuntimeCase("mmd-anim", ikModelPath, motionPath);
    const baseline = await loadRuntimeCase("js", ikModelPath, motionPath);

    candidate.runtime.evaluate(0, { physics: false });
    baseline.runtime.evaluate(0, { physics: false });

    const metrics = compareValues(readIkState(candidate.runtime), readIkState(baseline.runtime));
    const ikEffectMetrics = compareValues(readIkState(baseline.runtime), readBoneSamplingState(baseline.runtime));

    expect(metrics.comparedValues).toBe(96);
    expect(metrics.finite).toBe(true);
    expect(metrics.maxAbsError).toBeLessThanOrEqual(epsilon);
    expect(ikEffectMetrics.maxAbsError).toBeGreaterThan(0.0001);
  });

  it("matches TypeScript and mmd-anim/WASM morph sync", async () => {
    const motionPath = resolve(morphVmdOutputDir, "tiny-raise-half.vmd");
    const candidate = await loadRuntimeCase("mmd-anim", modelPath, motionPath);
    const baseline = await loadRuntimeCase("js", modelPath, motionPath);

    candidate.runtime.evaluate(0, { physics: false });
    baseline.runtime.evaluate(0, { physics: false });

    const candidateWeights = readMorphWeights(candidate.runtime);
    const baselineWeights = readMorphWeights(baseline.runtime);
    const metrics = compareValues(candidateWeights, baselineWeights);

    expect(metrics.comparedValues).toBe(1);
    expect(metrics.finite).toBe(true);
    expect(metrics.maxAbsError).toBeLessThanOrEqual(epsilon);
    expect(baselineWeights[0]).toBeCloseTo(0.5, 6);
  });

  it("matches TypeScript and mmd-anim/WASM physics handoff input", async () => {
    const candidateBackend = new RecordingPhysicsBackend();
    const baselineBackend = new RecordingPhysicsBackend();
    const candidate = await loadPhysicsRuntimeCase("mmd-anim", physicsModelPath, candidateBackend);
    const baseline = await loadPhysicsRuntimeCase("js", physicsModelPath, baselineBackend);

    candidate.runtime.evaluate(0);
    baseline.runtime.evaluate(0);

    const candidateSnapshot = candidateBackend.requireSnapshot();
    const baselineSnapshot = baselineBackend.requireSnapshot();
    const metrics = compareValues(
      flattenPhysicsContextNumbers(candidateSnapshot),
      flattenPhysicsContextNumbers(baselineSnapshot)
    );

    expect(stripPhysicsContextNumbers(candidateSnapshot)).toEqual(stripPhysicsContextNumbers(baselineSnapshot));
    expect(candidateSnapshot.rigidBodies).toHaveLength(1);
    expect(candidateSnapshot.joints).toHaveLength(0);
    expect(candidateSnapshot.inputTranslations).toHaveLength(3);
    expect(candidateSnapshot.inputRotations).toHaveLength(4);
    expect(candidateSnapshot.inputWorldMatricesColumnMajor).toHaveLength(16);
    expect(candidateSnapshot.bonePhysicsToggles).toEqual([1]);
    expect(metrics.comparedValues).toBeGreaterThan(0);
    expect(metrics.finite).toBe(true);
    expect(metrics.maxAbsError).toBeLessThanOrEqual(epsilon);
  });
});

async function loadRuntimeCase(kind: "mmd-anim" | "js", currentModelPath: string, motionPath: string) {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(currentModelPath),
    readFile(motionPath)
  ]);
  const loader = kind === "mmd-anim"
    ? new ThreeMmdLoader({
        runtime: {
          frameRate,
          physics: "none"
        }
      })
    : new ThreeMmdLoader({
        runtimeFactory: () => new DefaultMmdRuntime({
          frameRate,
          physics: "none"
        })
      });
  const model = await loader.loadModel(modelBytes);
  const animation = await loader.loadAnimation(motionBytes);
  model.runtime.setAnimation(animation.animation, model.mesh);
  return { model, runtime: model.runtime };
}

async function loadPhysicsRuntimeCase(
  kind: "mmd-anim" | "js",
  currentModelPath: string,
  physicsBackend: MmdPhysicsBackend
) {
  const modelBytes = await readFile(currentModelPath);
  const loader = kind === "mmd-anim"
    ? new ThreeMmdLoader({
        runtime: {
          frameRate,
          physics: "external",
          physicsBackend
        }
      })
    : new ThreeMmdLoader({
        runtimeFactory: () => new DefaultMmdRuntime({
          frameRate,
          physics: "external",
          physicsBackend
        })
      });
  const model = await loader.loadModel(modelBytes);
  model.runtime.setAnimation(createEmptyAnimation(), model.mesh);
  return { model, runtime: model.runtime };
}

function readBoneSamplingState(runtime: MmdRuntime): readonly number[] {
  return runtime.debugState().stages.vmdInterpolation.worldMatricesColumnMajor;
}

function readAppendTransformState(runtime: MmdRuntime): readonly number[] {
  return runtime.debugState().stages.appendTransform.worldMatricesColumnMajor;
}

function readIkState(runtime: MmdRuntime): readonly number[] {
  return runtime.debugState().stages.ik.worldMatricesColumnMajor;
}

function readMorphWeights(runtime: MmdRuntime): readonly number[] {
  return runtime.debugState().stages.vmdInterpolation.morphWeights;
}

function flattenCameraState(runtime: MmdRuntime): number[] {
  const state = runtime.cameraState();
  if (state === undefined) {
    throw new Error("runtime did not produce a camera state");
  }
  return [
    state.distance,
    state.position[0],
    state.position[1],
    state.position[2],
    state.rotation[0],
    state.rotation[1],
    state.rotation[2],
    state.fov,
    state.perspective ? 1 : 0
  ];
}

function flattenLightState(runtime: MmdRuntime): number[] {
  const state = runtime.lightState();
  if (state === undefined) {
    throw new Error("runtime did not produce a light state");
  }
  return [
    state.color[0],
    state.color[1],
    state.color[2],
    state.direction[0],
    state.direction[1],
    state.direction[2]
  ];
}

function compareValues(candidate: readonly number[], baseline: readonly number[]) {
  if (candidate.length !== baseline.length) {
    throw new Error(`runtime state length mismatch: candidate=${candidate.length}, baseline=${baseline.length}`);
  }
  let maxAbsError = 0;
  let finite = true;
  for (let index = 0; index < baseline.length; index += 1) {
    const left = candidate[index] ?? Number.NaN;
    const right = baseline[index] ?? Number.NaN;
    finite &&= Number.isFinite(left) && Number.isFinite(right);
    maxAbsError = Math.max(maxAbsError, Math.abs(left - right));
  }
  return {
    maxAbsError,
    comparedValues: baseline.length,
    finite
  };
}

interface PhysicsContextSnapshot {
  readonly seconds: number;
  readonly deltaSeconds: number;
  readonly frame: number;
  readonly frameRate: number;
  readonly seeking: boolean | undefined;
  readonly skeleton: {
    readonly bones: Array<{
      readonly index: number;
      readonly name: string | undefined;
      readonly parentIndex: number | undefined;
      readonly restTranslation: readonly number[] | undefined;
      readonly restRotation: readonly number[] | undefined;
      readonly transformAfterPhysics: boolean | undefined;
    }>;
  } | undefined;
  readonly rigidBodies: Array<{
    readonly index: number;
    readonly name: string | undefined;
    readonly boneIndex: number | undefined;
    readonly motionType: string;
    readonly shape: {
      readonly type: string;
      readonly size: readonly number[];
    };
    readonly localTranslation: readonly number[] | undefined;
    readonly localRotation: readonly number[] | undefined;
    readonly mass: number | undefined;
    readonly linearDamping: number | undefined;
    readonly angularDamping: number | undefined;
    readonly restitution: number | undefined;
    readonly friction: number | undefined;
    readonly collisionGroup: number | undefined;
    readonly collisionMask: number | undefined;
  }>;
  readonly joints: Array<{
    readonly index: number;
    readonly name: string | undefined;
    readonly rigidBodyIndexA: number;
    readonly rigidBodyIndexB: number;
    readonly translation: readonly number[] | undefined;
    readonly rotation: readonly number[] | undefined;
    readonly linearLimit: {
      readonly lower: readonly number[];
      readonly upper: readonly number[];
    } | undefined;
    readonly angularLimit: {
      readonly lower: readonly number[];
      readonly upper: readonly number[];
    } | undefined;
    readonly spring: {
      readonly linear: readonly number[] | undefined;
      readonly angular: readonly number[] | undefined;
    } | undefined;
  }>;
  readonly inputTranslations: readonly number[];
  readonly inputRotations: readonly number[];
  readonly inputWorldMatricesColumnMajor: readonly number[];
  readonly bonePhysicsToggles: readonly number[];
  readonly morphImpulses: Array<{
    readonly morphIndex: number;
    readonly weight: number;
    readonly rigidBodyIndex: number | undefined;
    readonly local: boolean | undefined;
    readonly force: readonly number[] | undefined;
    readonly torque: readonly number[] | undefined;
  }>;
}

class RecordingPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "recording-physics";
  readonly disabled = false;
  readonly disposed = false;
  private snapshot: PhysicsContextSnapshot | undefined;

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    this.snapshot = snapshotPhysicsContext(context);
    return { simulated: false };
  }

  requireSnapshot(): PhysicsContextSnapshot {
    if (!this.snapshot) {
      throw new Error("physics backend did not receive a step context");
    }
    return this.snapshot;
  }
}

function snapshotPhysicsContext(context: MmdPhysicsStepContext): PhysicsContextSnapshot {
  return {
    seconds: context.seconds,
    deltaSeconds: context.deltaSeconds,
    frame: context.frame,
    frameRate: context.frameRate,
    seeking: context.seeking,
    skeleton: snapshotSkeleton(context.skeleton),
    rigidBodies: (context.rigidBodies ?? []).map(snapshotRigidBody),
    joints: (context.joints ?? []).map(snapshotJoint),
    inputTranslations: copyNumbers(context.inputTranslations) ?? [],
    inputRotations: copyNumbers(context.inputRotations) ?? [],
    inputWorldMatricesColumnMajor: copyNumbers(context.inputWorldMatricesColumnMajor) ?? [],
    bonePhysicsToggles: copyToggleNumbers(context.bonePhysicsToggles),
    morphImpulses: (context.morphImpulses ?? []).map((impulse) => ({
      morphIndex: impulse.morphIndex,
      weight: impulse.weight,
      rigidBodyIndex: impulse.rigidBodyIndex,
      local: impulse.local,
      force: copyNumbers(impulse.force),
      torque: copyNumbers(impulse.torque)
    }))
  };
}

function snapshotSkeleton(skeleton: MmdPhysicsSkeleton | undefined): PhysicsContextSnapshot["skeleton"] {
  if (!skeleton) {
    return undefined;
  }
  return {
    bones: skeleton.bones.map((bone) => ({
      index: bone.index,
      name: bone.name,
      parentIndex: bone.parentIndex,
      restTranslation: copyNumbers(bone.restTranslation),
      restRotation: copyNumbers(bone.restRotation),
      transformAfterPhysics: bone.transformAfterPhysics
    }))
  };
}

function snapshotRigidBody(body: MmdPhysicsRigidBody): PhysicsContextSnapshot["rigidBodies"][number] {
  return {
    index: body.index,
    name: body.name,
    boneIndex: body.boneIndex,
    motionType: body.motionType,
    shape: {
      type: body.shape.type,
      size: copyNumbers(body.shape.size) ?? []
    },
    localTranslation: copyNumbers(body.localTranslation),
    localRotation: copyNumbers(body.localRotation),
    mass: body.mass,
    linearDamping: body.linearDamping,
    angularDamping: body.angularDamping,
    restitution: body.restitution,
    friction: body.friction,
    collisionGroup: body.collisionGroup,
    collisionMask: body.collisionMask
  };
}

function snapshotJoint(joint: MmdPhysicsJoint): PhysicsContextSnapshot["joints"][number] {
  return {
    index: joint.index,
    name: joint.name,
    rigidBodyIndexA: joint.rigidBodyIndexA,
    rigidBodyIndexB: joint.rigidBodyIndexB,
    translation: copyNumbers(joint.translation),
    rotation: copyNumbers(joint.rotation),
    linearLimit: joint.linearLimit
      ? {
          lower: copyNumbers(joint.linearLimit.lower) ?? [],
          upper: copyNumbers(joint.linearLimit.upper) ?? []
        }
      : undefined,
    angularLimit: joint.angularLimit
      ? {
          lower: copyNumbers(joint.angularLimit.lower) ?? [],
          upper: copyNumbers(joint.angularLimit.upper) ?? []
        }
      : undefined,
    spring: joint.spring
      ? {
          linear: copyNumbers(joint.spring.linear),
          angular: copyNumbers(joint.spring.angular)
        }
      : undefined
  };
}

function stripPhysicsContextNumbers(snapshot: PhysicsContextSnapshot): unknown {
  return {
    seconds: "number",
    deltaSeconds: "number",
    frame: "number",
    frameRate: "number",
    seeking: snapshot.seeking,
    skeleton: snapshot.skeleton
      ? {
          bones: snapshot.skeleton.bones.map((bone) => ({
            index: bone.index,
            name: bone.name,
            parentIndex: bone.parentIndex,
            restTranslationLength: bone.restTranslation?.length,
            restRotationLength: bone.restRotation?.length,
            transformAfterPhysics: bone.transformAfterPhysics
          }))
        }
      : undefined,
    rigidBodies: snapshot.rigidBodies.map((body) => ({
      index: body.index,
      name: body.name,
      boneIndex: body.boneIndex,
      motionType: body.motionType,
      shapeType: body.shape.type,
      shapeSizeLength: body.shape.size.length,
      localTranslationLength: body.localTranslation?.length,
      localRotationLength: body.localRotation?.length,
      collisionGroup: body.collisionGroup,
      collisionMask: body.collisionMask
    })),
    joints: snapshot.joints.map((joint) => ({
      index: joint.index,
      name: joint.name,
      rigidBodyIndexA: joint.rigidBodyIndexA,
      rigidBodyIndexB: joint.rigidBodyIndexB,
      translationLength: joint.translation?.length,
      rotationLength: joint.rotation?.length,
      linearLimitLowerLength: joint.linearLimit?.lower.length,
      linearLimitUpperLength: joint.linearLimit?.upper.length,
      angularLimitLowerLength: joint.angularLimit?.lower.length,
      angularLimitUpperLength: joint.angularLimit?.upper.length,
      springLinearLength: joint.spring?.linear?.length,
      springAngularLength: joint.spring?.angular?.length
    })),
    inputTranslationsLength: snapshot.inputTranslations.length,
    inputRotationsLength: snapshot.inputRotations.length,
    inputWorldMatricesColumnMajorLength: snapshot.inputWorldMatricesColumnMajor.length,
    bonePhysicsTogglesLength: snapshot.bonePhysicsToggles.length,
    morphImpulses: snapshot.morphImpulses.map((impulse) => ({
      morphIndex: impulse.morphIndex,
      rigidBodyIndex: impulse.rigidBodyIndex,
      local: impulse.local,
      forceLength: impulse.force?.length,
      torqueLength: impulse.torque?.length
    }))
  };
}

function flattenPhysicsContextNumbers(snapshot: PhysicsContextSnapshot): number[] {
  const values = [
    snapshot.seconds,
    snapshot.deltaSeconds,
    snapshot.frame,
    snapshot.frameRate
  ];
  for (const bone of snapshot.skeleton?.bones ?? []) {
    values.push(bone.index, bone.parentIndex ?? -1);
    pushNumbers(values, bone.restTranslation);
    pushNumbers(values, bone.restRotation);
    values.push(bone.transformAfterPhysics ? 1 : 0);
  }
  for (const body of snapshot.rigidBodies) {
    values.push(
      body.index,
      body.boneIndex ?? -1,
      body.mass ?? 0,
      body.linearDamping ?? 0,
      body.angularDamping ?? 0,
      body.restitution ?? 0,
      body.friction ?? 0,
      body.collisionGroup ?? -1,
      body.collisionMask ?? -1
    );
    pushNumbers(values, body.shape.size);
    pushNumbers(values, body.localTranslation);
    pushNumbers(values, body.localRotation);
  }
  for (const joint of snapshot.joints) {
    values.push(joint.index, joint.rigidBodyIndexA, joint.rigidBodyIndexB);
    pushNumbers(values, joint.translation);
    pushNumbers(values, joint.rotation);
    pushNumbers(values, joint.linearLimit?.lower);
    pushNumbers(values, joint.linearLimit?.upper);
    pushNumbers(values, joint.angularLimit?.lower);
    pushNumbers(values, joint.angularLimit?.upper);
    pushNumbers(values, joint.spring?.linear);
    pushNumbers(values, joint.spring?.angular);
  }
  pushNumbers(values, snapshot.inputTranslations);
  pushNumbers(values, snapshot.inputRotations);
  pushNumbers(values, snapshot.inputWorldMatricesColumnMajor);
  pushNumbers(values, snapshot.bonePhysicsToggles);
  for (const impulse of snapshot.morphImpulses) {
    values.push(
      impulse.morphIndex,
      impulse.weight,
      impulse.rigidBodyIndex ?? -1,
      impulse.local ? 1 : 0
    );
    pushNumbers(values, impulse.force);
    pushNumbers(values, impulse.torque);
  }
  return values;
}

function pushNumbers(target: number[], values: readonly number[] | undefined): void {
  if (!values) {
    return;
  }
  for (const value of values) {
    target.push(value);
  }
}

function copyNumbers(values: ArrayLike<number> | undefined): number[] | undefined {
  return values === undefined ? undefined : Array.from(values);
}

function copyToggleNumbers(values: readonly boolean[] | ArrayLike<number> | undefined): number[] {
  if (values === undefined) {
    return [];
  }
  const source = values as ArrayLike<number | boolean>;
  const result: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    result.push(value === true ? 1 : value === false ? 0 : value);
  }
  return result;
}

function createEmptyAnimation(): MmdAnimation {
  return {
    kind: "vmd",
    bytes: new Uint8Array(),
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
