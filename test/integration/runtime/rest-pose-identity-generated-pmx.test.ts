import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";

const execFileAsync = promisify(execFile);
const generatorPath = resolve("scripts/fixtures/generate-minimal-pmx.mjs");
const outputDir = resolve("test/fixtures/generated/rest-pose");
const epsilon = 1e-5;

const identityCases = [
  { id: "append-rotate-parent", bone: "腰" },
  { id: "append-local", bone: "腰" },
  { id: "fixed-local-axis", bone: "腰" },
  { id: "transform-after-physics", bone: "腰" }
];

describe("generated PMX rest pose identity regression", () => {
  it.each(identityCases)(
    "keeps $bone identity for the $id metadata case",
    async ({ id, bone }) => {
      const model = await loadGeneratedRestPoseModel(id);

      evaluateRestPose(model);

      expectQuaternionIdentity(findBone(model.mesh, bone).quaternion);
    }
  );

  it("keeps IK chain link bones identity when rest pose evaluation skips IK", async () => {
    const model = await loadGeneratedRestPoseModel("ik-chain");

    evaluateRestPose(model);

    for (const boneName of ["センター", "腰", "上半身", "左足"]) {
      expectQuaternionIdentity(findBone(model.mesh, boneName).quaternion);
    }
  });

  it("moves an IK effector to the animated IK target after one motion frame", async () => {
    const model = await loadGeneratedRestPoseModel("ik-chain");
    const runtime = model.runtime;
    expect(runtime).toBeDefined();

    runtime?.setAnimation(createIkTargetMotionClip(), model.mesh);
    runtime?.evaluate(1 / 30, { physics: false });
    model.mesh.updateWorldMatrix(false, true);

    const targetPosition = findBone(model.mesh, "左足IK").getWorldPosition(new THREE.Vector3());
    const effectorPosition = findBone(model.mesh, "左足先").getWorldPosition(new THREE.Vector3());
    const kneeRotation = findBone(model.mesh, "左足").quaternion;

    expect(targetPosition.x).toBeCloseTo(0.34641016, 5);
    expect(targetPosition.y).toBeCloseTo(0.3, 5);
    expect(targetPosition.z).toBeCloseTo(-0.2, 5);
    expect(effectorPosition.distanceTo(targetPosition)).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(kneeRotation.z)).toBeGreaterThan(0.1);
  });
});

async function loadGeneratedRestPoseModel(caseId: string) {
  const fixturePath = resolve(outputDir, `${caseId}.pmx`);
  await execFileAsync(process.execPath, [
    generatorPath,
    "--case",
    caseId,
    "--output",
    fixturePath
  ]);

  const bytes = await readFile(fixturePath);
  const loader = new ThreeMmdLoader();
  return loader.loadModel(bytes);
}

function evaluateRestPose(model: Awaited<ReturnType<ThreeMmdLoader["loadModel"]>>): void {
  const runtime = model.runtime;
  expect(runtime).toBeDefined();
  runtime?.setAnimation(createEmptyMmdClip("rest-pose"), model.mesh);
  runtime?.evaluate(0, { physics: false, ik: false });
}

function findBone(mesh: THREE.SkinnedMesh, mmdName: string): THREE.Bone {
  const bone = mesh.skeleton.bones.find(
    (candidate) => candidate.userData.mmdBoneName === mmdName || candidate.name === mmdName
  );
  expect(bone, `missing bone ${mmdName}`).toBeDefined();
  return bone as THREE.Bone;
}

function expectQuaternionIdentity(quaternion: THREE.Quaternion): void {
  const identity = new THREE.Quaternion();
  expect(Math.abs(quaternion.x)).toBeLessThanOrEqual(epsilon);
  expect(Math.abs(quaternion.y)).toBeLessThanOrEqual(epsilon);
  expect(Math.abs(quaternion.z)).toBeLessThanOrEqual(epsilon);
  expect(Math.abs(Math.abs(quaternion.w) - identity.w)).toBeLessThanOrEqual(epsilon);
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

function createIkTargetMotionClip(): THREE.AnimationClip {
  const clip = createEmptyMmdClip("ik-target-motion");
  clip.duration = 1 / 30;
  clip.userData.mmdAnimation.metadata.maxFrame = 1;
  clip.userData.mmdAnimation.boneTracks = {
    左足IK: [
      { frame: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { frame: 1, translation: [-0.10358984, 0, 0.2], rotation: [0, 0, 0, 1] }
    ]
  };
  return clip;
}
