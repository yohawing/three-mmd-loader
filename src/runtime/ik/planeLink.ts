import {
  type MutableVec3Tuple,
  applyEffectiveRotation,
  axisAngleQuaternionInto,
  clamp,
  dotVectors,
  invertQuaternionInto,
  multiplyQuaternionsInto,
  normalizeVectorInto,
  rotateVectorByQuaternionInto,
  subtractVectorsInto
} from "./math.js";
import type { CcdIkBone, CcdIkLink, MutableQuatTuple } from "./CcdIkSolver.js";
import type { IkChainState } from "./chainSolve.js";
import type { LinkLimits } from "./linkLimits.js";
import {
  composeWorldMatrices,
  matrixTranslationInto,
  transformDirectionByInverseMatrixInto
} from "./worldMatrices.js";

function axisTupleInto(axisIndex: number, target: MutableVec3Tuple): MutableVec3Tuple {
  target[0] = axisIndex === 0 ? 1 : 0;
  target[1] = axisIndex === 1 ? 1 : 0;
  target[2] = axisIndex === 2 ? 1 : 0;
  return target;
}

export function solvePlaneLink({
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
  axisIndex,
  composeLocalMatrix,
  composeStates,
  vectorScratch,
  quaternionScratch
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
  readonly composeLocalMatrix: Float32Array;
  readonly composeStates: Uint8Array;
  readonly vectorScratch: [number, number, number][];
  readonly quaternionScratch: MutableQuatTuple[];
}): void {
  const rotateAxis = axisTupleInto(axisIndex, vectorScratch[5]);
  const ikPosition = matrixTranslationInto(matrices, ikBoneIndex, vectorScratch[6]);
  const targetPosition = matrixTranslationInto(matrices, ikTargetIndex, vectorScratch[7]);
  const linkPosition = matrixTranslationInto(matrices, link.boneIndex, vectorScratch[8]);
  const chainIkVector = normalizeVectorInto(
    transformDirectionByInverseMatrixInto(
      subtractVectorsInto(ikPosition, linkPosition, vectorScratch[9]),
      matrices,
      link.boneIndex,
      vectorScratch[9]
    ),
    vectorScratch[9]
  );
  const chainTargetVector = normalizeVectorInto(
    transformDirectionByInverseMatrixInto(
      subtractVectorsInto(targetPosition, linkPosition, vectorScratch[10]),
      matrices,
      link.boneIndex,
      vectorScratch[10]
    ),
    vectorScratch[10]
  );
  const localAxisBasis = link.localAxisBasis;
  const localAxisInverse = localAxisBasis
    ? invertQuaternionInto(localAxisBasis, quaternionScratch[1])
    : undefined;
  if (localAxisInverse) {
    rotateVectorByQuaternionInto(chainIkVector, localAxisInverse, chainIkVector);
    rotateVectorByQuaternionInto(chainTargetVector, localAxisInverse, chainTargetVector);
  }
  const dot = clamp(dotVectors(chainTargetVector, chainIkVector), -1, 1);
  const rawAngle = Math.acos(dot);
  const angle = Math.min(rawAngle, limitAngle);
  const targetVec1 = rotateVectorByQuaternionInto(
    chainTargetVector,
    axisAngleQuaternionInto(rotateAxis, angle, quaternionScratch[0]),
    vectorScratch[3]
  );
  const targetVec2 = rotateVectorByQuaternionInto(
    chainTargetVector,
    axisAngleQuaternionInto(rotateAxis, -angle, quaternionScratch[0]),
    vectorScratch[4]
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
  const baseRotation = baseRotations[link.boneIndex];
  const localChainRotation = axisAngleQuaternionInto(rotateAxis, newAngle, quaternionScratch[2]);
  const chainRotation =
    localAxisBasis && localAxisInverse
      ? multiplyQuaternionsInto(
          multiplyQuaternionsInto(localAxisBasis, localChainRotation, quaternionScratch[0]),
          localAxisInverse,
          quaternionScratch[2]
        )
      : localChainRotation;
  multiplyQuaternionsInto(
    chainRotation,
    invertQuaternionInto(baseRotation, quaternionScratch[3]),
    ikRotations[link.boneIndex]
  );
  applyEffectiveRotation(rotations, baseRotations, ikRotations, link.boneIndex);
  composeWorldMatrices(
    bones,
    translations,
    rotations,
    matrices,
    composeLocalMatrix,
    composeStates
  );
}
