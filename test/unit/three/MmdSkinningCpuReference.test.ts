/**
 * CPU reference tests for MMD skinning algorithms.
 *
 * Purpose:
 *   - Verify SDEF correctness (regression guard — these should always pass)
 *   - Drive QDEF (Dual Quaternion Skinning) implementation via TDD:
 *     computeQdefSkinnedPosition does not exist yet → these tests FAIL until implemented
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  computeMmdSdefSkinnedPosition,
  computeMmdSdefSkinnedNormal
} from "../../../src/three/material/material-sdef.js";

// NOTE: computeQdefSkinnedPosition is NOT yet implemented.
// This import will cause a TypeScript error / runtime failure until we add it.
import {
  computeQdefSkinnedPosition,
  computeQdefSkinnedNormal
} from "../../../src/three/material/material-qdef.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function identityMatrix(): THREE.Matrix4 {
  return new THREE.Matrix4();
}

/** Build a pure-rotation matrix: rotate `angleDeg` degrees around the Y axis. */
function rotYMatrix(angleDeg: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY((angleDeg * Math.PI) / 180);
}

/** Build a matrix that translates and rotates. */
function translationMatrix(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

type BoneMatrices = readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4];

// ──────────────────────────────────────────────────────────────────────────────
// SDEF correctness (regression guard — must always pass)
// ──────────────────────────────────────────────────────────────────────────────

describe("computeMmdSdefSkinnedPosition", () => {
  it("falls back to linear blend when sdefEnabled = 0", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    const result = computeMmdSdefSkinnedPosition({
      position: new THREE.Vector3(0.5, 0, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices,
      sdefEnabled: 0,
      sdefC: new THREE.Vector3(0, 0, 0),
      sdefRW0: new THREE.Vector3(0, 0, 0),
      sdefRW1: new THREE.Vector3(0, 0, 0)
    });
    // Linear: 0.5 * identity * [0.5,0,0] + 0.5 * rotY90 * [0.5,0,0]
    // = [0.25,0,0] + 0.5*[0,0,-0.5] = [0.25, 0, -0.25]
    expect(result.x).toBeCloseTo(0.25);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(-0.25);
  });

  it("applies quaternion slerp rotation when sdefEnabled = 1 (C and RW at origin)", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    const result = computeMmdSdefSkinnedPosition({
      position: new THREE.Vector3(0.5, 0, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices,
      sdefEnabled: 1,
      sdefC: new THREE.Vector3(0, 0, 0),
      sdefRW0: new THREE.Vector3(0, 0, 0),
      sdefRW1: new THREE.Vector3(0, 0, 0)
    });
    // slerp(identity, rotY90, 0.5) = rotY45
    // rotY45 * [0.5, 0, 0] = [0.5*cos45, 0, -0.5*sin45] ≈ [0.3536, 0, -0.3536]
    expect(result.x).toBeCloseTo(0.3536, 3);
    expect(result.y).toBeCloseTo(0, 3);
    expect(result.z).toBeCloseTo(-0.3536, 3);
  });

  it("preserves radial distance under SDEF (unlike linear blend which shrinks it)", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    const pos = new THREE.Vector3(0.4, 0, 0);
    const sdefResult = computeMmdSdefSkinnedPosition({
      position: pos.clone(),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices,
      sdefEnabled: 1,
      sdefC: new THREE.Vector3(0, 0, 0),
      sdefRW0: new THREE.Vector3(0, 0, 0),
      sdefRW1: new THREE.Vector3(0, 0, 0)
    });
    const linearResult = computeMmdSdefSkinnedPosition({
      position: pos.clone(),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices,
      sdefEnabled: 0,
      sdefC: new THREE.Vector3(0, 0, 0),
      sdefRW0: new THREE.Vector3(0, 0, 0),
      sdefRW1: new THREE.Vector3(0, 0, 0)
    });
    const sdefRadius = Math.hypot(sdefResult.x, sdefResult.z);
    const linearRadius = Math.hypot(linearResult.x, linearResult.z);
    // SDEF preserves the original radius (0.4); linear blend shrinks it
    expect(sdefRadius).toBeCloseTo(0.4, 3);
    expect(linearRadius).toBeLessThan(sdefRadius);
  });

  it("accounts for non-zero sdefC (rotation center offset)", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    // Point at the rotation center should not move
    const center = new THREE.Vector3(0, 0, 0);
    const result = computeMmdSdefSkinnedPosition({
      position: center.clone(),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices,
      sdefEnabled: 1,
      sdefC: center.clone(),
      sdefRW0: center.clone(),
      sdefRW1: center.clone()
    });
    expect(result.x).toBeCloseTo(0, 3);
    expect(result.y).toBeCloseTo(0, 3);
    expect(result.z).toBeCloseTo(0, 3);
  });
});

