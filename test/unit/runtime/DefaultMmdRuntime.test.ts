import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { DefaultMmdRuntime } from "../../../src/index.js";
import type {
  MmdPhysicsBackend,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult
} from "../../../src/physics/index.js";

describe("DefaultMmdRuntime", () => {
  it("starts with a finite zero frame state by default", () => {
    const runtime = new DefaultMmdRuntime();

    expect(runtime.frameState()).toEqual({
      seconds: 0,
      frame: 0,
      frameRate: 30
    });
  });

  it("updates only the frame state when evaluated", () => {
    const runtime = new DefaultMmdRuntime({ frameRate: 60 });

    expect(runtime.evaluate(1.25)).toEqual({
      seconds: 1.25,
      frame: 75,
      frameRate: 60
    });
    expect(runtime.frameState()).toEqual({
      seconds: 1.25,
      frame: 75,
      frameRate: 60
    });
  });

  it("resets to zero seconds unless a seek time is provided", () => {
    const runtime = new DefaultMmdRuntime({ initialSeconds: 2 });

    expect(runtime.frameState()).toEqual({
      seconds: 2,
      frame: 60,
      frameRate: 30
    });
    expect(runtime.reset()).toEqual({
      seconds: 0,
      frame: 0,
      frameRate: 30
    });
    expect(runtime.reset(0.5)).toEqual({
      seconds: 0.5,
      frame: 15,
      frameRate: 30
    });
  });

  it("rejects non-finite frame state inputs", () => {
    const runtime = new DefaultMmdRuntime();

    expect(() => new DefaultMmdRuntime({ frameRate: 0 })).toThrow(RangeError);
    expect(() => new DefaultMmdRuntime({ frameRate: Number.POSITIVE_INFINITY })).toThrow(
      RangeError
    );
    expect(() => new DefaultMmdRuntime({ initialSeconds: Number.NaN })).toThrow(RangeError);
    expect(() => runtime.evaluate(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(() => runtime.reset(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("returns frame state snapshots", () => {
    const runtime = new DefaultMmdRuntime();
    const state = runtime.frameState() as { seconds: number };

    state.seconds = 10;

    expect(runtime.frameState()).toEqual({
      seconds: 0,
      frame: 0,
      frameRate: 30
    });
  });

  it("expands group morph weights from model morph metadata", () => {
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.morphTargetDictionary = { group: 0, target: 1 };
    mesh.morphTargetInfluences = [0, 0];
    mesh.userData.mmdMorphs = [
      {
        type: "group",
        groupOffsets: [{ morphIndex: 1, weight: 2 }]
      },
      {
        type: "vertex",
        groupOffsets: []
      }
    ];
    const clip = new THREE.AnimationClip("group", 0, []);
    clip.userData = {
      mmdAnimation: {
        kind: "vmd",
        metadata: { format: "vmd", modelName: "", counts: {}, maxFrame: 0 },
        boneTracks: {},
        morphTracks: { group: [{ frame: 0, weight: 0.5 }] },
        cameraFrames: [],
        lightFrames: [],
        selfShadowFrames: [],
        propertyFrames: []
      }
    };

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(clip, mesh);
    runtime.evaluate(0);

    expect(mesh.morphTargetInfluences).toEqual([0.5, 1]);
  });

  it("applies the old package stateful spring physics pass when enabled", () => {
    const bone = new THREE.Bone();
    bone.name = "spring";
    bone.userData.mmdBoneName = "spring";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.userData.mmdPhysics = {
      rigidBodies: [
        {
          boneIndex: 0,
          mode: "dynamicBone",
          size: [1, 1, 1],
          mass: 1,
          linearDamping: 0
        }
      ],
      joints: []
    };
    const clip = new THREE.AnimationClip("spring", 0, []);
    clip.userData = {
      mmdAnimation: {
        kind: "vmd",
        metadata: { format: "vmd", modelName: "", counts: {}, maxFrame: 0 },
        boneTracks: {},
        morphTracks: {},
        cameraFrames: [],
        lightFrames: [],
        selfShadowFrames: [],
        propertyFrames: []
      }
    };

    const runtime = new DefaultMmdRuntime({ physics: "stateful-spring" });
    runtime.setAnimation(clip, mesh);
    runtime.evaluate(0);
    runtime.evaluate(1 / 30);

    expect(bone.position.y).toBeLessThan(0);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[13]).toBeLessThan(0);
  });

  it("applies bone morph offsets from expanded morph weights", () => {
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.morphTargetDictionary = { boneMorph: 0 };
    mesh.morphTargetInfluences = [0];
    mesh.userData.mmdMorphs = [
      {
        type: "bone",
        groupOffsets: [],
        boneOffsets: [
          {
            boneIndex: 0,
            translation: [0, 1, 0],
            rotation: [0, 0, 0, 1]
          }
        ]
      }
    ];
    const clip = new THREE.AnimationClip("boneMorph", 0, []);
    clip.userData = {
      mmdAnimation: {
        kind: "vmd",
        metadata: { format: "vmd", modelName: "", counts: {}, maxFrame: 0 },
        boneTracks: {},
        morphTracks: { boneMorph: [{ frame: 0, weight: 0.5 }] },
        cameraFrames: [],
        lightFrames: [],
        selfShadowFrames: [],
        propertyFrames: []
      }
    };

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(clip, mesh);
    runtime.evaluate(0);

    expect(bone.position.y).toBe(0.5);
  });

  it("propagates post-IK append transform reapplication through append chains", () => {
    const ikSource = new THREE.Bone();
    ikSource.name = "ikSource";
    const effector = new THREE.Bone();
    effector.name = "effector";
    effector.position.set(1, 0, 0);
    ikSource.add(effector);
    const goal = new THREE.Bone();
    goal.name = "goal";
    goal.position.set(0, 1, 0);
    const appendA = new THREE.Bone();
    appendA.name = "appendA";
    appendA.userData.mmdAppendTransform = { parentIndex: 0, weight: 1 };
    appendA.userData.mmdFlags = { appendRotate: true };
    const appendB = new THREE.Bone();
    appendB.name = "appendB";
    appendB.userData.mmdAppendTransform = { parentIndex: 3, weight: 1 };
    appendB.userData.mmdFlags = { appendRotate: true };
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(ikSource, goal, appendA, appendB);
    mesh.bind(new THREE.Skeleton([ikSource, effector, goal, appendA, appendB]));
    mesh.userData.mmdIkChains = [
      {
        goalBoneIndex: 2,
        effectorBoneIndex: 1,
        iterationCount: 4,
        maxAnglePerIteration: Math.PI,
        links: [{ boneIndex: 0 }]
      }
    ];

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(createEmptyMmdClip("append-chain"), mesh);
    runtime.evaluate(0);

    expect(Math.abs(appendA.quaternion.z)).toBeGreaterThan(0.5);
    expect(appendB.quaternion.z).toBeCloseTo(appendA.quaternion.z, 5);
    expect(appendB.quaternion.w).toBeCloseTo(appendA.quaternion.w, 5);
  });

  it("steps an external physics backend and applies updated local bone transforms", () => {
    const bone = new THREE.Bone();
    bone.name = "physics";
    bone.userData.mmdBoneName = "physics";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.userData.mmdPhysics = {
      rigidBodies: [
        {
          name: "body",
          boneIndex: 0,
          group: 1,
          mask: 0xffff,
          shape: "sphere",
          mode: "dynamic",
          size: [0.5, 0.5, 0.5],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mass: 1,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5
        }
      ],
      joints: []
    };
    const clip = new THREE.AnimationClip("external", 0, []);
    clip.userData = {
      mmdAnimation: {
        kind: "vmd",
        metadata: { format: "vmd", modelName: "", counts: {}, maxFrame: 0 },
        boneTracks: {},
        morphTracks: {},
        cameraFrames: [],
        lightFrames: [],
        selfShadowFrames: [],
        propertyFrames: []
      }
    };
    const backend = new TranslatingPhysicsBackend([1, 2, 3]);
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(clip, mesh);
    runtime.evaluate(1 / 30);

    expect(backend.stepCount).toBe(1);
    expect(backend.lastContext?.rigidBodies?.[0]?.motionType).toBe("dynamic");
    expect(bone.position.toArray()).toEqual([1, 2, -3]);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[12]).toBe(1);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[13]).toBe(2);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[14]).toBe(3);
  });

  it("skips and resets external physics when evaluate disables physics", () => {
    const bone = new THREE.Bone();
    bone.name = "physics";
    bone.userData.mmdBoneName = "physics";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.userData.mmdPhysics = {
      rigidBodies: [
        {
          name: "body",
          boneIndex: 0,
          group: 1,
          mask: 0xffff,
          shape: "sphere",
          mode: "dynamic",
          size: [0.5, 0.5, 0.5],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mass: 1,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5
        }
      ],
      joints: []
    };
    const backend = new TranslatingPhysicsBackend([1, 2, 3]);
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(createEmptyMmdClip("external-skip"), mesh);
    runtime.evaluate(0, { physics: false });
    runtime.evaluate(0, { physics: false });

    expect(backend.stepCount).toBe(0);
    expect(backend.resetCount).toBe(2);
    expect(bone.position.toArray()).toEqual([0, 0, 0]);
  });

  it("passes absolute MMD rest positions to an external physics backend", () => {
    const parent = new THREE.Bone();
    parent.name = "parent";
    parent.position.set(0, 10, -2);
    parent.userData.mmdBoneName = "parent";
    parent.userData.mmdRestPosition = [0, 10, 2];
    const child = new THREE.Bone();
    child.name = "child";
    child.position.set(1, -3, -4);
    child.userData.mmdBoneName = "child";
    child.userData.mmdRestPosition = [1, 7, 6];
    parent.add(child);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(parent);
    mesh.bind(new THREE.Skeleton([parent, child]));
    mesh.userData.mmdPhysics = {
      rigidBodies: [
        {
          name: "childBody",
          boneIndex: 1,
          group: 1,
          mask: 0xffff,
          shape: "sphere",
          mode: "dynamicBone",
          size: [0.5, 0.5, 0.5],
          position: [1, 7, 6],
          rotation: [0, 0, 0],
          mass: 1,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5
        }
      ],
      joints: []
    };
    const clip = createEmptyMmdClip("absolute-rest");
    const backend = new InspectingPhysicsBackend();
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(clip, mesh);
    runtime.evaluate(1 / 30);

    expect(backend.lastContext?.skeleton?.bones[0]?.restTranslation).toEqual([0, 10, 2]);
    expect(backend.lastContext?.skeleton?.bones[1]?.restTranslation).toEqual([1, 7, 6]);
  });

  it("remaps external physics joints and morph impulses after filtering unsupported bodies", () => {
    const bone = new THREE.Bone();
    bone.name = "body";
    bone.userData.mmdBoneName = "body";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.userData.mmdPhysics = {
      rigidBodies: [
        {
          name: "first",
          boneIndex: 0,
          group: 1,
          mask: 0xffff,
          shape: "sphere",
          mode: "dynamic",
          size: [0.5, 0.5, 0.5],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mass: 1,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5
        },
        {
          name: "unsupported",
          boneIndex: 0,
          group: 1,
          mask: 0xffff,
          shape: "unknown",
          mode: "unknown",
          size: [0.5, 0.5, 0.5],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mass: 1,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5
        },
        {
          name: "second",
          boneIndex: 0,
          group: 1,
          mask: 0xffff,
          shape: "sphere",
          mode: "dynamic",
          size: [0.5, 0.5, 0.5],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mass: 1,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5
        }
      ],
      joints: [
        {
          name: "kept",
          rigidBodyIndexA: 0,
          rigidBodyIndexB: 2,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          translationLowerLimit: [0, 0, 0],
          translationUpperLimit: [0, 0, 0],
          rotationLowerLimit: [0, 0, 0],
          rotationUpperLimit: [0, 0, 0],
          springTranslationFactor: [0, 0, 0],
          springRotationFactor: [0, 0, 0]
        }
      ]
    };
    mesh.userData.mmdMorphs = [
      {
        type: "impulse",
        groupOffsets: [],
        boneOffsets: [],
        impulseOffsets: [
          {
            rigidBodyIndex: 2,
            local: false,
            velocity: [1, 0, 0],
            torque: [0, 1, 0]
          }
        ]
      }
    ];
    const backend = new InspectingPhysicsBackend();
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(createEmptyMmdClip("remap-physics"), mesh);
    runtime.evaluate(1 / 30);

    expect(backend.lastContext?.rigidBodies).toHaveLength(2);
    expect(backend.lastContext?.joints?.[0]?.rigidBodyIndexA).toBe(0);
    expect(backend.lastContext?.joints?.[0]?.rigidBodyIndexB).toBe(1);
    expect(backend.lastContext?.morphImpulses?.[0]?.rigidBodyIndex).toBe(1);
  });
});

class TranslatingPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "test-external";
  readonly disabled = false;
  readonly disposed = false;
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
}

class InspectingPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "inspect";
  readonly disabled = false;
  readonly disposed = false;
  lastContext: MmdPhysicsStepContext | undefined;

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    this.lastContext = context;
    return { simulated: true };
  }
}

function createEmptyMmdClip(name: string): THREE.AnimationClip {
  const clip = new THREE.AnimationClip(name, 0, []);
  clip.userData = {
    mmdAnimation: {
      kind: "vmd",
      metadata: { format: "vmd", modelName: "", counts: {}, maxFrame: 0 },
      boneTracks: {},
      morphTracks: {},
      cameraFrames: [],
      lightFrames: [],
      selfShadowFrames: [],
      propertyFrames: []
    }
  };
  return clip;
}
