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

  float useLinearDeform = 1.0 - step(0.5, matricesSdefEnabled);
  mat4 mmdSkinInfluence = mat4(
    mix(sdefInfluence[0], skinInfluence[0], useLinearDeform),
    mix(sdefInfluence[1], skinInfluence[1], useLinearDeform),
    mix(sdefInfluence[2], skinInfluence[2], useLinearDeform),
    mix(sdefInfluence[3], skinInfluence[3], useLinearDeform)
  );

  vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
  vec4 skinned = mmdSkinInfluence * skinVertex;
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

  mat3 ywMmdSdefNormalRotation = ywMmdQuaternionToRotationMatrix(ywMmdSlerp(
    ywMmdRotationMatrixToQuaternion(mat3(ywMmdNormalBoneMatX)),
    ywMmdRotationMatrixToQuaternion(mat3(ywMmdNormalBoneMatY)),
    skinWeight.y
  ));
  vec3 ywMmdSdefNormal = ywMmdSdefNormalRotation * objectNormal;
  vec3 ywMmdLinearNormal = vec4( ywMmdLinearNormalSkinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
  float ywMmdUseLinearNormalDeform = 1.0 - step(0.5, matricesSdefEnabled);
  objectNormal = mix(ywMmdSdefNormal, ywMmdLinearNormal, ywMmdUseLinearNormalDeform);
#endif
`;
