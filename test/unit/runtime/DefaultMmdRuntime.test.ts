import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { DefaultMmdRuntime } from "../../../src/index.js";
import type { MmdAnimation, VmdBoneFrame, VmdBoneTrack, VmdMorphFrame, VmdMorphTrack } from "../../../src/index.js";
import type {
  MmdDirectBufferPhysicsBackend,
  MmdPhysicsBackend,
  MmdPhysicsStepBufferLayout,
  MmdPhysicsStepBuffers,
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

  it("keeps tick render sync on the hot path allocation-free", async () => {
    const source = await readFile("src/runtime/core.ts", "utf8");

    expect(source).not.toContain("function normalizeTickOptions");
    expect(source).not.toContain("const { mesh, evaluateOptions } =");
    expect(source).not.toContain("evaluate(seconds: number, options: MmdRuntimeEvaluateOptions = {})");
    expect(source).not.toContain("this.state = createFrameState(seconds, this.frameRate);");
    expect(source).not.toContain(".traverse((");
    expect(source).toContain("let mesh: THREE.Object3D | null | undefined;");
    expect(source).toContain("let evaluateOptions: MmdRuntimeEvaluateOptions | undefined;");
    expect(source).toContain("evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions)");
    expect(source).toContain("writeFrameState(this.state, seconds, this.frameRate);");
    expect(source).toContain("return copyFrameStateInto(this.evaluateReturnState, this.state);");
    expect(source).toContain("function updateSkinnedMeshSkeletons(");
  });

  it("ticks evaluation and syncs renderer-facing skeleton matrices", () => {
    const bone = new THREE.Bone();
    bone.name = "moving";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const initialBoneMatrix = Array.from(mesh.skeleton.boneMatrices.slice(0, 16));

    const animation = createEmptyMmdAnimation();
    animation.metadata.maxFrame = 1;
    animation.boneTracks.moving = createBoneTrack([
      { frame: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { frame: 1, translation: [1, 2, 3], rotation: [0, 0, 0, 1] }
    ]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.tick(1 / 30, mesh, { physics: false });

    expect(Array.from(mesh.skeleton.boneMatrices.slice(0, 16))).not.toEqual(initialBoneMatrix);
    expect(renderedBoneWorldPosition(mesh, 0).toArray()).toEqual([1, 2, -3]);
  });

  it("accepts the consolidated tick options object with a render-sync mesh", () => {
    const bone = new THREE.Bone();
    bone.name = "moving";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const initialBoneMatrix = Array.from(mesh.skeleton.boneMatrices.slice(0, 16));
    const animation = createEmptyMmdAnimation();
    animation.metadata.maxFrame = 1;
    animation.boneTracks.moving = createBoneTrack([
      { frame: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { frame: 1, translation: [1, 0, 0], rotation: [0, 0, 0, 1] }
    ]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.tick(1 / 30, { mesh, physics: false });

    expect(Array.from(mesh.skeleton.boneMatrices.slice(0, 16))).not.toEqual(initialBoneMatrix);
    expect(renderedBoneWorldPosition(mesh, 0).x).toBeCloseTo(1);
  });

  it("ticks evaluation without render sync when mesh is omitted", () => {
    const bone = new THREE.Bone();
    bone.name = "moving";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const animation = createEmptyMmdAnimation();
    animation.metadata.maxFrame = 1;
    animation.boneTracks.moving = createBoneTrack([
      { frame: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { frame: 1, translation: [1, 0, 0], rotation: [0, 0, 0, 1] }
    ]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);

    expect(runtime.tick(1 / 30, { physics: false })).toEqual({
      seconds: 1 / 30,
      frame: 1,
      frameRate: 30
    });
    expect(bone.position.x).toBeCloseTo(1);
    expect(bone.position.y).toBeCloseTo(0);
    expect(bone.position.z).toBeCloseTo(0);
  });

  it("samples direct MMD animation bone translation with VMD Bezier interpolation", () => {
    const bone = new THREE.Bone();
    bone.name = "center";
    bone.userData.mmdBoneName = "センター";
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(createBezierTranslationAnimation(), mesh);
    runtime.tick(0.5, mesh, { ik: false, physics: false });

    expect(bone.position.x).toBeCloseTo(1.25, 3);
    expect(bone.position.y).toBeCloseTo(0);
    expect(bone.position.z).toBeCloseTo(0);
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

  it("splits seek, resetPose, and clearAnimation responsibilities", () => {
    const bone = new THREE.Bone();
    bone.name = "moving";
    bone.position.set(0.25, 0, 0);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    const animation = createEmptyMmdAnimation();
    animation.metadata.maxFrame = 30;
    animation.boneTracks.moving = createBoneTrack([
      { frame: 0, translation: [1, 0, 0], rotation: [0, 0, 0, 1] },
      { frame: 30, translation: [2, 0, 0], rotation: [0, 0, 0, 1] }
    ]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0, { ik: false, physics: false });
    expect(bone.position.x).toBeCloseTo(1.25);

    expect(runtime.seek(1)).toEqual({ seconds: 1, frame: 30, frameRate: 30 });
    expect(bone.position.x).toBeCloseTo(1.25);

    runtime.resetPose();
    expect(bone.position.x).toBeCloseTo(0.25);

    runtime.evaluate(1, { ik: false, physics: false });
    expect(bone.position.x).toBeCloseTo(2.25);

    runtime.clearAnimation();
    runtime.seek(0);
    runtime.evaluate(0, { ik: false, physics: false });

    expect(bone.position.x).toBeCloseTo(2.25);
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

  it("documents volatile evaluate returns while keeping frameState snapshots stable", async () => {
    const runtime = new DefaultMmdRuntime();
    const evaluated = runtime.evaluate(0);

    runtime.evaluate(1);

    expect(evaluated.seconds).toBe(1);
    const types = await readFile("src/runtime/types.ts", "utf8");
    expect(types).toContain("The returned state is volatile");
    expect(types).toContain("frameState() when you need to retain a stable snapshot");
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
    const animation = createEmptyMmdAnimation();
    animation.morphTracks.group = createMorphTrack([{ frame: 0, weight: 0.5 }]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0);

    expect(mesh.morphTargetInfluences).toEqual([0.5, 1]);
  });

  it("recursively expands nested group morph weights", () => {
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.morphTargetDictionary = { outer: 0, inner: 1, target: 2 };
    mesh.morphTargetInfluences = [0, 0, 0];
    mesh.userData.mmdMorphs = [
      {
        type: "group",
        groupOffsets: [{ morphIndex: 1, weight: 0.5 }]
      },
      {
        type: "group",
        groupOffsets: [{ morphIndex: 2, weight: 2 }]
      },
      {
        type: "vertex",
        groupOffsets: []
      }
    ];
    const animation = createEmptyMmdAnimation();
    animation.morphTracks.outer = createMorphTrack([{ frame: 0, weight: 1 }]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0);

    expect(mesh.morphTargetInfluences).toEqual([1, 0.5, 1]);
  });

  it("recursively expands flip morph weights through referenced groups without cycling", () => {
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.morphTargetDictionary = { flip: 0, group: 1, target: 2 };
    mesh.morphTargetInfluences = [0, 0, 0];
    mesh.userData.mmdMorphs = [
      {
        type: "flip",
        groupOffsets: [],
        flipOffsets: [{ morphIndex: 1, weight: 0.25 }]
      },
      {
        type: "group",
        groupOffsets: [
          { morphIndex: 2, weight: 4 },
          { morphIndex: 0, weight: 1 }
        ]
      },
      {
        type: "vertex",
        groupOffsets: []
      }
    ];
    const animation = createEmptyMmdAnimation();
    animation.morphTracks.flip = createMorphTrack([{ frame: 0, weight: 1 }]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0);

    expect(mesh.morphTargetInfluences).toEqual([1.25, 0.25, 1]);
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
    const animation = createEmptyMmdAnimation();

    const runtime = new DefaultMmdRuntime({ physics: "stateful-spring" });
    runtime.setAnimation(animation, mesh);
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
    const animation = createEmptyMmdAnimation();
    animation.morphTracks.boneMorph = createMorphTrack([{ frame: 0, weight: 0.5 }]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
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
    runtime.setAnimation(createEmptyMmdAnimation(), mesh);
    runtime.evaluate(0);

    expect(Math.abs(appendA.quaternion.z)).toBeGreaterThan(0.5);
    expect(appendB.quaternion.z).toBeCloseTo(appendA.quaternion.z, 5);
    expect(appendB.quaternion.w).toBeCloseTo(appendA.quaternion.w, 5);
  });

  it("evaluates append transforms by PMX layer before bone array order", () => {
    const source = new THREE.Bone();
    source.name = "source";
    source.userData.mmdLayer = 0;
    const appendB = new THREE.Bone();
    appendB.name = "appendB";
    appendB.userData.mmdLayer = 2;
    appendB.userData.mmdAppendTransform = { parentIndex: 2, weight: 1 };
    appendB.userData.mmdFlags = { appendRotate: true };
    const appendA = new THREE.Bone();
    appendA.name = "appendA";
    appendA.userData.mmdLayer = 1;
    appendA.userData.mmdAppendTransform = { parentIndex: 0, weight: 1 };
    appendA.userData.mmdFlags = { appendRotate: true };
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(source, appendB, appendA);
    mesh.bind(new THREE.Skeleton([source, appendB, appendA]));
    const animation = createEmptyMmdAnimation();
    const halfTurnZ = Math.sin(Math.PI / 4);
    animation.boneTracks.source = createBoneTrack([
      { frame: 0, translation: [0, 0, 0], rotation: [0, 0, halfTurnZ, halfTurnZ] }
    ]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0, { ik: false, physics: false });

    expect(appendA.quaternion.z).toBeCloseTo(halfTurnZ, 5);
    expect(appendA.quaternion.w).toBeCloseTo(halfTurnZ, 5);
    expect(appendB.quaternion.z).toBeCloseTo(appendA.quaternion.z, 5);
    expect(appendB.quaternion.w).toBeCloseTo(appendA.quaternion.w, 5);
  });

  it("reuses append transform scratch state without carrying translations between frames", () => {
    const source = new THREE.Bone();
    source.name = "source";
    const append = new THREE.Bone();
    append.name = "append";
    append.userData.mmdAppendTransform = { parentIndex: 0, weight: 0.5 };
    append.userData.mmdFlags = { appendTranslate: true };
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(source, append);
    mesh.bind(new THREE.Skeleton([source, append]));
    const animation = createEmptyMmdAnimation();
    animation.boneTracks.source = createBoneTrack([
      { frame: 0, translation: [2, 0, 0], rotation: [0, 0, 0, 1] },
      { frame: 1, translation: [0, 0, 0], rotation: [0, 0, 0, 1] }
    ]);

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0, { ik: false, physics: false });
    expect(append.position.x).toBeCloseTo(1);

    runtime.evaluate(1 / 30, { ik: false, physics: false });

    expect(append.position.x).toBeCloseTo(0);
  });

  it("can skip IK evaluation without changing default IK behavior", () => {
    const ikSource = new THREE.Bone();
    ikSource.name = "ikSource";
    const effector = new THREE.Bone();
    effector.name = "effector";
    effector.position.set(1, 0, 0);
    ikSource.add(effector);
    const goal = new THREE.Bone();
    goal.name = "goal";
    goal.position.set(0, 1, 0);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(ikSource, goal);
    mesh.bind(new THREE.Skeleton([ikSource, effector, goal]));
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
    runtime.setAnimation(createEmptyMmdAnimation(), mesh);
    runtime.evaluate(0, { ik: false });

    expect(ikSource.quaternion.equals(new THREE.Quaternion())).toBe(true);

    runtime.evaluate(0);

    expect(Math.abs(ikSource.quaternion.z)).toBeGreaterThan(0.5);
  });

  it("honors VMD property frame IK enable states", () => {
    const ikSource = new THREE.Bone();
    ikSource.name = "ikSource";
    const effector = new THREE.Bone();
    effector.name = "effector";
    effector.position.set(1, 0, 0);
    ikSource.add(effector);
    const goal = new THREE.Bone();
    goal.name = "足ＩＫ+";
    goal.userData.mmdIkStateName = "足ＩＫ";
    goal.position.set(0, 1, 0);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(ikSource, goal);
    mesh.bind(new THREE.Skeleton([ikSource, effector, goal]));
    mesh.userData.mmdIkChains = [
      {
        goalBoneIndex: 2,
        effectorBoneIndex: 1,
        iterationCount: 4,
        maxAnglePerIteration: Math.PI,
        links: [{ boneIndex: 0 }]
      }
    ];
    const animation: MmdAnimation = {
      ...createEmptyMmdAnimation(),
      propertyFrames: [
        {
          frame: 0,
          visible: true,
          physicsSimulation: true,
          ikStates: [{ boneName: "足ＩＫ", enabled: false }]
        },
        {
          frame: 1,
          visible: true,
          physicsSimulation: true,
          ikStates: [{ boneName: "足ＩＫ", enabled: true }]
        }
      ]
    };

    const runtime = new DefaultMmdRuntime();
    runtime.setAnimation(animation, mesh);
    runtime.evaluate(0, { physics: false });

    expect(ikSource.quaternion.equals(new THREE.Quaternion())).toBe(true);

    runtime.clearAnimation();
    runtime.evaluate(0, { physics: false });

    expect(Math.abs(ikSource.quaternion.z)).toBeGreaterThan(0.5);

    runtime.setAnimation(animation, mesh);
    runtime.evaluate(1 / 30, { physics: false });

    expect(Math.abs(ikSource.quaternion.z)).toBeGreaterThan(0.5);
  });

  it("resets bone pose before rebinding motions so IK does not drift across switches", () => {
    const ikSource = new THREE.Bone();
    ikSource.name = "ikSource";
    const effector = new THREE.Bone();
    effector.name = "effector";
    effector.position.set(1, 0, 0);
    ikSource.add(effector);
    const goal = new THREE.Bone();
    goal.name = "goal";
    goal.position.set(0, 1, 0);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(ikSource, goal);
    mesh.bind(new THREE.Skeleton([ikSource, effector, goal]));
    mesh.userData.mmdIkChains = [
      {
        goalBoneIndex: 2,
        effectorBoneIndex: 1,
        iterationCount: 8,
        maxAnglePerIteration: Math.PI,
        links: [{ boneIndex: 0 }]
      }
    ];
    const motionA = createGoalTranslationAnimation([0, 0, 0]);
    const motionB = createGoalTranslationAnimation([0, -2, 0]);
    const runtime = new DefaultMmdRuntime();

    runtime.setAnimation(motionA, mesh);
    runtime.evaluate(0, { physics: false });
    const firstA = cloneBonePose(mesh);
    runtime.setAnimation(motionB, mesh);
    runtime.evaluate(0, { physics: false });
    const firstB = cloneBonePose(mesh);
    runtime.setAnimation(motionA, mesh);
    runtime.evaluate(0, { physics: false });
    const secondA = cloneBonePose(mesh);
    runtime.setAnimation(motionB, mesh);
    runtime.evaluate(0, { physics: false });
    const secondB = cloneBonePose(mesh);

    expectBonePoseClose(secondA, firstA);
    expectBonePoseClose(secondB, firstB);
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
    const animation = createEmptyMmdAnimation();
    const backend = new TranslatingPhysicsBackend([1, 2, 3]);
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(animation, mesh);
    runtime.evaluate(1 / 30);

    expect(backend.stepCount).toBe(1);
    expect(backend.lastContext?.rigidBodies?.[0]?.motionType).toBe("dynamic");
    expect(bone.position.toArray()).toEqual([1, 2, -3]);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[12]).toBe(1);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[13]).toBe(2);
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[14]).toBe(3);
  });

  it("writes external physics input directly into backend-owned step buffers", () => {
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
    const backend = new DirectBufferPhysicsBackend();
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(createEmptyMmdAnimation(), mesh);
    runtime.evaluate(1 / 30);

    expect(backend.acquireCount).toBe(1);
    expect(backend.lastContext?.inputTranslations).toBe(backend.buffers.inputTranslations);
    expect(backend.lastContext?.inputRotations).toBe(backend.buffers.inputRotations);
    expect(backend.lastContext?.inputWorldMatricesColumnMajor).toBe(
      backend.buffers.inputWorldMatricesColumnMajor
    );
    expect(backend.lastContext?.output?.translations).toBe(backend.buffers.outputTranslations);
    expect(backend.lastContext?.bonePhysicsToggles).toBe(backend.buffers.bonePhysicsToggles);
    expect(backend.buffers.inputRotations[3]).toBe(1);
    expect(bone.position.toArray()).toEqual([4, 5, -6]);
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

    runtime.setAnimation(createEmptyMmdAnimation(), mesh);
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
    const animation = createEmptyMmdAnimation();
    const backend = new InspectingPhysicsBackend();
    const runtime = new DefaultMmdRuntime({
      physics: "external",
      physicsBackend: backend
    });

    runtime.setAnimation(animation, mesh);
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
          name: "filtered",
          rigidBodyIndexA: 0,
          rigidBodyIndexB: 1,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          translationLowerLimit: [0, 0, 0],
          translationUpperLimit: [0, 0, 0],
          rotationLowerLimit: [0, 0, 0],
          rotationUpperLimit: [0, 0, 0],
          springTranslationFactor: [0, 0, 0],
          springRotationFactor: [0, 0, 0]
        },
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

    runtime.setAnimation(createEmptyMmdAnimation(), mesh);
    runtime.evaluate(1 / 30);

    expect(backend.lastContext?.rigidBodies).toHaveLength(2);
    expect(backend.lastContext?.joints?.[0]?.index).toBe(0);
    expect(backend.lastContext?.joints?.[0]?.rigidBodyIndexA).toBe(0);
    expect(backend.lastContext?.joints?.[0]?.rigidBodyIndexB).toBe(1);
    expect(backend.lastContext?.morphImpulses?.[0]?.rigidBodyIndex).toBe(1);
  });
});

function renderedBoneWorldPosition(mesh: THREE.SkinnedMesh, boneIndex: number): THREE.Vector3 {
  const boneMatrix = new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, boneIndex * 16);
  const bindMatrix = mesh.skeleton.boneInverses[boneIndex].clone().invert();
  return new THREE.Vector3().setFromMatrixPosition(boneMatrix.multiply(bindMatrix));
}

function cloneBonePose(mesh: THREE.SkinnedMesh): Array<{
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}> {
  return mesh.skeleton.bones.map((bone) => ({
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone()
  }));
}

function expectBonePoseClose(
  actual: ReturnType<typeof cloneBonePose>,
  expected: ReturnType<typeof cloneBonePose>
): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]?.position.distanceTo(expected[index]?.position ?? new THREE.Vector3()))
      .toBeLessThanOrEqual(1e-6);
    expect(
      actual[index]?.quaternion.angleTo(expected[index]?.quaternion ?? new THREE.Quaternion())
    ).toBeLessThanOrEqual(1e-6);
  }
}

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

