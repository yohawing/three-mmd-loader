import * as THREE from "three";

export interface MmdSdefSkinningInput {
  readonly position: THREE.Vector3;
  readonly skinWeights: readonly [number, number, number, number];
  readonly boneMatrices: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4];
  readonly sdefEnabled: number;
  readonly sdefC: THREE.Vector3;
  readonly sdefRW0: THREE.Vector3;
  readonly sdefRW1: THREE.Vector3;
  readonly bindMatrix?: THREE.Matrix4;
  readonly bindMatrixInverse?: THREE.Matrix4;
}

export interface MmdSdefNormalSkinningInput {
  readonly normal: THREE.Vector3;
  readonly skinWeights: readonly [number, number, number, number];
  readonly boneMatrices: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4];
  readonly sdefEnabled: number;
  readonly bindMatrix?: THREE.Matrix4;
  readonly bindMatrixInverse?: THREE.Matrix4;
}

export function attachMmdSdefSkinning(material: THREE.Material): void {
  if (material.userData.mmdSdefSkinning?.shaderApplied) {
    return;
  }
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.userData.mmdSdefSkinning = {
    shaderApplied: true,
    attributes: ["matricesSdefEnabled", "matricesSdefC", "matricesSdefRW0", "matricesSdefRW1"]
  };
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    material.userData.mmdSdefShader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <skinning_pars_vertex>",
      ["#include <skinning_pars_vertex>", MMD_SDEF_SKINNING_DECLARATION].join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <skinnormal_vertex>",
      MMD_SDEF_SKINNING_NORMAL
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <skinning_vertex>",
      MMD_SDEF_SKINNING_VERTEX
    );
  };
  material.customProgramCacheKey = () => `${previousProgramCacheKey()}-yw-mmd-sdef-skinning`;
  // Provide zero defaults for attributes that may be absent on geometry that has
  // only SDEF (no QDEF) or only QDEF (no SDEF), preventing stale GPU attribute state.
  // THREE.Material.defaultAttributeValues is not in the public type definitions but
  // is supported at runtime for all material types via WebGLBindingStates.
  // Merge with any existing defaultAttributeValues rather than overwriting — a
  // ShaderMaterial may already have custom defaults that must be preserved.
  const matWithDefaults = material as unknown as { defaultAttributeValues?: Record<string, number[]> };
  matWithDefaults.defaultAttributeValues = {
    ...matWithDefaults.defaultAttributeValues,
    matricesSdefEnabled: [0],
    matricesQdefEnabled: [0],
    matricesSdefC: [0, 0, 0],
    matricesSdefRW0: [0, 0, 0],
    matricesSdefRW1: [0, 0, 0]
  };
  material.needsUpdate = true;
}

export function computeMmdSdefSkinnedPosition(input: MmdSdefSkinningInput): THREE.Vector3 {
  const bindMatrix = input.bindMatrix ?? new THREE.Matrix4();
  const bindMatrixInverse = input.bindMatrixInverse ?? new THREE.Matrix4();
  const skinVertex = input.position.clone().applyMatrix4(bindMatrix);
  if (input.sdefEnabled < 0.5) {
    const linearInfluence = createWeightedMatrix(input.boneMatrices, input.skinWeights);
    return skinVertex.applyMatrix4(linearInfluence).applyMatrix4(bindMatrixInverse);
  }
  const sdefRotation = new THREE.Quaternion()
    .setFromRotationMatrix(input.boneMatrices[0])
    .slerp(new THREE.Quaternion().setFromRotationMatrix(input.boneMatrices[1]), input.skinWeights[1]);
  const rotatedCenter = input.sdefC.clone().applyQuaternion(sdefRotation).negate();
  const positionOffset = input.sdefRW0
    .clone()
    .applyMatrix4(input.boneMatrices[0])
    .multiplyScalar(input.skinWeights[0])
    .add(
      input.sdefRW1.clone().applyMatrix4(input.boneMatrices[1]).multiplyScalar(input.skinWeights[1])
    );
  return skinVertex
    .applyQuaternion(sdefRotation)
    .add(rotatedCenter)
    .add(positionOffset)
    .applyMatrix4(bindMatrixInverse);
}