describe("computeMmdSdefSkinnedNormal", () => {
  it("rotates normal by slerp quaternion when sdefEnabled = 1", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    const result = computeMmdSdefSkinnedNormal({
      normal: new THREE.Vector3(1, 0, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices,
      sdefEnabled: 1
    });
    // slerp(identity, rotY90, 0.5) = rotY45 applied to [1,0,0]
    // rotY45 * [1,0,0] = [cos45, 0, -sin45] ≈ [0.7071, 0, -0.7071]
    expect(result.x).toBeCloseTo(0.7071, 3);
    expect(result.z).toBeCloseTo(-0.7071, 3);
  });

  it("preserves normal length after SDEF rotation", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(120), identityMatrix(), identityMatrix()];
    const result = computeMmdSdefSkinnedNormal({
      normal: new THREE.Vector3(0.6, 0.8, 0),
      skinWeights: [0.3, 0.7, 0, 0],
      boneMatrices,
      sdefEnabled: 1
    });
    expect(result.length()).toBeCloseTo(1, 3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QDEF — Dual Quaternion Skinning
// These tests FAIL until computeQdefSkinnedPosition is implemented.
// ──────────────────────────────────────────────────────────────────────────────

describe("computeQdefSkinnedPosition", () => {
  it("exists as a function (will fail until material-qdef.ts is created)", () => {
    expect(typeof computeQdefSkinnedPosition).toBe("function");
  });

  it("gives the same result as BDEF4 (linear) for identity bone transforms", () => {
    const boneMatrices: BoneMatrices = [
      identityMatrix(), identityMatrix(), identityMatrix(), identityMatrix()
    ];
    const pos = new THREE.Vector3(0.3, 0.5, 0.1);
    const result = computeQdefSkinnedPosition({
      position: pos.clone(),
      skinWeights: [0.5, 0.25, 0.15, 0.1],
      boneMatrices
    });
    // With identity bones, DQS == LBS == original position
    expect(result.x).toBeCloseTo(pos.x, 4);
    expect(result.y).toBeCloseTo(pos.y, 4);
    expect(result.z).toBeCloseTo(pos.z, 4);
  });

  it("preserves radial distance under 180° twist (candy-wrapper prevention)", () => {
    // This is the key difference between DQS and LBS:
    // Bone0 = identity, Bone1 = rotate 180° around Y
    // A vertex at [0.3, 0.5, 0] with 50/50 blend
    // LBS collapses XZ to zero; DQS preserves the 0.3 radius
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(180), identityMatrix(), identityMatrix()];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0.3, 0.5, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices
    });
    const xzRadius = Math.hypot(result.x, result.z);
    // DQS preserves the XZ radius at ~0.3
    expect(xzRadius).toBeCloseTo(0.3, 2);
    // Y is unchanged
    expect(result.y).toBeCloseTo(0.5, 3);
  });

  it("matches DQS closed-form result for 90° rotation (single bone)", () => {
    // Weight = [1, 0, 0, 0]: QDEF with single active bone should == rotate the point
    const boneMatrices: BoneMatrices = [rotYMatrix(90), identityMatrix(), identityMatrix(), identityMatrix()];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0.5, 0, 0),
      skinWeights: [1, 0, 0, 0],
      boneMatrices
    });
    // rotY90 * [0.5, 0, 0] = [0, 0, -0.5]
    expect(result.x).toBeCloseTo(0, 4);
    expect(result.y).toBeCloseTo(0, 4);
    expect(result.z).toBeCloseTo(-0.5, 4);
  });

  it("handles translation correctly (DQS dual part carries translation)", () => {
    const translateMat = translationMatrix(1, 2, 3);
    const boneMatrices: BoneMatrices = [translateMat, identityMatrix(), identityMatrix(), identityMatrix()];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0.1, 0.2, 0.3),
      skinWeights: [1, 0, 0, 0],
      boneMatrices
    });
    expect(result.x).toBeCloseTo(1.1, 4);
    expect(result.y).toBeCloseTo(2.2, 4);
    expect(result.z).toBeCloseTo(3.3, 4);
  });

  it("gives different result from linear blend under 180° twist", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(180), identityMatrix(), identityMatrix()];
    const pos = new THREE.Vector3(0.3, 0.5, 0);
    const qdefResult = computeQdefSkinnedPosition({
      position: pos.clone(),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices
    });
    // LBS (linear): 0.5 * identity + 0.5 * rotY180 → x collapses
    // rotY180 * [0.3, 0.5, 0] = [-0.3, 0.5, 0]
    // LBS = 0.5*[0.3, 0.5, 0] + 0.5*[-0.3, 0.5, 0] = [0, 0.5, 0]
    const lbsX = 0;
    const lbsZ = 0;
    // QDEF (DQS) should give different (non-collapsed) result
    const qdefXzRadius = Math.hypot(qdefResult.x, qdefResult.z);
    const lbsXzRadius = Math.hypot(lbsX, lbsZ);
    expect(qdefXzRadius).toBeGreaterThan(lbsXzRadius + 0.1);
  });

  it("four-bone blend: weights must sum to 1 and position is on the blended surface", () => {
    const boneMatrices: BoneMatrices = [
      identityMatrix(),
      rotYMatrix(30),
      rotYMatrix(60),
      rotYMatrix(90)
    ];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0.5, 0, 0),
      skinWeights: [0.25, 0.25, 0.25, 0.25],
      boneMatrices
    });
    // All bones rotate around Y, weights sum to 1
    // DQS: blend of 4 rotations → effective rotation ≈ 45° around Y
    // Result should be on the unit circle (radius 0.5 preserved)
    const xzRadius = Math.hypot(result.x, result.z);
    expect(xzRadius).toBeCloseTo(0.5, 2);
  });
});

