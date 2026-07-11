export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];
export type MutableQuatTuple = [number, number, number, number];
type MutableVec3Tuple = [number, number, number];
type Rotation3Tuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export interface CcdIkBone {
  readonly parentIndex: number;
  readonly translation: Vec3Tuple;
}

export interface CcdIkLink {
  readonly boneIndex: number;
  readonly enabled?: boolean;
  readonly fixedAxis?: Vec3Tuple;
  /**
   * PMX local-axis frame used to interpret {@link angleLimit}. The quaternion
   * maps the solver's unit XYZ frame onto the bone's PMX local axes.
   */
  readonly localAxisBasis?: QuatTuple;
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

const PREPARED_CHAIN_BRAND: unique symbol = Symbol("PreparedCcdIkChain");

export type CcdIkPreparedChain = CcdIkChain & {
  readonly [PREPARED_CHAIN_BRAND]: true;
};

export interface CcdIkPreparedSolveInput {
  readonly bones: readonly CcdIkBone[];
  readonly pose: CcdIkPose;
  readonly chains: readonly CcdIkPreparedChain[];
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
const defaultIkTolerance = 1e-4;
const matrixElementCount = 16;

export class CcdIkSolver {
  private readonly scratchComposeLocalMatrix = new Float32Array(matrixElementCount);
  private scratchComposeStates = new Uint8Array(0);
  private readonly scratchTranslations: [number, number, number][] = [];
  private scratchMatrices = new Float32Array(0);
  private readonly scratchBaseRotations: [number, number, number, number][] = [];
  private readonly scratchIkRotations: [number, number, number, number][] = [];
  private readonly scratchBestRotations: [number, number, number, number][] = [];
  private readonly scratchChainState: IkChainState[] = [];
  private readonly scratchIkVectors: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  private readonly scratchLinkLimits: LinkLimits[] = [];
  private readonly scratchIkQuaternions: MutableQuatTuple[] = [
    [0, 0, 0, 1],
    [0, 0, 0, 1],
    [0, 0, 0, 1],
    [0, 0, 0, 1]
  ];
  private readonly scratchIkEulerVectors: MutableVec3Tuple[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  private readonly scratchRotation3: Rotation3Tuple = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  prepareChain(chain: CcdIkChain, bones: readonly CcdIkBone[]): CcdIkPreparedChain {
    validateSkeleton(bones);
    validateChain(chain, bones);
    this.ensureSolveScratchCapacity(bones.length, chain.links.length);
    return brandPreparedChain(chain);
  }

  prepareChains(
    chains: readonly CcdIkChain[],
    bones: readonly CcdIkBone[]
  ): CcdIkPreparedChain[] {
    validateSkeleton(bones);
    let maxLinkCount = 0;
    const preparedChains = chains.map((chain) => {
      validateChain(chain, bones);
      if (chain.links.length > maxLinkCount) {
        maxLinkCount = chain.links.length;
      }
      return brandPreparedChain(chain);
    });
    this.ensureSolveScratchCapacity(bones.length, maxLinkCount);
    return preparedChains;
  }

  solve(input: CcdIkSolveInput): CcdIkSolveResult {
    return this.solvePrepared({
      bones: input.bones,
      pose: input.pose,
      chains: this.prepareChains(input.chains, input.bones)
    });
  }

  solvePrepared(input: CcdIkPreparedSolveInput): CcdIkSolveResult {
    const finalDistances: number[] = [];
    const totalIterations = this.runPrepared(input, finalDistances);

    return {
      chainCount: input.chains.length,
      iterationCount: totalIterations,
      finalDistances
    };
  }

  applyPrepared(input: CcdIkPreparedSolveInput): void {
    this.runPrepared(input);
  }

  private runPrepared(input: CcdIkPreparedSolveInput, finalDistances?: number[]): number {
    for (const chain of input.chains) {
      assertPreparedChain(chain);
    }
    validatePose(input.pose, input.bones.length);
    assertFiniteBoneTranslations(input.bones);
    let maxLinkCount = 0;
    for (const chain of input.chains) {
      if (chain.links.length > maxLinkCount) {
        maxLinkCount = chain.links.length;
      }
    }
    this.ensureSolveScratchCapacity(input.bones.length, maxLinkCount);
    const translations = this.scratchTranslations;
    copyBoneTranslationsInto(input.bones, translations);
    const matrices = this.scratchMatrices;
    const composeStates = this.ensureComposeStatesCapacity(input.bones.length);
    let totalIterations = 0;

    composeWorldMatrices(
      input.bones,
      translations,
      input.pose.rotations,
      matrices,
      this.scratchComposeLocalMatrix,
      composeStates
    );
    for (const chain of input.chains) {
      const iterationCount = Math.min(
        Math.max(Math.trunc(chain.iterationCount), 0),
        maxIkLoopCount
      );
      totalIterations +=
        solveChain(
          input.bones,
          translations,
          input.pose.rotations,
          matrices,
          chain,
          iterationCount,
          this.scratchComposeLocalMatrix,
          composeStates,
          this.scratchBaseRotations,
          this.scratchIkRotations,
          this.scratchBestRotations,
          this.scratchChainState,
          this.scratchIkVectors,
          this.scratchLinkLimits,
          this.scratchIkQuaternions,
          this.scratchIkEulerVectors,
          this.scratchRotation3
        );
      if (finalDistances) {
        finalDistances.push(
          vectorLength(
            subtractVectors(
              matrixTranslation(matrices, chain.effectorBoneIndex),
              matrixTranslation(matrices, chain.goalBoneIndex)
            )
          )
        );
      }
    }

    return totalIterations;
  }

  private ensureComposeStatesCapacity(boneCount: number): Uint8Array {
    if (this.scratchComposeStates.length < boneCount) {
      this.scratchComposeStates = new Uint8Array(boneCount);
    }
    return this.scratchComposeStates;
  }

  private ensureSolveScratchCapacity(boneCount: number, linkCount: number): void {
    ensureTranslationScratchLength(this.scratchTranslations, boneCount);
    ensureQuaternionScratchLength(this.scratchBaseRotations, boneCount);
    ensureQuaternionScratchLength(this.scratchIkRotations, boneCount);
    ensureQuaternionScratchLength(this.scratchBestRotations, linkCount);
    ensureChainStateScratchLength(this.scratchChainState, linkCount);
    ensureLinkLimitsScratchLength(this.scratchLinkLimits, linkCount);
    this.ensureComposeStatesCapacity(boneCount);
    const matrixLength = boneCount * matrixElementCount;
    if (this.scratchMatrices.length < matrixLength) {
      this.scratchMatrices = new Float32Array(matrixLength);
    }
  }
}

function brandPreparedChain(chain: CcdIkChain): CcdIkPreparedChain {
  Object.defineProperty(chain, PREPARED_CHAIN_BRAND, {
    value: true,
    enumerable: false,
    configurable: false
  });
  return chain as CcdIkPreparedChain;
}

function assertPreparedChain(chain: CcdIkPreparedChain): void {
  if (chain[PREPARED_CHAIN_BRAND] !== true) {
    throw new TypeError("CCD IK chain must be prepared with prepareChain or prepareChains");
  }
}

function ensureTranslationScratchLength(
  scratch: [number, number, number][],
  length: number
): void {
  for (let index = scratch.length; index < length; index += 1) {
    scratch.push([0, 0, 0]);
  }
  scratch.length = length;
}

function ensureQuaternionScratchLength(
  scratch: [number, number, number, number][],
  length: number
): void {
  for (let index = scratch.length; index < length; index += 1) {
    scratch.push([0, 0, 0, 1]);
  }
  scratch.length = length;
}

function ensureChainStateScratchLength(scratch: IkChainState[], length: number): void {
  for (let index = scratch.length; index < length; index += 1) {
    scratch.push({
      previousAngle: [0, 0, 0],
      planeModeAngle: 0
    });
  }
  scratch.length = length;
}

function ensureLinkLimitsScratchLength(scratch: LinkLimits[], length: number): void {
  for (let index = scratch.length; index < length; index += 1) {
    scratch.push({
      lower: [0, 0, 0],
      upper: [0, 0, 0]
    });
  }
  scratch.length = length;
}

function copyBoneTranslationsInto(
  bones: readonly CcdIkBone[],
  target: [number, number, number][]
): void {
  for (let index = 0; index < bones.length; index += 1) {
    const source = bones[index]?.translation;
    const translation = target[index];
    if (!source) {
      translation[0] = 0;
      translation[1] = 0;
      translation[2] = 0;
      continue;
    }
    translation[0] = source[0];
    translation[1] = source[1];
    translation[2] = source[2];
  }
}

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

function copyQuaternionInto(
  source: readonly [number, number, number, number],
  target: [number, number, number, number]
): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  target[3] = source[3];
}

function solveChain(
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

function axisTupleInto(axisIndex: number, target: MutableVec3Tuple): MutableVec3Tuple {
  target[0] = axisIndex === 0 ? 1 : 0;
  target[1] = axisIndex === 1 ? 1 : 0;
  target[2] = axisIndex === 2 ? 1 : 0;
  return target;
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

function validateSkeleton(bones: readonly CcdIkBone[]): void {
  for (const [index, bone] of bones.entries()) {
    if (!Number.isInteger(bone.parentIndex) || bone.parentIndex < -1) {
      throw new RangeError("CCD IK bone parentIndex must be -1 or a valid bone index");
    }
    if (bone.parentIndex === index) {
      throw new RangeError("CCD IK bone cannot parent itself");
    }
    if (bone.parentIndex >= bones.length) {
      throw new RangeError("CCD IK bone parentIndex is out of range");
    }
  }
  for (let index = 0; index < bones.length; index += 1) {
    assertAcyclicParentChain(bones, index);
  }
}

function validatePose(pose: CcdIkPose, boneCount: number): void {
  if (pose.rotations.length !== boneCount) {
    throw new RangeError("CCD IK pose rotation count must match bone count");
  }
  for (const rotation of pose.rotations) {
    assertFiniteQuaternion(rotation, "pose rotation");
  }
}

function assertFiniteBoneTranslations(bones: readonly CcdIkBone[]): void {
  for (const bone of bones) {
    assertFiniteVector(bone.translation, "bone translation");
  }
}

function validateChain(chain: CcdIkChain, bones: readonly CcdIkBone[]): void {
  assertBoneIndex(bones, chain.goalBoneIndex, "goalBoneIndex");
  assertBoneIndex(bones, chain.effectorBoneIndex, "effectorBoneIndex");
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
    assertBoneIndex(bones, link.boneIndex, "link boneIndex");
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
    if (link.fixedAxis !== undefined) {
      assertFiniteVector(link.fixedAxis, "link fixedAxis");
    }
    if (link.localAxisBasis !== undefined) {
      assertFiniteQuaternion(link.localAxisBasis, "link localAxisBasis");
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
  matrices: Float32Array,
  local: Float32Array,
  states: Uint8Array
): void {
  if (isParentBeforeChildOrdered(bones)) {
    for (let index = 0; index < bones.length; index += 1) {
      composeWorldMatrixInOrder(index, bones, translations, rotations, matrices, local);
    }
    return;
  }
  states.fill(0, 0, bones.length);
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
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1;
  const x = rotation[0] / length;
  const y = rotation[1] / length;
  const z = rotation[2] / length;
  const w = rotation[3] / length;
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
  return matrixTranslationInto(matrices, index, [0, 0, 0]);
}

function matrixTranslationInto(
  matrices: Float32Array,
  index: number,
  target: [number, number, number]
): [number, number, number] {
  const offset = index * 16;
  target[0] = matrices[offset + 12] ?? 0;
  target[1] = matrices[offset + 13] ?? 0;
  target[2] = matrices[offset + 14] ?? 0;
  return target;
}

function transformDirectionByInverseMatrixInto(
  vector: [number, number, number],
  matrices: Float32Array,
  boneIndex: number,
  target: [number, number, number]
): [number, number, number] {
  const offset = boneIndex * 16;
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  target[0] =
    x * (matrices[offset] ?? 0) +
    y * (matrices[offset + 1] ?? 0) +
    z * (matrices[offset + 2] ?? 0);
  target[1] =
    x * (matrices[offset + 4] ?? 0) +
    y * (matrices[offset + 5] ?? 0) +
    z * (matrices[offset + 6] ?? 0);
  target[2] =
    x * (matrices[offset + 8] ?? 0) +
    y * (matrices[offset + 9] ?? 0) +
    z * (matrices[offset + 10] ?? 0);
  return target;
}

function applyEffectiveRotation(
  rotations: MutableQuatTuple[],
  baseRotations: readonly [number, number, number, number][],
  ikRotations: readonly [number, number, number, number][],
  boneIndex: number
): void {
  multiplyQuaternionsInto(ikRotations[boneIndex], baseRotations[boneIndex], rotations[boneIndex]);
}

function toLinkLimitsInto(
  limit: CcdIkLink["angleLimit"],
  target: LinkLimits
): LinkLimits | undefined {
  if (!limit) {
    target.lower[0] = 0;
    target.lower[1] = 0;
    target.lower[2] = 0;
    target.upper[0] = 0;
    target.upper[1] = 0;
    target.upper[2] = 0;
    return undefined;
  }
  target.lower[0] = limit.minimumAngle[0];
  target.lower[1] = limit.minimumAngle[1];
  target.lower[2] = limit.minimumAngle[2];
  target.upper[0] = limit.maximumAngle[0];
  target.upper[1] = limit.maximumAngle[1];
  target.upper[2] = limit.maximumAngle[2];
  return target;
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
  return limits.lower[axis] === 0 && limits.upper[axis] === 0;
}

function clampLimitedRotationInto(
  rotation: [number, number, number, number],
  limits: LinkLimits,
  state: IkChainState,
  limitAngle: number,
  localAxisBasis: QuatTuple | undefined,
  rotation3Scratch: Rotation3Tuple,
  eulerScratch: MutableVec3Tuple[],
  quaternionScratch: MutableQuatTuple[],
  target: MutableQuatTuple
): [number, number, number, number] {
  const localAxisInverse = localAxisBasis
    ? invertQuaternionInto(localAxisBasis, quaternionScratch[0])
    : undefined;
  const localRotation =
    localAxisBasis && localAxisInverse
      ? multiplyQuaternionsInto(
          multiplyQuaternionsInto(localAxisInverse, rotation, quaternionScratch[1]),
          localAxisBasis,
          quaternionScratch[1]
        )
      : rotation;
  const euler = decomposeEulerXyzInto(
    quaternionToRotation3Into(localRotation, rotation3Scratch),
    state.previousAngle,
    eulerScratch[0],
    eulerScratch[1]
  );
  const clampedEuler = eulerScratch[1];
  clampedEuler[0] = clamp(euler[0], limits.lower[0], limits.upper[0]);
  clampedEuler[1] = clamp(euler[1], limits.lower[1], limits.upper[1]);
  clampedEuler[2] = clamp(euler[2], limits.lower[2], limits.upper[2]);
  const limitedStep = eulerScratch[2];
  limitedStep[0] =
    clamp(clampedEuler[0] - state.previousAngle[0], -limitAngle, limitAngle) +
    state.previousAngle[0];
  limitedStep[1] =
    clamp(clampedEuler[1] - state.previousAngle[1], -limitAngle, limitAngle) +
    state.previousAngle[1];
  limitedStep[2] =
    clamp(clampedEuler[2] - state.previousAngle[2], -limitAngle, limitAngle) +
    state.previousAngle[2];
  state.previousAngle[0] = limitedStep[0];
  state.previousAngle[1] = limitedStep[1];
  state.previousAngle[2] = limitedStep[2];
  const localClampedRotation = eulerXyzToQuaternionInto(limitedStep, target);
  return localAxisBasis && localAxisInverse
    ? multiplyQuaternionsInto(
        multiplyQuaternionsInto(localAxisBasis, localClampedRotation, quaternionScratch[1]),
        localAxisInverse,
        target
      )
    : localClampedRotation;
}

function projectQuaternionOntoAxisInto(
  rotation: QuatTuple,
  axis: Vec3Tuple,
  target: MutableQuatTuple
): MutableQuatTuple {
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  if (!Number.isFinite(axisLength) || axisLength < 1e-12) {
    copyQuaternionInto(rotation, target);
    return target;
  }
  const axisX = axis[0] / axisLength;
  const axisY = axis[1] / axisLength;
  const axisZ = axis[2] / axisLength;
  const projection = rotation[0] * axisX + rotation[1] * axisY + rotation[2] * axisZ;
  target[0] = axisX * projection;
  target[1] = axisY * projection;
  target[2] = axisZ * projection;
  target[3] = rotation[3];
  return normalizeQuaternionInto(target, target);
}

function usableFixedAxis(axis: Vec3Tuple | undefined): Vec3Tuple | undefined {
  if (!axis || !axis.every(Number.isFinite) || Math.hypot(axis[0], axis[1], axis[2]) < 1e-12) {
    return undefined;
  }
  return axis;
}

function rotationIsWithinLimits(
  ikRotation: QuatTuple,
  baseRotation: QuatTuple,
  limits: LinkLimits,
  localAxisBasis: QuatTuple | undefined,
  rotation3Scratch: Rotation3Tuple,
  eulerScratch: MutableVec3Tuple[],
  quaternionScratch: MutableQuatTuple[]
): boolean {
  const chainRotation = multiplyQuaternionsInto(ikRotation, baseRotation, quaternionScratch[0]);
  const localAxisInverse = localAxisBasis
    ? invertQuaternionInto(localAxisBasis, quaternionScratch[1])
    : undefined;
  const localRotation =
    localAxisBasis && localAxisInverse
      ? multiplyQuaternionsInto(
          multiplyQuaternionsInto(localAxisInverse, chainRotation, quaternionScratch[2]),
          localAxisBasis,
          quaternionScratch[2]
        )
      : chainRotation;
  const preferredEuler = eulerScratch[0];
  preferredEuler[0] = 0;
  preferredEuler[1] = 0;
  preferredEuler[2] = 0;
  const euler = decomposeEulerXyzInto(
    quaternionToRotation3Into(localRotation, rotation3Scratch),
    preferredEuler,
    eulerScratch[1],
    eulerScratch[2]
  );
  return (
    euler[0] >= limits.lower[0] - 1e-5 &&
    euler[0] <= limits.upper[0] + 1e-5 &&
    euler[1] >= limits.lower[1] - 1e-5 &&
    euler[1] <= limits.upper[1] + 1e-5 &&
    euler[2] >= limits.lower[2] - 1e-5 &&
    euler[2] <= limits.upper[2] + 1e-5
  );
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
  return subtractVectorsInto(left, right, [0, 0, 0]);
}

function subtractVectorsInto(
  left: [number, number, number],
  right: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  target[0] = left[0] - right[0];
  target[1] = left[1] - right[1];
  target[2] = left[2] - right[2];
  return target;
}

function crossVectorsInto(
  left: [number, number, number],
  right: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  const leftX = left[0];
  const leftY = left[1];
  const leftZ = left[2];
  const rightX = right[0];
  const rightY = right[1];
  const rightZ = right[2];
  target[0] = leftY * rightZ - leftZ * rightY;
  target[1] = leftZ * rightX - leftX * rightZ;
  target[2] = leftX * rightY - leftY * rightX;
  return target;
}

function dotVectors(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeVectorInto(
  value: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  const x = value[0];
  const y = value[1];
  const z = value[2];
  const length = vectorLength(value);
  if (length < 1e-8) {
    target[0] = 0;
    target[1] = 0;
    target[2] = 0;
    return target;
  }
  target[0] = x / length;
  target[1] = y / length;
  target[2] = z / length;
  return target;
}

function signedProjectedAngleInto(
  from: [number, number, number],
  to: [number, number, number],
  axisValue: Vec3Tuple,
  axis: MutableVec3Tuple,
  projectedFrom: MutableVec3Tuple,
  projectedTo: MutableVec3Tuple,
  rotated: MutableVec3Tuple,
  quaternionScratch: MutableQuatTuple
): number {
  axis[0] = axisValue[0];
  axis[1] = axisValue[1];
  axis[2] = axisValue[2];
  normalizeVectorInto(axis, axis);
  normalizeVectorInto(projectVectorOnPlaneInto(from, axis, projectedFrom), projectedFrom);
  normalizeVectorInto(projectVectorOnPlaneInto(to, axis, projectedTo), projectedTo);
  if (vectorLength(projectedFrom) < 1e-5 || vectorLength(projectedTo) < 1e-5) {
    return 0;
  }
  const angle = Math.acos(clamp(dotVectors(projectedFrom, projectedTo), -1, 1));
  const positiveDot = dotVectors(
    rotateVectorByQuaternionInto(
      projectedFrom,
      axisAngleQuaternionInto(axis, angle, quaternionScratch),
      rotated
    ),
    projectedTo
  );
  const negativeDot = dotVectors(
    rotateVectorByQuaternionInto(
      projectedFrom,
      axisAngleQuaternionInto(axis, -angle, quaternionScratch),
      rotated
    ),
    projectedTo
  );
  return positiveDot >= negativeDot ? angle : -angle;
}

function projectVectorOnPlaneInto(
  vector: [number, number, number],
  normal: [number, number, number],
  target: MutableVec3Tuple
): MutableVec3Tuple {
  const scale = dotVectors(vector, normal);
  target[0] = vector[0] - normal[0] * scale;
  target[1] = vector[1] - normal[1] * scale;
  target[2] = vector[2] - normal[2] * scale;
  return target;
}

function stablePerpendicularAxisInto(
  vector: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  const basisX = Math.abs(vector[0]) < 0.9 ? 1 : 0;
  const basisY = basisX === 1 ? 0 : 1;
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  target[0] = -z * basisY;
  target[1] = z * basisX;
  target[2] = x * basisY - y * basisX;
  return normalizeVectorInto(target, target);
}

function vectorLength(value: [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function axisAngleQuaternionInto(
  axis: [number, number, number],
  angle: number,
  target: MutableQuatTuple
): MutableQuatTuple {
  const half = angle / 2;
  const scale = Math.sin(half);
  target[0] = axis[0] * scale;
  target[1] = axis[1] * scale;
  target[2] = axis[2] * scale;
  target[3] = Math.cos(half);
  return normalizeQuaternionInto(target, target);
}

function multiplyQuaternionsInto(
  left: QuatTuple,
  right: QuatTuple,
  target: MutableQuatTuple
): MutableQuatTuple {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  target[0] = aw * bx + ax * bw + ay * bz - az * by;
  target[1] = aw * by - ax * bz + ay * bw + az * bx;
  target[2] = aw * bz + ax * by - ay * bx + az * bw;
  target[3] = aw * bw - ax * bx - ay * by - az * bz;
  return normalizeQuaternionInto(target, target);
}

function normalizeQuaternionInto(value: QuatTuple, target: MutableQuatTuple): MutableQuatTuple {
  const length = Math.hypot(value[0], value[1], value[2], value[3]) || 1;
  target[0] = value[0] / length;
  target[1] = value[1] / length;
  target[2] = value[2] / length;
  target[3] = value[3] / length;
  return target;
}

function invertQuaternionInto(value: QuatTuple, target: MutableQuatTuple): MutableQuatTuple {
  normalizeQuaternionInto(value, target);
  target[0] *= -1;
  target[1] *= -1;
  target[2] *= -1;
  return target;
}

function rotateVectorByQuaternionInto(
  vector: [number, number, number],
  rotation: QuatTuple,
  target: MutableVec3Tuple
): MutableVec3Tuple {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1;
  const x = rotation[0] / length;
  const y = rotation[1] / length;
  const z = rotation[2] / length;
  const w = rotation[3] / length;
  const vectorX = vector[0];
  const vectorY = vector[1];
  const vectorZ = vector[2];
  const tx = 2 * (y * vectorZ - z * vectorY);
  const ty = 2 * (z * vectorX - x * vectorZ);
  const tz = 2 * (x * vectorY - y * vectorX);
  target[0] = vectorX + w * tx + (y * tz - z * ty);
  target[1] = vectorY + w * ty + (z * tx - x * tz);
  target[2] = vectorZ + w * tz + (x * ty - y * tx);
  return target;
}

function quaternionToRotation3Into(rotation: QuatTuple, target: Rotation3Tuple): Rotation3Tuple {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1;
  const x = rotation[0] / length;
  const y = rotation[1] / length;
  const z = rotation[2] / length;
  const w = rotation[3] / length;
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
  target[3] = xy - wz;
  target[4] = 1 - (xx + zz);
  target[5] = yz + wx;
  target[6] = xz + wy;
  target[7] = yz - wx;
  target[8] = 1 - (xx + yy);
  return target;
}

function decomposeEulerXyzInto(
  matrix: Rotation3Tuple,
  before: [number, number, number],
  target: MutableVec3Tuple,
  candidate: MutableVec3Tuple
): MutableVec3Tuple {
  const sy = -matrix[2];
  if (1 - Math.abs(sy) < 1e-6) {
    const y = Math.asin(sy);
    const sx = Math.sin(before[0]);
    const sz = Math.sin(before[2]);
    if (Math.abs(sx) < Math.abs(sz)) {
      const cx = Math.cos(before[0]);
      target[0] = cx > 0 ? 0 : Math.PI;
      target[1] = y;
      target[2] = cx > 0 ? Math.asin(-matrix[3]) : Math.asin(matrix[3]);
    } else {
      const cz = Math.cos(before[2]);
      target[0] = cz > 0 ? Math.asin(-matrix[7]) : Math.asin(matrix[7]);
      target[1] = y;
      target[2] = cz > 0 ? 0 : Math.PI;
    }
  } else {
    target[0] = Math.atan2(matrix[5], matrix[8]);
    target[1] = Math.asin(-matrix[2]);
    target[2] = Math.atan2(matrix[1], matrix[0]);
  }
  const pi = Math.PI;
  let minError =
    Math.abs(diffAngle(target[0], before[0])) +
    Math.abs(diffAngle(target[1], before[1])) +
    Math.abs(diffAngle(target[2], before[2]));
  const baseX = target[0];
  const baseY = target[1];
  const baseZ = target[2];
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, pi - baseY, baseZ + pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, pi - baseY, baseZ - pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, -pi - baseY, baseZ + pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, -pi - baseY, baseZ - pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX - pi, pi - baseY, baseZ + pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX - pi, pi - baseY, baseZ - pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX - pi, -pi - baseY, baseZ + pi);
  chooseEulerCandidate(target, before, candidate, minError, baseX - pi, -pi - baseY, baseZ - pi);
  return target;
}

function chooseEulerCandidate(
  target: MutableVec3Tuple,
  before: [number, number, number],
  candidate: MutableVec3Tuple,
  minError: number,
  x: number,
  y: number,
  z: number
): number {
  candidate[0] = x;
  candidate[1] = y;
  candidate[2] = z;
  const error =
    Math.abs(diffAngle(candidate[0], before[0])) +
    Math.abs(diffAngle(candidate[1], before[1])) +
    Math.abs(diffAngle(candidate[2], before[2]));
  if (error >= minError) {
    return minError;
  }
  target[0] = candidate[0];
  target[1] = candidate[1];
  target[2] = candidate[2];
  return error;
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

function eulerXyzToQuaternionInto(
  euler: [number, number, number],
  target: MutableQuatTuple
): MutableQuatTuple {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  target[0] = s1 * c2 * c3 + c1 * s2 * s3;
  target[1] = c1 * s2 * c3 - s1 * c2 * s3;
  target[2] = c1 * c2 * s3 + s1 * s2 * c3;
  target[3] = c1 * c2 * c3 - s1 * s2 * s3;
  return normalizeQuaternionInto(target, target);
}
