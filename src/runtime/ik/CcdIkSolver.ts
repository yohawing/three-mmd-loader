export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];
export type MutableQuatTuple = [number, number, number, number];

export interface CcdIkBone {
  readonly parentIndex: number;
  readonly translation: Vec3Tuple;
}

export interface CcdIkLink {
  readonly boneIndex: number;
  readonly enabled?: boolean;
  readonly angleLimit?: CcdIkLinkAngleLimit;
  readonly limitsKind?: "pmdKnee" | "pmxLinkLimit";
}

export interface CcdIkLinkAngleLimit {
  readonly minimumAngle: Vec3Tuple;
  readonly maximumAngle: Vec3Tuple;
}

export interface CcdIkChain {
  readonly goalBoneIndex: number;
  readonly effectorBoneIndex: number;
  readonly links: readonly CcdIkLink[];
  readonly iterationCount: number;
  readonly maxAnglePerIteration?: number;
  readonly tolerance?: number;
}

export interface CcdIkPose {
  readonly rotations: MutableQuatTuple[];
}

export interface CcdIkSolveInput {
  readonly bones: readonly CcdIkBone[];
  readonly pose: CcdIkPose;
  readonly chains: readonly CcdIkChain[];
}

export interface CcdIkSolveResult {
  readonly chainCount: number;
  readonly iterationCount: number;
  readonly finalDistances: readonly number[];
}

interface IkChainState {
  previousAngle: [number, number, number];
  planeModeAngle: number;
}

type LinkLimits = {
  readonly lower: [number, number, number];
  readonly upper: [number, number, number];
};

const maxIkLoopCount = 256;
const matrixElementCount = 16;

export class CcdIkSolver {
  solve(input: CcdIkSolveInput): CcdIkSolveResult {
    validateInput(input);

    const translations = input.bones.map(
      (bone) => [...bone.translation] as [number, number, number]
    );
    const matrices = new Float32Array(input.bones.length * 16);
    const finalDistances: number[] = [];
    let totalIterations = 0;

    composeWorldMatrices(input.bones, translations, input.pose.rotations, matrices);
    for (const chain of input.chains) {
      const iterationCount = Math.min(
        Math.max(Math.trunc(chain.iterationCount), 0),
        maxIkLoopCount
      );
      totalIterations +=
        solveTwoBonePlaneChain(
          input.bones,
          translations,
          input.pose.rotations,
          matrices,
          chain,
          iterationCount
        ) ??
        solveChain(
        input.bones,
        translations,
        input.pose.rotations,
        matrices,
        chain,
        iterationCount
        );
      finalDistances.push(
        vectorLength(
          subtractVectors(
            matrixTranslation(matrices, chain.effectorBoneIndex),
            matrixTranslation(matrices, chain.goalBoneIndex)
          )
        )
      );
    }

    return {
      chainCount: input.chains.length,
      iterationCount: totalIterations,
      finalDistances
    };
  }
}