export function computeMmdSdefSkinnedNormal(input: MmdSdefNormalSkinningInput): THREE.Vector3 {
  const bindMatrix = input.bindMatrix ?? new THREE.Matrix4();
  const bindMatrixInverse = input.bindMatrixInverse ?? new THREE.Matrix4();
  const skinNormal = transformVector4Direction(input.normal, bindMatrix);
  if (input.sdefEnabled < 0.5) {
    const linearInfluence = createWeightedMatrix(input.boneMatrices, input.skinWeights);
    return transformVector4Direction(
      transformVector4Direction(skinNormal, linearInfluence),
      bindMatrixInverse
    );
  }
  return input.normal.clone().applyQuaternion(createSdefRotation(input.boneMatrices, input.skinWeights));
}

function createSdefRotation(
  boneMatrices: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4],
  skinWeights: readonly [number, number, number, number]
): THREE.Quaternion {
  return new THREE.Quaternion()
    .setFromRotationMatrix(boneMatrices[0])
    .slerp(new THREE.Quaternion().setFromRotationMatrix(boneMatrices[1]), skinWeights[1]);
}

function transformVector4Direction(vector: THREE.Vector3, matrix: THREE.Matrix4): THREE.Vector3 {
  const transformed = new THREE.Vector4(vector.x, vector.y, vector.z, 0).applyMatrix4(matrix);
  return new THREE.Vector3(transformed.x, transformed.y, transformed.z);
}

function createWeightedMatrix(
  matrices: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4],
  weights: readonly [number, number, number, number]
): THREE.Matrix4 {
  const result = new THREE.Matrix4();
  result.elements.fill(0);
  for (let matrixIndex = 0; matrixIndex < matrices.length; matrixIndex += 1) {
    const elements = matrices[matrixIndex].elements;
    const weight = weights[matrixIndex];
    for (let elementIndex = 0; elementIndex < result.elements.length; elementIndex += 1) {
      result.elements[elementIndex] += elements[elementIndex] * weight;
    }
  }
  return result;
}

