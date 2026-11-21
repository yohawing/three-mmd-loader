import type { CcdIkBone, CcdIkChain, MutableQuatTuple, QuatTuple } from "./CcdIkSolver.js";
import {
  type MutableVec3Tuple,
  type Rotation3Tuple,
  applyEffectiveRotation,
  axisAngleQuaternionInto,
  clamp,
  copyQuaternionInto,
  crossVectorsInto,
  dotVectors,
  invertQuaternionInto,
  multiplyQuaternionsInto,
  normalizeVectorInto,
  signedProjectedAngleInto,
  stablePerpendicularAxisInto,
  subtractVectorsInto,
  vectorLength
} from "./math.js";
import {
  type LinkLimits,
  clampLimitedRotationInto,
  getSingleAxisLimit,
  projectQuaternionOntoAxisInto,
  rotationIsWithinLimits,
  toLinkLimitsInto,
  usableFixedAxis
} from "./linkLimits.js";
import { solvePlaneLink } from "./planeLink.js";
import {
  composeWorldMatrices,
  matrixTranslationInto,
  transformDirectionByInverseMatrixInto
} from "./worldMatrices.js";

export interface IkChainState {
  previousAngle: [number, number, number];
  planeModeAngle: number;
}

const defaultIkTolerance = 1e-4;

function copyRotationsInto(
  rotations: readonly QuatTuple[],
  target: [number, number, number, number][]
): void {
  for (let index = 0; index < rotations.length; index += 1) {
    const source = rotations[index];
    const rotation = target[index];
    if (!source) {
      rotation[0] = 0;
      rotation[1] = 0;
      rotation[2] = 0;
      rotation[3] = 1;
      continue;
    }
    copyQuaternionInto(source, rotation);
  }
}

function resetIkRotations(
  rotations: [number, number, number, number][],
  length: number
): void {
  for (let index = 0; index < length; index += 1) {
    const rotation = rotations[index];
    rotation[0] = 0;
    rotation[1] = 0;
    rotation[2] = 0;
    rotation[3] = 1;
  }
}

function resetChainStateScratch(chainState: IkChainState[], length: number): void {
  for (let index = 0; index < length; index += 1) {
    const state = chainState[index];
    state.previousAngle[0] = 0;
    state.previousAngle[1] = 0;
    state.previousAngle[2] = 0;
    state.planeModeAngle = 0;
  }
}