function solveChain(
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: MutableQuatTuple[],
  matrices: Float32Array,
  chain: CcdIkChain,
  iterationCount: number
): number {
  const chainState = chain.links.map(() => ({
    previousAngle: [0, 0, 0] as [number, number, number],
    planeModeAngle: 0
  }));
  const baseRotations = rotations.map(
    (rotation) => [...rotation] as [number, number, number, number]
  );
  const ikRotations = rotations.map(() => [0, 0, 0, 1] as [number, number, number, number]);
  const bestRotations = chain.links.map(
    (link) => ikRotations[link.boneIndex]?.slice() as [number, number, number, number] | undefined
  );
  const limitAngle = maxAnglePerIteration(chain);
  const tolerance = chain.tolerance ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let completedIterations = 0;

  for (let iteration = 0; iteration < iterationCount; iteration += 1) {
    const ikPosition = matrixTranslation(matrices, chain.goalBoneIndex);
    const targetPositionBeforeIteration = matrixTranslation(matrices, chain.effectorBoneIndex);
    if (vectorLength(subtractVectors(targetPositionBeforeIteration, ikPosition)) <= tolerance) {
      break;
    }
    for (let linkIndex = 0; linkIndex < chain.links.length; linkIndex += 1) {
      const link = chain.links[linkIndex];
      if (
        link.enabled === false ||
        link.boneIndex === chain.effectorBoneIndex ||
        !bones[link.boneIndex]
      ) {
        continue;
      }

      const limits = toLinkLimits(link.angleLimit);
      const singleAxis = getSingleAxisLimit(limits);
      if (limits && singleAxis !== null) {
        solvePlaneLink({
          bones,
          translations,
          baseRotations,
          ikRotations,
          rotations,
          matrices,
          ikBoneIndex: chain.goalBoneIndex,
          ikTargetIndex: chain.effectorBoneIndex,
          link,
          limits,
          linkIndex,
          chainState,
          iteration,
          limitAngle,
          axisIndex: singleAxis
        });
        continue;
      }

      const targetPosition = matrixTranslation(matrices, chain.effectorBoneIndex);
      const linkPosition = matrixTranslation(matrices, link.boneIndex);
      const chainIkVector = normalizeVector(
        transformDirectionByInverseMatrix(
          subtractVectors(ikPosition, linkPosition),
          matrices,
          link.boneIndex
        )
      );
      const chainTargetVector = normalizeVector(
        transformDirectionByInverseMatrix(
          subtractVectors(targetPosition, linkPosition),
          matrices,
          link.boneIndex
        )
      );
      const dot = clamp(dotVectors(chainTargetVector, chainIkVector), -1, 1);
      let angle = Math.acos(dot);
      if (angle < 1e-3 * (Math.PI / 180)) {
        continue;
      }
      angle = Math.min(angle, limitAngle);
      let axis = normalizeVector(crossVectors(chainTargetVector, chainIkVector));
      if (vectorLength(axis) < 1e-5) {
        if (dot > -1 + 1e-5) {
          continue;
        }
        axis = stablePerpendicularAxis(chainTargetVector);
      }

      const delta = axisAngleQuaternion(axis, angle);
      const baseRotation = baseRotations[link.boneIndex] ?? [0, 0, 0, 1];
      let chainRotation = multiplyQuaternions(
        multiplyQuaternions(ikRotations[link.boneIndex], baseRotation),
        delta
      );
      if (limits) {
        chainRotation = clampLimitedRotation(
          chainRotation,
          limits,
          chainState[linkIndex],
          limitAngle
        );
      }
      ikRotations[link.boneIndex] = multiplyQuaternions(
        chainRotation,
        invertQuaternion(baseRotation)
      );
      applyEffectiveRotation(rotations, baseRotations, ikRotations, link.boneIndex);
      composeWorldMatrices(bones, translations, rotations, matrices);
    }

    completedIterations += 1;
    const currentDistance = vectorLength(
      subtractVectors(
        matrixTranslation(matrices, chain.effectorBoneIndex),
        matrixTranslation(matrices, chain.goalBoneIndex)
      )
    );
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      for (let linkIndex = 0; linkIndex < chain.links.length; linkIndex += 1) {
        const boneIndex = chain.links[linkIndex]?.boneIndex ?? -1;
        if (boneIndex >= 0 && boneIndex < bones.length) {
          bestRotations[linkIndex] = ikRotations[boneIndex]?.slice() as [
            number,
            number,
            number,
            number
          ];
        }
      }
      if (currentDistance <= tolerance) {
        break;
      }
    } else {
      for (let linkIndex = 0; linkIndex < chain.links.length; linkIndex += 1) {
        const boneIndex = chain.links[linkIndex]?.boneIndex ?? -1;
        const bestIkRotation = bestRotations[linkIndex];
        if (boneIndex >= 0 && boneIndex < bones.length && bestIkRotation) {
          ikRotations[boneIndex] = bestIkRotation;
          applyEffectiveRotation(rotations, baseRotations, ikRotations, boneIndex);
        }
      }
      composeWorldMatrices(bones, translations, rotations, matrices);
      break;
    }
  }

  return completedIterations;
}