const MMD_SDEF_SKINNING_DECLARATION = /* glsl */ `
attribute vec3 matricesSdefC;
attribute float matricesSdefEnabled;
attribute vec3 matricesSdefRW0;
attribute vec3 matricesSdefRW1;
attribute float matricesQdefEnabled;

vec4 ywMmdRotationMatrixToQuaternion(mat3 matrix) {
  float trace = matrix[0][0] + matrix[1][1] + matrix[2][2];
  float s;
  float sqrtParam;
  if (trace > 0.0) {
    sqrtParam = trace + 1.0;
  } else if (matrix[0][0] > matrix[1][1] && matrix[0][0] > matrix[2][2]) {
    sqrtParam = 1.0 + matrix[0][0] - matrix[1][1] - matrix[2][2];
  } else if (matrix[1][1] > matrix[2][2]) {
    sqrtParam = 1.0 + matrix[1][1] - matrix[0][0] - matrix[2][2];
  } else {
    sqrtParam = 1.0 + matrix[2][2] - matrix[0][0] - matrix[1][1];
  }
  float sqrtValue = sqrt(max(sqrtParam, 0.0));
  if (trace > 0.0) {
    s = 0.5 / max(sqrtValue, 0.000001);
    return vec4(
      (matrix[1][2] - matrix[2][1]) * s,
      (matrix[2][0] - matrix[0][2]) * s,
      (matrix[0][1] - matrix[1][0]) * s,
      0.25 / s
    );
  } else if (matrix[0][0] > matrix[1][1] && matrix[0][0] > matrix[2][2]) {
    s = 2.0 * max(sqrtValue, 0.000001);
    return vec4(
      0.25 * s,
      (matrix[0][1] + matrix[1][0]) / s,
      (matrix[2][0] + matrix[0][2]) / s,
      (matrix[1][2] - matrix[2][1]) / s
    );
  } else if (matrix[1][1] > matrix[2][2]) {
    s = 2.0 * max(sqrtValue, 0.000001);
    return vec4(
      (matrix[0][1] + matrix[1][0]) / s,
      0.25 * s,
      (matrix[1][2] + matrix[2][1]) / s,
      (matrix[2][0] - matrix[0][2]) / s
    );
  }
  s = 2.0 * max(sqrtValue, 0.000001);
  return vec4(
    (matrix[2][0] + matrix[0][2]) / s,
    (matrix[1][2] + matrix[2][1]) / s,
    0.25 * s,
    (matrix[0][1] - matrix[1][0]) / s
  );
}

mat3 ywMmdQuaternionToRotationMatrix(vec4 q) {
  float xx = q.x * q.x;
  float yy = q.y * q.y;
  float zz = q.z * q.z;
  float xy = q.x * q.y;
  float zw = q.z * q.w;
  float zx = q.z * q.x;
  float yw = q.y * q.w;
  float yz = q.y * q.z;
  float xw = q.x * q.w;
  return mat3(
    1.0 - 2.0 * (yy + zz), 2.0 * (xy + zw), 2.0 * (zx - yw),
    2.0 * (xy - zw), 1.0 - 2.0 * (zz + xx), 2.0 * (yz + xw),
    2.0 * (zx + yw), 2.0 * (yz - xw), 1.0 - 2.0 * (yy + xx)
  );
}

vec4 ywMmdSlerp(vec4 q0, vec4 q1, float t) {
  float cosTheta = dot(q0, q1);
  q1 = mix(-q1, q1, step(0.0, cosTheta));
  cosTheta = abs(cosTheta);
  if (cosTheta > 0.999999) {
    return normalize(mix(q0, q1, t));
  }
  float theta = acos(cosTheta);
  float sinTheta = sin(theta);
  float w0 = sin((1.0 - t) * theta) / sinTheta;
  float w1 = sin(t * theta) / sinTheta;
  return q0 * w0 + q1 * w1;
}

// Convert a bone matrix to a dual quaternion (real part qr, dual part qd).
// q_d = 0.5 * [t, 0] * q_r
void ywMmdMatToDualQuat(mat4 m, out vec4 qr, out vec4 qd) {
  qr = ywMmdRotationMatrixToQuaternion(mat3(m));
  vec3 t = m[3].xyz;
  qd = 0.5 * vec4(
    t.x * qr.w + t.y * qr.z - t.z * qr.y,
    t.y * qr.w + t.z * qr.x - t.x * qr.z,
    t.z * qr.w + t.x * qr.y - t.y * qr.x,
    -dot(t, qr.xyz)
  );
}
`;