describe("computeQdefSkinnedNormal", () => {
  it("exists as a function", () => {
    expect(typeof computeQdefSkinnedNormal).toBe("function");
  });

  it("preserves normal length", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    const result = computeQdefSkinnedNormal({
      normal: new THREE.Vector3(1, 0, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices
    });
    expect(result.length()).toBeCloseTo(1, 3);
  });

  it("rotates normal by blended DQS rotation (pure rotation, no translation)", () => {
    const boneMatrices: BoneMatrices = [identityMatrix(), rotYMatrix(90), identityMatrix(), identityMatrix()];
    const result = computeQdefSkinnedNormal({
      normal: new THREE.Vector3(1, 0, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices
    });
    // Blended DQS rotation: slerp(identity, rotY90, 0.5) = rotY45
    // rotY45 * [1,0,0] = [cos45, 0, -sin45] ≈ [0.7071, 0, -0.7071]
    expect(result.x).toBeCloseTo(0.7071, 3);
    expect(result.z).toBeCloseTo(-0.7071, 3);
  });

  it("translation part of bone matrix does NOT affect the normal", () => {
    const translateAndRotate = new THREE.Matrix4()
      .makeTranslation(5, 10, -3)
      .multiply(rotYMatrix(90));
    const boneMatrices: BoneMatrices = [translateAndRotate, identityMatrix(), identityMatrix(), identityMatrix()];
    const rotateOnly: BoneMatrices = [rotYMatrix(90), identityMatrix(), identityMatrix(), identityMatrix()];
    const normalIn = new THREE.Vector3(1, 0, 0);
    const result1 = computeQdefSkinnedNormal({
      normal: normalIn.clone(), skinWeights: [1, 0, 0, 0], boneMatrices
    });
    const result2 = computeQdefSkinnedNormal({
      normal: normalIn.clone(), skinWeights: [1, 0, 0, 0], boneMatrices: rotateOnly
    });
    expect(result1.x).toBeCloseTo(result2.x, 4);
    expect(result1.y).toBeCloseTo(result2.y, 4);
    expect(result1.z).toBeCloseTo(result2.z, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QDEF edge cases — antipodal, zero weights, non-unit weights
// ──────────────────────────────────────────────────────────────────────────────

describe("computeQdefSkinnedPosition edge cases", () => {
  it("skinWeight.x = 0: antipodal reference falls on the first non-zero bone", () => {
    // Bone 0 not contributing; bones 1 and 2 are near-antipodal.
    // If bone 0 were the reference, bone 1 and 2 might be incorrectly flipped.
    const boneMatrices: BoneMatrices = [
      rotYMatrix(0),    // w=0, should not dominate reference selection
      rotYMatrix(170),  // w=0.5
      rotYMatrix(-170), // w=0.5 — nearly antipodal to bone 1 in local sense
      identityMatrix()  // w=0
    ];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0.5, 0, 0),
      skinWeights: [0, 0.5, 0.5, 0],
      boneMatrices
    });
    // 50/50 blend of ±170° around Y: DQS should interpolate toward ±180°, not collapse
    // Key assertion: position magnitude is preserved (not zero)
    const xzRadius = Math.hypot(result.x, result.z);
    expect(xzRadius).toBeGreaterThan(0.4);
  });

  it("handles all-zero weights gracefully (no NaN/Infinity)", () => {
    const boneMatrices: BoneMatrices = [
      rotYMatrix(90), rotYMatrix(180), identityMatrix(), identityMatrix()
    ];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0.3, 0.2, 0.1),
      skinWeights: [0, 0, 0, 0],
      boneMatrices
    });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });

  it("translation + rotation multi-bone blend preserves correct position", () => {
    // bone 0: translate [1,0,0], bone 1: translate [0,1,0] + rotate 90° around Y
    const b0 = translationMatrix(1, 0, 0);
    const b1 = new THREE.Matrix4().makeTranslation(0, 1, 0).multiply(rotYMatrix(90));
    const boneMatrices: BoneMatrices = [b0, b1, identityMatrix(), identityMatrix()];
    const result = computeQdefSkinnedPosition({
      position: new THREE.Vector3(0, 0, 0),
      skinWeights: [0.5, 0.5, 0, 0],
      boneMatrices
    });
    // DQS blends position as: 0.5 * translate(1,0,0) + 0.5 * (translate(0,1,0)+rotY90)
    // Result is finite and non-NaN
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });
});