class DirectBufferPhysicsBackend implements MmdDirectBufferPhysicsBackend {
  readonly name = "direct-buffer";
  readonly disabled = false;
  readonly disposed = false;
  readonly buffers: MmdPhysicsStepBuffers = {
    inputTranslations: new Float32Array(3),
    inputRotations: new Float32Array(4),
    inputWorldMatricesColumnMajor: new Float32Array(16),
    outputTranslations: new Float32Array(3),
    outputRotations: new Float32Array(4),
    outputWorldMatricesColumnMajor: new Float32Array(16),
    bonePhysicsToggles: new Uint8Array(1),
    updatedBoneIndices: new Uint32Array(1)
  };
  acquireCount = 0;
  lastContext: MmdPhysicsStepContext | undefined;

  acquireStepBuffers(layout: MmdPhysicsStepBufferLayout): MmdPhysicsStepBuffers | undefined {
    this.acquireCount += 1;
    expect(layout).toEqual({
      boneCount: 1,
      translationValueCount: 3,
      rotationValueCount: 4,
      worldMatrixValueCount: 16
    });
    return this.buffers;
  }

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    this.lastContext = context;
    context.output?.translations?.set([4, 5, 6], 0);
    context.output?.rotations?.set([0, 0, 0, 1], 0);
    if (context.output?.updatedBoneIndices instanceof Uint32Array) {
      context.output.updatedBoneIndices.set([0], 0);
    }
    return { simulated: true, updatedBoneCount: 1 };
  }
}

