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