function maxAnglePerIteration(chain: CcdIkChain): number {
  if (chain.maxAnglePerIteration === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(chain.maxAnglePerIteration, 0);
}

function solveTwoBonePlaneChain(
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: MutableQuatTuple[],
  matrices: Float32Array,
  chain: CcdIkChain,
  iterationCount: number
): number | undefined {
  if (iterationCount <= 0 || chain.links.length !== 2) {
    return undefined;
  }
  const midLink = chain.links[0];
  const rootLink = chain.links[1];
  if (!midLink || !rootLink || midLink.enabled === false || rootLink.enabled === false) {
    return undefined;
  }
  const midLimits = toLinkLimits(midLink.angleLimit);
  const axisIndex = getSingleAxisLimit(midLimits);
  if (!midLimits || axisIndex === null) {
    return undefined;
  }
  const rootIndex = rootLink.boneIndex;
  const midIndex = midLink.boneIndex;
  const effectorIndex = chain.effectorBoneIndex;
  if (
    rootIndex === effectorIndex ||
    midIndex === effectorIndex ||
    bones[midIndex]?.parentIndex !== rootIndex ||
    bones[effectorIndex]?.parentIndex !== midIndex
  ) {
    return undefined;
  }

  const upper = translations[midIndex] ?? [0, 0, 0];
  const lower = translations[effectorIndex] ?? [0, 0, 0];
  const upperLength = vectorLength(upper);
  const lowerLength = vectorLength(lower);
  if (upperLength < 1e-8 || lowerLength < 1e-8) {
    return undefined;
  }

  const rootPosition = matrixTranslation(matrices, rootIndex);
  const goalPosition = matrixTranslation(matrices, chain.goalBoneIndex);
  const targetVector = transformDirectionByInverseMatrix(
    subtractVectors(goalPosition, rootPosition),
    matrices,
    rootIndex
  );
  const targetLength = vectorLength(targetVector);
  if (targetLength < 1e-8) {
    return undefined;
  }

  const reachableLength = clamp(
    targetLength,
    Math.abs(upperLength - lowerLength),
    upperLength + lowerLength
  );
  const rawBendAngle = Math.acos(
    clamp(
      (reachableLength * reachableLength - upperLength * upperLength - lowerLength * lowerLength) /
        (2 * upperLength * lowerLength),
      -1,
      1
    )
  );
  const bendAngle = chooseLimitedBendAngle(rawBendAngle, midLimits, axisIndex);
  const axis = axisTuple(axisIndex);
  rotations[midIndex] = axisAngleQuaternion(axis, bendAngle);
  composeWorldMatrices(bones, translations, rotations, matrices);

  const currentVector = transformDirectionByInverseMatrix(
    subtractVectors(matrixTranslation(matrices, effectorIndex), rootPosition),
    matrices,
    rootIndex
  );
  const rootDelta = quaternionFromUnitVectors(
    normalizeVector(currentVector),
    normalizeVector(targetVector)
  );
  rotations[rootIndex] = multiplyQuaternions(rotations[rootIndex] ?? [0, 0, 0, 1], rootDelta);
  composeWorldMatrices(bones, translations, rotations, matrices);
  return 1;
}

function chooseLimitedBendAngle(
  rawAngle: number,
  limits: LinkLimits,
  axisIndex: number
): number {
  const lower = limits.lower[axisIndex];
  const upper = limits.upper[axisIndex];
  const candidates = [rawAngle, -rawAngle].map((angle) => clamp(angle, lower, upper));
  return Math.abs(candidates[0] - rawAngle) < Math.abs(candidates[1] + rawAngle)
    ? candidates[0]
    : candidates[1];
}

function axisTuple(axisIndex: number): [number, number, number] {
  return axisIndex === 0 ? [1, 0, 0] : axisIndex === 1 ? [0, 1, 0] : [0, 0, 1];
}

function solvePlaneLink({
  bones,
  translations,
  baseRotations,
  ikRotations,
  rotations,
  matrices,
  ikBoneIndex,
  ikTargetIndex,
  link,
  limits,
  linkIndex,
  chainState,
  iteration,
  limitAngle,
  axisIndex
}: {
  readonly bones: readonly CcdIkBone[];
  readonly translations: readonly [number, number, number][];
  readonly baseRotations: readonly [number, number, number, number][];
  readonly ikRotations: [number, number, number, number][];
  readonly rotations: MutableQuatTuple[];
  readonly matrices: Float32Array;
  readonly ikBoneIndex: number;
  readonly ikTargetIndex: number;
  readonly link: CcdIkLink;
  readonly limits: LinkLimits;
  readonly linkIndex: number;
  readonly chainState: IkChainState[];
  readonly iteration: number;
  readonly limitAngle: number;
  readonly axisIndex: number;
}): void {
  const rotateAxis = axisTuple(axisIndex);
  const ikPosition = matrixTranslation(matrices, ikBoneIndex);
  const targetPosition = matrixTranslation(matrices, ikTargetIndex);
  const linkPosition = matrixTranslation(matrices, link.boneIndex);
  const chainIkVector = normalizeVector(
    transformDirectionByInverseMatrix(
      subtractVectors(ikPosition, linkPosition),
      matrices,
      link.boneIndex
    )
  );
  const chainTargetVector = normalizeVector(
    transformDirectionByInverseMatrix(
      subtractVectors(targetPosition, linkPosition),
      matrices,
      link.boneIndex
    )
  );
  const dot = clamp(dotVectors(chainTargetVector, chainIkVector), -1, 1);
  const rawAngle = Math.acos(dot);
  const angle = Math.min(rawAngle, limitAngle);
  const targetVec1 = rotateVectorByQuaternion(
    chainTargetVector,
    axisAngleQuaternion(rotateAxis, angle)
  );
  const targetVec2 = rotateVectorByQuaternion(
    chainTargetVector,
    axisAngleQuaternion(rotateAxis, -angle)
  );
  const state = chainState[linkIndex];
  let newAngle = state.planeModeAngle;
  const signedAngle =
    dotVectors(targetVec1, chainIkVector) > dotVectors(targetVec2, chainIkVector) ? angle : -angle;
  newAngle += signedAngle;
  if (iteration === 0) {
    const lower = limits.lower[axisIndex];
    const upper = limits.upper[axisIndex];
    if (newAngle < lower || newAngle > upper) {
      if (-newAngle > lower && -newAngle < upper) {
        newAngle *= -1;
      } else {
        const half = (lower + upper) * 0.5;
        if (Math.abs(half - newAngle) > Math.abs(half + newAngle)) {
          newAngle *= -1;
        }
      }
    }
  }
  newAngle = clamp(newAngle, limits.lower[axisIndex], limits.upper[axisIndex]);
  state.planeModeAngle = newAngle;
  const baseRotation = baseRotations[link.boneIndex] ?? [0, 0, 0, 1];
  ikRotations[link.boneIndex] = multiplyQuaternions(
    axisAngleQuaternion(rotateAxis, newAngle),
    invertQuaternion(baseRotation)
  );
  applyEffectiveRotation(rotations, baseRotations, ikRotations, link.boneIndex);
  composeWorldMatrices(bones, translations, rotations, matrices);
}

function validateInput(input: CcdIkSolveInput): void {
  for (const [index, bone] of input.bones.entries()) {
    if (!Number.isInteger(bone.parentIndex) || bone.parentIndex < -1) {
      throw new RangeError("CCD IK bone parentIndex must be -1 or a valid bone index");
    }
    if (bone.parentIndex === index) {
      throw new RangeError("CCD IK bone cannot parent itself");
    }
    if (bone.parentIndex >= input.bones.length) {
      throw new RangeError("CCD IK bone parentIndex is out of range");
    }
    assertFiniteVector(bone.translation, "bone translation");
  }
  for (let index = 0; index < input.bones.length; index += 1) {
    assertAcyclicParentChain(input.bones, index);
  }
  if (input.pose.rotations.length !== input.bones.length) {
    throw new RangeError("CCD IK pose rotation count must match bone count");
  }
  for (const rotation of input.pose.rotations) {
    assertFiniteQuaternion(rotation, "pose rotation");
  }
  for (const chain of input.chains) {
    assertBoneIndex(input.bones, chain.goalBoneIndex, "goalBoneIndex");
    assertBoneIndex(input.bones, chain.effectorBoneIndex, "effectorBoneIndex");
    if (!Number.isFinite(chain.iterationCount) || chain.iterationCount < 0) {
      throw new RangeError("CCD IK iterationCount must be a finite non-negative number");
    }
    if (chain.maxAnglePerIteration !== undefined && !Number.isFinite(chain.maxAnglePerIteration)) {
      throw new RangeError("CCD IK maxAnglePerIteration must be finite when provided");
    }
    if (
      chain.tolerance !== undefined &&
      (!Number.isFinite(chain.tolerance) || chain.tolerance < 0)
    ) {
      throw new RangeError("CCD IK tolerance must be a finite non-negative number");
    }
    for (const link of chain.links) {
      assertBoneIndex(input.bones, link.boneIndex, "link boneIndex");
      if (link.angleLimit !== undefined) {
        assertFiniteVector(link.angleLimit.minimumAngle, "link minimumAngle");
        assertFiniteVector(link.angleLimit.maximumAngle, "link maximumAngle");
        for (let axis = 0; axis < 3; axis += 1) {
          if (link.angleLimit.minimumAngle[axis] > link.angleLimit.maximumAngle[axis]) {
            throw new RangeError("CCD IK link angle limit minimum must not exceed maximum");
          }
        }
      }
      if (
        link.limitsKind !== undefined &&
        link.limitsKind !== "pmdKnee" &&
        link.limitsKind !== "pmxLinkLimit"
      ) {
        throw new RangeError("CCD IK link limitsKind must be pmdKnee or pmxLinkLimit");
      }
    }
  }
}

function assertAcyclicParentChain(bones: readonly CcdIkBone[], boneIndex: number): void {
  const visited = new Set<number>();
  let currentIndex = boneIndex;
  while (currentIndex >= 0) {
    if (visited.has(currentIndex)) {
      throw new RangeError("CCD IK bone parent chain must not contain cycles");
    }
    visited.add(currentIndex);
    currentIndex = bones[currentIndex]?.parentIndex ?? -1;
  }
}

function composeWorldMatrices(
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: readonly QuatTuple[],
  matrices: Float32Array
): void {
  const local = new Float32Array(matrixElementCount);
  if (isParentBeforeChildOrdered(bones)) {
    for (let index = 0; index < bones.length; index += 1) {
      composeWorldMatrixInOrder(index, bones, translations, rotations, matrices, local);
    }
    return;
  }
  const states = new Uint8Array(bones.length);
  for (let index = 0; index < bones.length; index += 1) {
    composeWorldMatrix(index, bones, translations, rotations, matrices, states, local);
  }
}

function isParentBeforeChildOrdered(bones: readonly CcdIkBone[]): boolean {
  for (let index = 0; index < bones.length; index += 1) {
    const parentIndex = bones[index]?.parentIndex ?? -1;
    if (parentIndex >= index) {
      return false;
    }
  }
  return true;
}

function composeWorldMatrixInOrder(
  index: number,
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: readonly QuatTuple[],
  matrices: Float32Array,
  local: Float32Array
): void {
  composeColumnMajorMatrixInto(
    translations[index] ?? [0, 0, 0],
    rotations[index] ?? [0, 0, 0, 1],
    local
  );
  const targetOffset = index * matrixElementCount;
  const parentIndex = bones[index]?.parentIndex ?? -1;
  if (parentIndex >= 0) {
    multiplyColumnMajorMatricesInto(
      matrices,
      parentIndex * matrixElementCount,
      local,
      0,
      matrices,
      targetOffset
    );
  } else {
    setMatrix(matrices, targetOffset, local, 0);
  }
}

function composeWorldMatrix(
  index: number,
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: readonly QuatTuple[],
  matrices: Float32Array,
  states: Uint8Array,
  local: Float32Array
): void {
  if (states[index] === 2) {
    return;
  }
  if (states[index] === 1) {
    throw new RangeError("CCD IK bone parent chain must not contain cycles");
  }

  states[index] = 1;
  const targetOffset = index * matrixElementCount;
  const parentIndex = bones[index]?.parentIndex ?? -1;
  if (parentIndex >= 0) {
    composeWorldMatrix(parentIndex, bones, translations, rotations, matrices, states, local);
    composeColumnMajorMatrixInto(
      translations[index] ?? [0, 0, 0],
      rotations[index] ?? [0, 0, 0, 1],
      local
    );
    multiplyColumnMajorMatricesInto(
      matrices,
      parentIndex * matrixElementCount,
      local,
      0,
      matrices,
      targetOffset
    );
  } else {
    composeColumnMajorMatrixInto(
      translations[index] ?? [0, 0, 0],
      rotations[index] ?? [0, 0, 0, 1],
      local
    );
    setMatrix(matrices, targetOffset, local, 0);
  }
  states[index] = 2;
}

function composeColumnMajorMatrixInto(
  translation: [number, number, number],
  rotation: QuatTuple,
  target: Float32Array
): void {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  target[0] = 1 - (yy + zz);
  target[1] = xy + wz;
  target[2] = xz - wy;
  target[3] = 0;
  target[4] = xy - wz;
  target[5] = 1 - (xx + zz);
  target[6] = yz + wx;
  target[7] = 0;
  target[8] = xz + wy;
  target[9] = yz - wx;
  target[10] = 1 - (xx + yy);
  target[11] = 0;
  target[12] = translation[0];
  target[13] = translation[1];
  target[14] = translation[2];
  target[15] = 1;
}

function multiplyColumnMajorMatricesInto(
  left: Float32Array,
  leftOffset: number,
  right: Float32Array,
  rightOffset: number,
  target: Float32Array,
  targetOffset: number
): void {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      target[targetOffset + column * 4 + row] =
        left[leftOffset + row] * right[rightOffset + column * 4] +
        left[leftOffset + 4 + row] * right[rightOffset + column * 4 + 1] +
        left[leftOffset + 8 + row] * right[rightOffset + column * 4 + 2] +
        left[leftOffset + 12 + row] * right[rightOffset + column * 4 + 3];
    }
  }
}