const MMD_SDEF_SKINNING_VERTEX = /* glsl */ `
#ifdef USE_SKINNING
  mat4 ywMmdBoneMatX = getBoneMatrix( skinIndex.x );
  mat4 ywMmdBoneMatY = getBoneMatrix( skinIndex.y );
  mat4 ywMmdBoneMatZ = getBoneMatrix( skinIndex.z );
  mat4 ywMmdBoneMatW = getBoneMatrix( skinIndex.w );

  mat4 skinInfluence = mat4( 0.0 );
  skinInfluence += skinWeight.x * ywMmdBoneMatX;
  skinInfluence += skinWeight.y * ywMmdBoneMatY;
  skinInfluence += skinWeight.z * ywMmdBoneMatZ;
  skinInfluence += skinWeight.w * ywMmdBoneMatW;

  mat3 sdefRotation = ywMmdQuaternionToRotationMatrix(ywMmdSlerp(
    ywMmdRotationMatrixToQuaternion(mat3(ywMmdBoneMatX)),
    ywMmdRotationMatrixToQuaternion(mat3(ywMmdBoneMatY)),
    skinWeight.y
  ));
  mat4 sdefInfluence = mat4(
    vec4(sdefRotation[0], 0.0),
    vec4(sdefRotation[1], 0.0),
    vec4(sdefRotation[2], 0.0),
    vec4(-sdefRotation * matricesSdefC, 1.0)
  );
  vec3 sdefPositionOffset =
    vec3(ywMmdBoneMatX * vec4(matricesSdefRW0, 1.0)) * skinWeight.x +
    vec3(ywMmdBoneMatY * vec4(matricesSdefRW1, 1.0)) * skinWeight.y;
  sdefInfluence[3] += vec4(sdefPositionOffset, 0.0);

  // SDEF / linear selection (for non-QDEF vertices)
  float useLinearDeform = 1.0 - step(0.5, matricesSdefEnabled);
  mat4 mmdSkinInfluence = mat4(
    mix(sdefInfluence[0], skinInfluence[0], useLinearDeform),
    mix(sdefInfluence[1], skinInfluence[1], useLinearDeform),
    mix(sdefInfluence[2], skinInfluence[2], useLinearDeform),
    mix(sdefInfluence[3], skinInfluence[3], useLinearDeform)
  );

  vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
  vec4 skinned = mmdSkinInfluence * skinVertex;

  // QDEF: Dual Quaternion Skinning — overrides SDEF/linear for type-4 vertices
  float ywMmdUseQdef = step(0.5, matricesQdefEnabled);
  if (ywMmdUseQdef > 0.5) {
    vec4 qrX, qdX, qrY, qdY, qrZ, qdZ, qrW, qdW;
    ywMmdMatToDualQuat(ywMmdBoneMatX, qrX, qdX);
    ywMmdMatToDualQuat(ywMmdBoneMatY, qrY, qdY);
    ywMmdMatToDualQuat(ywMmdBoneMatZ, qrZ, qdZ);
    ywMmdMatToDualQuat(ywMmdBoneMatW, qrW, qdW);
    // Antipodal correction: use the bone with the highest weight as reference
    // so that a zero-weight bone X does not mis-flip contributing bones.
    vec4 qrRef = qrX;
    if (skinWeight.y > skinWeight.x && skinWeight.y >= skinWeight.z && skinWeight.y >= skinWeight.w) qrRef = qrY;
    else if (skinWeight.z >= skinWeight.x && skinWeight.z >= skinWeight.y && skinWeight.z >= skinWeight.w) qrRef = qrZ;
    else if (skinWeight.w >= skinWeight.x && skinWeight.w >= skinWeight.y && skinWeight.w >= skinWeight.z) qrRef = qrW;
    if (dot(qrRef, qrX) < 0.0) { qrX = -qrX; qdX = -qdX; }
    if (dot(qrRef, qrY) < 0.0) { qrY = -qrY; qdY = -qdY; }
    if (dot(qrRef, qrZ) < 0.0) { qrZ = -qrZ; qdZ = -qdZ; }
    if (dot(qrRef, qrW) < 0.0) { qrW = -qrW; qdW = -qdW; }
    vec4 blendedQr = skinWeight.x * qrX + skinWeight.y * qrY + skinWeight.z * qrZ + skinWeight.w * qrW;
    vec4 blendedQd = skinWeight.x * qdX + skinWeight.y * qdY + skinWeight.z * qdZ + skinWeight.w * qdW;
    // Guard against zero-length blend (all-zero weights or full antipodal cancellation)
    float blendedLen = max(length(blendedQr), 0.000001);
    blendedQr /= blendedLen;
    blendedQd /= blendedLen;
    // Apply DQS: rotation via Rodrigues, translation via dual part
    vec3 qdefP = skinVertex.xyz;
    vec3 qdefQ = blendedQr.xyz;
    float qdefW = blendedQr.w;
    vec3 qdefT1 = 2.0 * cross(qdefQ, qdefP);
    vec3 qdefRotated = qdefP + qdefW * qdefT1 + cross(qdefQ, qdefT1);
    vec3 qdefTrans = 2.0 * (blendedQr.w * blendedQd.xyz - blendedQd.w * blendedQr.xyz - cross(blendedQd.xyz, blendedQr.xyz));
    skinned = vec4(qdefRotated + qdefTrans, 1.0);
  }

  transformed = ( bindMatrixInverse * skinned ).xyz;
#endif
`;