export function solveChain(
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: MutableQuatTuple[],
  matrices: Float32Array,
  chain: CcdIkChain,
  iterationCount: number,
  composeLocalMatrix: Float32Array,
  composeStates: Uint8Array,
  baseRotations: [number, number, number, number][],
  ikRotations: [number, number, number, number][],
  bestRotations: [number, number, number, number][],
  chainState: IkChainState[],
  vectorScratch: [number, number, number][],
  linkLimitsScratch: LinkLimits[],
  quaternionScratch: MutableQuatTuple[],
  eulerScratch: MutableVec3Tuple[],
  rotation3Scratch: Rotation3Tuple
): number {
  resetChainStateScratch(chainState, chain.links.length);
  copyRotationsInto(rotations, baseRotations);
  resetIkRotations(ikRotations, rotations.length);
  for (let linkIndex = 0; linkIndex < chain.links.length; linkIndex += 1) {
    const link = chain.links[linkIndex];
    const boneIndex = link.boneIndex;
    const bestRotation = bestRotations[linkIndex];
    const ikRotation = ikRotations[boneIndex];
    bestRotation[0] = ikRotation[0];
    bestRotation[1] = ikRotation[1];
    bestRotation[2] = ikRotation[2];
    bestRotation[3] = ikRotation[3];
  }
  const limitAngle = maxAnglePerIteration(chain);
  const tolerance = chain.tolerance ?? defaultIkTolerance;
  let bestDistance = Number.POSITIVE_INFINITY;
  let completedIterations = 0;

  for (let iteration = 0; iteration < iterationCount; iteration += 1) {
    const ikPosition = matrixTranslationInto(matrices, chain.goalBoneIndex, vectorScratch[0]);
    const targetPositionBeforeIteration = matrixTranslationInto(
      matrices,
      chain.effectorBoneIndex,
      vectorScratch[1]
    );
    if (
      vectorLength(
        subtractVectorsInto(targetPositionBeforeIteration, ikPosition, vectorScratch[2])
      ) <= tolerance
    ) {
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

      const limits = toLinkLimitsInto(link.angleLimit, linkLimitsScratch[linkIndex]);
      const singleAxis = getSingleAxisLimit(limits);
      const fixedAxis = usableFixedAxis(link.fixedAxis);
      if (limits && singleAxis !== null && !fixedAxis) {
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
          axisIndex: singleAxis,
          composeLocalMatrix,
          composeStates,
          vectorScratch,
          quaternionScratch
        });
        continue;
      }

      const targetPosition = matrixTranslationInto(
        matrices,
        chain.effectorBoneIndex,
        vectorScratch[1]
      );
      const linkPosition = matrixTranslationInto(matrices, link.boneIndex, vectorScratch[3]);
      const chainIkVector = normalizeVectorInto(
        transformDirectionByInverseMatrixInto(
          subtractVectorsInto(ikPosition, linkPosition, vectorScratch[4]),
          matrices,
          link.boneIndex,
          vectorScratch[4]
        ),
        vectorScratch[4]
      );
      const chainTargetVector = normalizeVectorInto(
        transformDirectionByInverseMatrixInto(
          subtractVectorsInto(targetPosition, linkPosition, vectorScratch[5]),
          matrices,
          link.boneIndex,
          vectorScratch[5]
        ),
        vectorScratch[5]
      );
      const dot = clamp(dotVectors(chainTargetVector, chainIkVector), -1, 1);
      let angle = fixedAxis
        ? signedProjectedAngleInto(
            chainTargetVector,
            chainIkVector,
            fixedAxis,
            vectorScratch[7],
            vectorScratch[8],
            vectorScratch[9],
            vectorScratch[10],
            quaternionScratch[0]
          )
        : Math.acos(dot);
      if (Math.abs(angle) < 1e-3 * (Math.PI / 180)) {
        continue;
      }
      angle = clamp(angle, -limitAngle, limitAngle);
      const axis = vectorScratch[6];
      if (fixedAxis) {
        axis[0] = fixedAxis[0];
        axis[1] = fixedAxis[1];
        axis[2] = fixedAxis[2];
        normalizeVectorInto(axis, axis);
      } else {
        normalizeVectorInto(crossVectorsInto(chainTargetVector, chainIkVector, axis), axis);
      }
      if (vectorLength(axis) < 1e-5) {
        if (dot > -1 + 1e-5) {
          continue;
        }
        stablePerpendicularAxisInto(chainTargetVector, axis);
      }

      const delta = axisAngleQuaternionInto(axis, angle, quaternionScratch[0]);
      const baseRotation = baseRotations[link.boneIndex];
      const ikRotation = ikRotations[link.boneIndex];
      const priorChainState = chainState[linkIndex];
      const priorEulerX = priorChainState.previousAngle[0];
      const priorEulerY = priorChainState.previousAngle[1];
      const priorEulerZ = priorChainState.previousAngle[2];
      const priorPlaneModeAngle = priorChainState.planeModeAngle;
      if (fixedAxis) {
        copyQuaternionInto(ikRotation, quaternionScratch[3]);
      }
      const chainRotation = multiplyQuaternionsInto(
        multiplyQuaternionsInto(ikRotation, baseRotation, quaternionScratch[1]),
        delta,
        quaternionScratch[2]
      );
      if (limits) {
        clampLimitedRotationInto(
          chainRotation,
          limits,
          chainState[linkIndex],
          limitAngle,
          link.localAxisBasis,
          rotation3Scratch,
          eulerScratch,
          quaternionScratch,
          chainRotation
        );
      }
      multiplyQuaternionsInto(
        chainRotation,
        invertQuaternionInto(baseRotation, quaternionScratch[1]),
        ikRotation
      );
      if (fixedAxis) {
        projectQuaternionOntoAxisInto(ikRotation, fixedAxis, ikRotation);
        if (
          limits &&
          !rotationIsWithinLimits(
            ikRotation,
            baseRotation,
            limits,
            link.localAxisBasis,
            rotation3Scratch,
            eulerScratch,
            quaternionScratch
          )
        ) {
          copyQuaternionInto(quaternionScratch[3], ikRotation);
          priorChainState.previousAngle[0] = priorEulerX;
          priorChainState.previousAngle[1] = priorEulerY;
          priorChainState.previousAngle[2] = priorEulerZ;
          priorChainState.planeModeAngle = priorPlaneModeAngle;
        }
      }
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

    completedIterations += 1;
    const currentTargetPosition = matrixTranslationInto(
      matrices,
      chain.effectorBoneIndex,
      vectorScratch[0]
    );
    const currentIkPosition = matrixTranslationInto(
      matrices,
      chain.goalBoneIndex,
      vectorScratch[1]
    );
    const currentDistance = vectorLength(
      subtractVectorsInto(currentTargetPosition, currentIkPosition, vectorScratch[2])
    );
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      for (let linkIndex = 0; linkIndex < chain.links.length; linkIndex += 1) {
        const boneIndex = chain.links[linkIndex]?.boneIndex ?? -1;
        if (boneIndex >= 0 && boneIndex < bones.length) {
          copyQuaternionInto(ikRotations[boneIndex], bestRotations[linkIndex]);
        }
      }
      if (currentDistance <= tolerance) {
        break;
      }
    } else {
      for (let linkIndex = 0; linkIndex < chain.links.length; linkIndex += 1) {
        const boneIndex = chain.links[linkIndex]?.boneIndex ?? -1;
        const bestIkRotation = bestRotations[linkIndex];
        if (boneIndex >= 0 && boneIndex < bones.length) {
          copyQuaternionInto(bestIkRotation, ikRotations[boneIndex]);
          applyEffectiveRotation(rotations, baseRotations, ikRotations, boneIndex);
        }
      }
      composeWorldMatrices(
        bones,
        translations,
        rotations,
        matrices,
        composeLocalMatrix,
        composeStates
      );
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