function setMatrix(
  target: Float32Array,
  targetOffset: number,
  source: Float32Array,
  sourceOffset: number
): void {
  for (let index = 0; index < matrixElementCount; index += 1) {
    target[targetOffset + index] = source[sourceOffset + index];
  }
}

function matrixTranslation(matrices: Float32Array, index: number): [number, number, number] {
  const offset = index * 16;
  return [matrices[offset + 12] ?? 0, matrices[offset + 13] ?? 0, matrices[offset + 14] ?? 0];
}

function transformDirectionByInverseMatrix(
  vector: [number, number, number],
  matrices: Float32Array,
  boneIndex: number
): [number, number, number] {
  const offset = boneIndex * 16;
  return [
    vector[0] * (matrices[offset] ?? 0) +
      vector[1] * (matrices[offset + 1] ?? 0) +
      vector[2] * (matrices[offset + 2] ?? 0),
    vector[0] * (matrices[offset + 4] ?? 0) +
      vector[1] * (matrices[offset + 5] ?? 0) +
      vector[2] * (matrices[offset + 6] ?? 0),
    vector[0] * (matrices[offset + 8] ?? 0) +
      vector[1] * (matrices[offset + 9] ?? 0) +
      vector[2] * (matrices[offset + 10] ?? 0)
  ];
}

