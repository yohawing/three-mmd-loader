import { type IkChainState, solveChain } from "./chainSolve.js";
import {
  type MutableVec3Tuple,
  type Rotation3Tuple,
  subtractVectors,
  vectorLength
} from "./math.js";
import type { LinkLimits } from "./linkLimits.js";
import { composeWorldMatrices, matrixElementCount, matrixTranslation } from "./worldMatrices.js";
import {
  assertFiniteBoneTranslations,
  validateChain,
  validatePose,
  validateSkeleton
} from "./validation.js";

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

const maxIkLoopCount = 256;

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
