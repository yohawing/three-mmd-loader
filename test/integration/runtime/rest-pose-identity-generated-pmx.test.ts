import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import type { MmdAnimation } from "../../../src/index.js";

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
    expect(findBone(model.mesh, "左足").quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(
      THREE.MathUtils.degToRad(1)
    );
  });

  it("moves an IK effector to the animated IK target after one motion frame", async () => {
    const model = await loadGeneratedRestPoseModel("ik-chain");
    const runtime = model.runtime;
    expect(runtime).toBeDefined();

    runtime?.setAnimation(createIkTargetMotionAnimation(), model.mesh);
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

  it("syncs viewer render skeleton matrices after IK evaluation", async () => {
    const model = await loadGeneratedRestPoseModel("ik-chain");
    const runtime = model.runtime;
    expect(runtime).toBeDefined();

    runtime?.setAnimation(createIkTargetMotionAnimation(), model.mesh);
    runtime?.tick(1 / 30, model.mesh, { physics: false });

    const targetPosition = renderedBoneWorldPosition(model.mesh, "左足IK");
    const effectorPosition = renderedBoneWorldPosition(model.mesh, "左足先");

    expect(effectorPosition.distanceTo(targetPosition)).toBeLessThanOrEqual(1e-3);
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
  runtime?.setAnimation(createEmptyMmdAnimation(), model.mesh);
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

function renderedBoneWorldPosition(mesh: THREE.SkinnedMesh, mmdName: string): THREE.Vector3 {
  const boneIndex = mesh.skeleton.bones.findIndex(
    (candidate) => candidate.userData.mmdBoneName === mmdName || candidate.name === mmdName
  );
  expect(boneIndex, `missing bone ${mmdName}`).toBeGreaterThanOrEqual(0);

  const boneMatrix = new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, boneIndex * 16);
  const bindMatrix = mesh.skeleton.boneInverses[boneIndex].clone().invert();
  return new THREE.Vector3().setFromMatrixPosition(boneMatrix.multiply(bindMatrix));
}

function createEmptyMmdAnimation(): MmdAnimation {
  return {
    kind: "vmd",
    bytes: new Uint8Array(),
    metadata: { modelName: "", counts: createEmptyVmdCounts(), maxFrame: 0 },
    boneTracks: {},
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

function createIkTargetMotionAnimation(): MmdAnimation {
  const animation = createEmptyMmdAnimation();
  animation.metadata.maxFrame = 1;
  animation.boneTracks.左足IK = [
    { frame: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    { frame: 1, translation: [-0.10358984, 0, 0.2], rotation: [0, 0, 0, 1] }
  ];
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