function applyEffectiveRotation(
  rotations: MutableQuatTuple[],
  baseRotations: readonly [number, number, number, number][],
  ikRotations: readonly [number, number, number, number][],
  boneIndex: number
): void {
  rotations[boneIndex] = multiplyQuaternions(
    ikRotations[boneIndex] ?? [0, 0, 0, 1],
    baseRotations[boneIndex] ?? [0, 0, 0, 1]
  );
}

function toLinkLimits(limit: CcdIkLink["angleLimit"]): LinkLimits | undefined {
  if (!limit) {
    return undefined;
  }
  return {
    lower: [...limit.minimumAngle],
    upper: [...limit.maximumAngle]
  };
}

function getSingleAxisLimit(limits: LinkLimits | undefined): number | null {
  if (!limits) {
    return null;
  }
  const x = limits.lower[0] !== 0 || limits.upper[0] !== 0;
  const y = limits.lower[1] !== 0 || limits.upper[1] !== 0;
  const z = limits.lower[2] !== 0 || limits.upper[2] !== 0;
  if (x && hasZeroEndpointAxisLimit(limits, 1) && hasZeroEndpointAxisLimit(limits, 2)) {
    return 0;
  }
  if (y && hasZeroEndpointAxisLimit(limits, 0) && hasZeroEndpointAxisLimit(limits, 2)) {
    return 1;
  }
  if (z && hasZeroEndpointAxisLimit(limits, 0) && hasZeroEndpointAxisLimit(limits, 1)) {
    return 2;
  }
  return null;
}

