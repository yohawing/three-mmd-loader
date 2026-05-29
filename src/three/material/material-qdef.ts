import * as THREE from "three";

export interface MmdQdefSkinningInput {
  readonly position: THREE.Vector3;
  readonly skinWeights: readonly [number, number, number, number];
  readonly boneMatrices: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4];
  readonly bindMatrix?: THREE.Matrix4;
  readonly bindMatrixInverse?: THREE.Matrix4;
}

export interface MmdQdefNormalSkinningInput {
  readonly normal: THREE.Vector3;
  readonly skinWeights: readonly [number, number, number, number];
  readonly boneMatrices: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4];
}

interface DualQuaternion {
  real: THREE.Quaternion;
  dual: THREE.Quaternion;
}

/** Convert a bone matrix (rotation + translation) to a dual quaternion. */
function matrixToDualQuaternion(matrix: THREE.Matrix4): DualQuaternion {
  const real = new THREE.Quaternion().setFromRotationMatrix(matrix);
  const t = new THREE.Vector3().setFromMatrixPosition(matrix);
  // q_d = 0.5 * [t, 0] * q_r
  // [tx, ty, tz, 0] * [qx, qy, qz, qw] =
  //   x: tx*qw + ty*qz - tz*qy
  //   y: ty*qw + tz*qx - tx*qz
  //   z: tz*qw + tx*qy - ty*qx
  //   w: -tx*qx - ty*qy - tz*qz
  const dual = new THREE.Quaternion(
    0.5 * (t.x * real.w + t.y * real.z - t.z * real.y),
    0.5 * (t.y * real.w + t.z * real.x - t.x * real.z),
    0.5 * (t.z * real.w + t.x * real.y - t.y * real.x),
    0.5 * (-t.x * real.x - t.y * real.y - t.z * real.z)
  );
  return { real, dual };
}

/**
 * Blend four dual quaternions with weights, handling the antipodal case.
 * Returns a normalized blended dual quaternion.
 */
function blendDualQuaternions(
  dqs: readonly [DualQuaternion, DualQuaternion, DualQuaternion, DualQuaternion],
  weights: readonly [number, number, number, number]
): DualQuaternion {
  const blendedReal = new THREE.Quaternion(0, 0, 0, 0);
  const blendedDual = new THREE.Quaternion(0, 0, 0, 0);

  // Antipodal reference: use the bone with the highest weight so that a
  // zero-weight bone 0 never mis-flips the actually-contributing bones.
  let refIdx = 0;
  for (let i = 1; i < 4; i++) {
    if (weights[i] > weights[refIdx]) refIdx = i;
  }
  const ref = dqs[refIdx].real;

  for (let i = 0; i < 4; i++) {
    if (weights[i] === 0) continue;
    const flip = ref.dot(dqs[i].real) < 0 ? -1 : 1;
    const w = weights[i] * flip;
    blendedReal.x += w * dqs[i].real.x;
    blendedReal.y += w * dqs[i].real.y;
    blendedReal.z += w * dqs[i].real.z;
    blendedReal.w += w * dqs[i].real.w;
    blendedDual.x += w * dqs[i].dual.x;
    blendedDual.y += w * dqs[i].dual.y;
    blendedDual.z += w * dqs[i].dual.z;
    blendedDual.w += w * dqs[i].dual.w;
  }

  // Normalize by the length of the real part.
  // Guard against zero-length blend (all-zero weights or full antipodal cancellation).
  const len = Math.sqrt(
    blendedReal.x * blendedReal.x +
    blendedReal.y * blendedReal.y +
    blendedReal.z * blendedReal.z +
    blendedReal.w * blendedReal.w
  ) || 1e-6;
  blendedReal.x /= len;
  blendedReal.y /= len;
  blendedReal.z /= len;
  blendedReal.w /= len;
  blendedDual.x /= len;
  blendedDual.y /= len;
  blendedDual.z /= len;
  blendedDual.w /= len;

  return { real: blendedReal, dual: blendedDual };
}

/**
 * Apply a dual quaternion transformation to a position vector.
 * DQS transform: position = rot(q_r, p) + 2*(q_d * q_r_conj).xyz
 */
function applyDualQuaternion(dq: DualQuaternion, p: THREE.Vector3): THREE.Vector3 {
  const q = dq.real;
  const qd = dq.dual;

  // Rotation via Rodrigues: p' = p + 2*w*(q.xyz × p) + 2*(q.xyz × (q.xyz × p))
  const qxyz = new THREE.Vector3(q.x, q.y, q.z);
  const t1 = new THREE.Vector3().crossVectors(qxyz, p).multiplyScalar(2);
  const rotated = p.clone().add(t1.clone().multiplyScalar(q.w)).add(new THREE.Vector3().crossVectors(qxyz, t1));

  // Translation: 2 * (q_r.w * q_d.xyz - q_d.w * q_r.xyz - q_d.xyz × q_r.xyz)
  const qdxyz = new THREE.Vector3(qd.x, qd.y, qd.z);
  const qrxyz = qxyz;
  const translation = new THREE.Vector3()
    .copy(qdxyz).multiplyScalar(q.w)
    .sub(qrxyz.clone().multiplyScalar(qd.w))
    .sub(new THREE.Vector3().crossVectors(qdxyz, qrxyz))
    .multiplyScalar(2);

  return rotated.add(translation);
}

/**
 * CPU reference for QDEF (Dual Quaternion Skinning) vertex position.
 *
 * Blends the four bone transformations as dual quaternions rather than matrices,
 * avoiding the "candy wrapper" volume collapse of linear blend skinning (BDEF4).
 */
export function computeQdefSkinnedPosition(input: MmdQdefSkinningInput): THREE.Vector3 {
  const bindMatrix = input.bindMatrix ?? new THREE.Matrix4();
  const bindMatrixInverse = input.bindMatrixInverse ?? new THREE.Matrix4();
  const skinVertex = input.position.clone().applyMatrix4(bindMatrix);

  const dqs = input.boneMatrices.map(matrixToDualQuaternion) as [
    DualQuaternion, DualQuaternion, DualQuaternion, DualQuaternion
  ];
  const blended = blendDualQuaternions(dqs, input.skinWeights);
  const transformed = applyDualQuaternion(blended, skinVertex);
  return transformed.applyMatrix4(bindMatrixInverse);
}

/**
 * CPU reference for QDEF (Dual Quaternion Skinning) vertex normal.
 * Translation does not affect normals — only the rotation part is applied.
 */
export function computeQdefSkinnedNormal(input: MmdQdefNormalSkinningInput): THREE.Vector3 {
  const dqs = input.boneMatrices.map(matrixToDualQuaternion) as [
    DualQuaternion, DualQuaternion, DualQuaternion, DualQuaternion
  ];
  const blended = blendDualQuaternions(dqs, input.skinWeights);

  // Apply only the rotation part to the original normal — no bindMatrix —
  // consistent with computeMmdSdefSkinnedNormal and the GPU normal shader.
  const q = blended.real;
  const qxyz = new THREE.Vector3(q.x, q.y, q.z);
  const t1 = new THREE.Vector3().crossVectors(qxyz, input.normal).multiplyScalar(2);
  return input.normal.clone()
    .add(t1.clone().multiplyScalar(q.w))
    .add(new THREE.Vector3().crossVectors(qxyz, t1))
    .normalize();
}