const MMD_SDEF_SKINNING_NORMAL = /* glsl */ `
#ifdef USE_SKINNING
  mat4 ywMmdNormalBoneMatX = getBoneMatrix( skinIndex.x );
  mat4 ywMmdNormalBoneMatY = getBoneMatrix( skinIndex.y );
  mat4 ywMmdNormalBoneMatZ = getBoneMatrix( skinIndex.z );
  mat4 ywMmdNormalBoneMatW = getBoneMatrix( skinIndex.w );

  mat4 ywMmdLinearNormalSkinMatrix = mat4( 0.0 );
  ywMmdLinearNormalSkinMatrix += skinWeight.x * ywMmdNormalBoneMatX;
  ywMmdLinearNormalSkinMatrix += skinWeight.y * ywMmdNormalBoneMatY;
  ywMmdLinearNormalSkinMatrix += skinWeight.z * ywMmdNormalBoneMatZ;
  ywMmdLinearNormalSkinMatrix += skinWeight.w * ywMmdNormalBoneMatW;
  ywMmdLinearNormalSkinMatrix = bindMatrixInverse * ywMmdLinearNormalSkinMatrix * bindMatrix;

  // Snapshot the unmodified objectNormal so each branch reads the original value.
  vec3 ywMmdOriginalNormal = objectNormal;

  mat3 ywMmdSdefNormalRotation = ywMmdQuaternionToRotationMatrix(ywMmdSlerp(
    ywMmdRotationMatrixToQuaternion(mat3(ywMmdNormalBoneMatX)),
    ywMmdRotationMatrixToQuaternion(mat3(ywMmdNormalBoneMatY)),
    skinWeight.y
  ));
  vec3 ywMmdSdefNormal = ywMmdSdefNormalRotation * ywMmdOriginalNormal;
  vec3 ywMmdLinearNormal = vec4( ywMmdLinearNormalSkinMatrix * vec4( ywMmdOriginalNormal, 0.0 ) ).xyz;
  float ywMmdUseLinearNormalDeform = 1.0 - step(0.5, matricesSdefEnabled);
  objectNormal = mix(ywMmdSdefNormal, ywMmdLinearNormal, ywMmdUseLinearNormalDeform);

  // QDEF: apply DQS rotation to the original normal (no translation for normals).
  // Uses ywMmdOriginalNormal to avoid double-rotating on top of the SDEF/linear result.
  float ywMmdUseQdefNormal = step(0.5, matricesQdefEnabled);
  if (ywMmdUseQdefNormal > 0.5) {
    vec4 qrNX, qdNX, qrNY, qdNY, qrNZ, qdNZ, qrNW, qdNW;
    ywMmdMatToDualQuat(ywMmdNormalBoneMatX, qrNX, qdNX);
    ywMmdMatToDualQuat(ywMmdNormalBoneMatY, qrNY, qdNY);
    ywMmdMatToDualQuat(ywMmdNormalBoneMatZ, qrNZ, qdNZ);
    ywMmdMatToDualQuat(ywMmdNormalBoneMatW, qrNW, qdNW);
    // Antipodal correction: use max-weight bone as reference
    vec4 qrNRef = qrNX;
    if (skinWeight.y > skinWeight.x && skinWeight.y >= skinWeight.z && skinWeight.y >= skinWeight.w) qrNRef = qrNY;
    else if (skinWeight.z >= skinWeight.x && skinWeight.z >= skinWeight.y && skinWeight.z >= skinWeight.w) qrNRef = qrNZ;
    else if (skinWeight.w >= skinWeight.x && skinWeight.w >= skinWeight.y && skinWeight.w >= skinWeight.z) qrNRef = qrNW;
    if (dot(qrNRef, qrNX) < 0.0) { qrNX = -qrNX; }
    if (dot(qrNRef, qrNY) < 0.0) { qrNY = -qrNY; }
    if (dot(qrNRef, qrNZ) < 0.0) { qrNZ = -qrNZ; }
    if (dot(qrNRef, qrNW) < 0.0) { qrNW = -qrNW; }
    vec4 blendedQrN = skinWeight.x * qrNX + skinWeight.y * qrNY + skinWeight.z * qrNZ + skinWeight.w * qrNW;
    blendedQrN /= max(length(blendedQrN), 0.000001);
    vec3 qdefNQ = blendedQrN.xyz;
    float qdefNW = blendedQrN.w;
    vec3 qdefNT = 2.0 * cross(qdefNQ, ywMmdOriginalNormal);
    objectNormal = ywMmdOriginalNormal + qdefNW * qdefNT + cross(qdefNQ, qdefNT);
  }
#endif
`;