function hasZeroEndpointAxisLimit(limits: LinkLimits, axis: number): boolean {
  return limits.lower[axis] === 0 || limits.upper[axis] === 0;
}

function clampLimitedRotation(
  rotation: [number, number, number, number],
  limits: LinkLimits,
  state: IkChainState,
  limitAngle: number
): [number, number, number, number] {
  const euler = decomposeEulerXyz(quaternionToRotation3(rotation), state.previousAngle);
  const clampedEuler: [number, number, number] = [
    clamp(euler[0], limits.lower[0], limits.upper[0]),
    clamp(euler[1], limits.lower[1], limits.upper[1]),
    clamp(euler[2], limits.lower[2], limits.upper[2])
  ];
  const limitedStep: [number, number, number] = [
    clamp(clampedEuler[0] - state.previousAngle[0], -limitAngle, limitAngle) +
      state.previousAngle[0],
    clamp(clampedEuler[1] - state.previousAngle[1], -limitAngle, limitAngle) +
      state.previousAngle[1],
    clamp(clampedEuler[2] - state.previousAngle[2], -limitAngle, limitAngle) +
      state.previousAngle[2]
  ];
  state.previousAngle = limitedStep;
  return eulerXyzToQuaternion(limitedStep);
}

function assertBoneIndex(bones: readonly CcdIkBone[], index: number, name: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= bones.length) {
    throw new RangeError(`CCD IK ${name} is out of range`);
  }
}