function createEmptyMmdAnimation(): MmdAnimation {
  return {
    kind: "vmd",
    bytes: new Uint8Array(),
    metadata: { format: "vmd", modelName: "", counts: createEmptyVmdCounts(), maxFrame: 0 },
    boneTracks: {},
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

function createBoneTrack(frames: readonly VmdBoneFrame[]): VmdBoneTrack {
  const track: VmdBoneTrack = {
    packed: "bone",
    frames: new Uint32Array(frames.length),
    translations: new Float32Array(frames.length * 3),
    rotations: new Float32Array(frames.length * 4),
    interpolations: new Float32Array(frames.length * 16),
    physicsToggles: new Int8Array(frames.length)
  };
  track.physicsToggles.fill(-1);
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const translationOffset = index * 3;
    const rotationOffset = index * 4;
    const interpolationOffset = index * 16;
    track.frames[index] = frame?.frame ?? 0;
    track.translations.set(frame?.translation ?? [0, 0, 0], translationOffset);
    track.rotations.set(frame?.rotation ?? [0, 0, 0, 1], rotationOffset);
    track.physicsToggles[index] = frame?.physicsToggle ?? -1;
    const curves = [
      frame?.interpolation?.translationX,
      frame?.interpolation?.translationY,
      frame?.interpolation?.translationZ,
      frame?.interpolation?.rotation
    ];
    for (let curve = 0; curve < curves.length; curve += 1) {
      track.interpolations.set(curves[curve] ?? [0, 0, 0, 0], interpolationOffset + curve * 4);
    }
  }
  return track;
}

function createMorphTrack(frames: readonly VmdMorphFrame[]): VmdMorphTrack {
  return {
    packed: "morph",
    frames: new Uint32Array(frames.map((frame) => frame.frame)),
    weights: new Float32Array(frames.map((frame) => frame.weight))
  };
}

function createBezierTranslationAnimation(): MmdAnimation {
  const easeIn = [20 / 127, 0, 107 / 127, 0] as [number, number, number, number];
  return {
    ...createEmptyMmdAnimation(),
    metadata: { format: "vmd", modelName: "", counts: createEmptyVmdCounts(), maxFrame: 30 },
    boneTracks: {
      センター: createBoneTrack([
        {
          frame: 0,
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1]
        },
        {
          frame: 30,
          translation: [10, 0, 0],
          rotation: [0, 0, 0, 1],
          interpolation: {
            translationX: easeIn,
            translationY: [0, 0, 1, 1],
            translationZ: [0, 0, 1, 1],
            rotation: [0, 0, 1, 1]
          }
        }
      ])
    }
  };
}

function createGoalTranslationAnimation(translation: [number, number, number]): MmdAnimation {
  const animation = createEmptyMmdAnimation();
  animation.boneTracks.goal = createBoneTrack([
    {
      frame: 0,
      translation,
      rotation: [0, 0, 0, 1]
    }
  ]);
  return animation;
}

function createEmptyVmdCounts(): MmdAnimation["metadata"]["counts"] {
  return {
    bones: 0,
    morphs: 0,
    cameras: 0,
    lights: 0,
    selfShadows: 0,
    properties: 0
  };
}