function assertFiniteVector(vector: Vec3Tuple, name: string): void {
  if (!vector.every(Number.isFinite)) {
    throw new RangeError(`CCD IK ${name} must be finite`);
  }
}

function assertFiniteQuaternion(rotation: QuatTuple, name: string): void {
  if (!rotation.every(Number.isFinite)) {
    throw new RangeError(`CCD IK ${name} must be finite`);
  }
}

function subtractVectors(
  left: [number, number, number],
  right: [number, number, number]
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function crossVectors(
  left: [number, number, number],
  right: [number, number, number]
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function dotVectors(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeVector(value: [number, number, number]): [number, number, number] {
  const length = vectorLength(value);
  if (length < 1e-8) {
    return [0, 0, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function stablePerpendicularAxis(vector: [number, number, number]): [number, number, number] {
  const basis: [number, number, number] = Math.abs(vector[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalizeVector(crossVectors(vector, basis));
}

function vectorLength(value: [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function axisAngleQuaternion(
  axis: [number, number, number],
  angle: number
): [number, number, number, number] {
  const half = angle / 2;
  const scale = Math.sin(half);
  return normalizeQuaternion([axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(half)]);
}

function quaternionFromUnitVectors(
  from: [number, number, number],
  to: [number, number, number]
): [number, number, number, number] {
  const dot = clamp(dotVectors(from, to), -1, 1);
  if (dot > 1 - 1e-8) {
    return [0, 0, 0, 1];
  }
  if (dot < -1 + 1e-8) {
    return axisAngleQuaternion(stablePerpendicularAxis(from), Math.PI);
  }
  const axis = crossVectors(from, to);
  return normalizeQuaternion([axis[0], axis[1], axis[2], 1 + dot]);
}

function multiplyQuaternions(left: QuatTuple, right: QuatTuple): [number, number, number, number] {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return normalizeQuaternion([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ]);
}

function normalizeQuaternion(value: QuatTuple): [number, number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2], value[3]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length, value[3] / length];
}

function invertQuaternion(value: QuatTuple): [number, number, number, number] {
  const normalized = normalizeQuaternion(value);
  return [-normalized[0], -normalized[1], -normalized[2], normalized[3]];
}

function rotateVectorByQuaternion(
  vector: [number, number, number],
  rotation: QuatTuple
): [number, number, number] {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const tx = 2 * (y * vector[2] - z * vector[1]);
  const ty = 2 * (z * vector[0] - x * vector[2]);
  const tz = 2 * (x * vector[1] - y * vector[0]);
  return [
    vector[0] + w * tx + (y * tz - z * ty),
    vector[1] + w * ty + (z * tx - x * tz),
    vector[2] + w * tz + (x * ty - y * tx)
  ];
}

function quaternionToRotation3(
  rotation: QuatTuple
): [number, number, number, number, number, number, number, number, number] {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    1 - (yy + zz),
    xy + wz,
    xz - wy,
    xy - wz,
    1 - (xx + zz),
    yz + wx,
    xz + wy,
    yz - wx,
    1 - (xx + yy)
  ];
}

function decomposeEulerXyz(
  matrix: [number, number, number, number, number, number, number, number, number],
  before: [number, number, number]
): [number, number, number] {
  let result: [number, number, number];
  const sy = -matrix[2];
  if (1 - Math.abs(sy) < 1e-6) {
    const y = Math.asin(sy);
    const sx = Math.sin(before[0]);
    const sz = Math.sin(before[2]);
    if (Math.abs(sx) < Math.abs(sz)) {
      const cx = Math.cos(before[0]);
      result = cx > 0 ? [0, y, Math.asin(-matrix[3])] : [Math.PI, y, Math.asin(matrix[3])];
    } else {
      const cz = Math.cos(before[2]);
      result = cz > 0 ? [Math.asin(-matrix[7]), y, 0] : [Math.asin(matrix[7]), y, Math.PI];
    }
  } else {
    result = [
      Math.atan2(matrix[5], matrix[8]),
      Math.asin(-matrix[2]),
      Math.atan2(matrix[1], matrix[0])
    ];
  }
  const pi = Math.PI;
  const tests: Array<[number, number, number]> = [
    [result[0] + pi, pi - result[1], result[2] + pi],
    [result[0] + pi, pi - result[1], result[2] - pi],
    [result[0] + pi, -pi - result[1], result[2] + pi],
    [result[0] + pi, -pi - result[1], result[2] - pi],
    [result[0] - pi, pi - result[1], result[2] + pi],
    [result[0] - pi, pi - result[1], result[2] - pi],
    [result[0] - pi, -pi - result[1], result[2] + pi],
    [result[0] - pi, -pi - result[1], result[2] - pi]
  ];
  let minError =
    Math.abs(diffAngle(result[0], before[0])) +
    Math.abs(diffAngle(result[1], before[1])) +
    Math.abs(diffAngle(result[2], before[2]));
  for (const test of tests) {
    const error =
      Math.abs(diffAngle(test[0], before[0])) +
      Math.abs(diffAngle(test[1], before[1])) +
      Math.abs(diffAngle(test[2], before[2]));
    if (error < minError) {
      minError = error;
      result = test;
    }
  }
  return result;
}

function diffAngle(a: number, b: number): number {
  const diff = normalizeAngle(a) - normalizeAngle(b);
  if (diff > Math.PI) {
    return diff - Math.PI * 2;
  }
  if (diff < -Math.PI) {
    return diff + Math.PI * 2;
  }
  return diff;
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result >= Math.PI * 2) {
    result -= Math.PI * 2;
  }
  while (result < 0) {
    result += Math.PI * 2;
  }
  return result;
}

function eulerXyzToQuaternion(euler: [number, number, number]): [number, number, number, number] {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return normalizeQuaternion([
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ]);
}
