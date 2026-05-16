import type {
  CcdIkBone,
  CcdIkChain,
  CcdIkLink,
  CcdIkLinkAngleLimit,
  CcdIkPose,
  CcdIkSolveInput,
  Vec3Tuple
} from "./CcdIkSolver.js";

export interface MmdIkRuntimeBone {
  readonly parentIndex: number;
  readonly translation: Vec3Tuple;
}

export interface MmdIkRuntimeLink {
  readonly boneIndex: number;
  readonly enabled?: boolean;
  readonly angleLimit?: CcdIkLinkAngleLimit;
}

export interface MmdIkRuntimeChain {
  readonly boneIndex: number;
  readonly targetBoneIndex: number;
  readonly links: readonly MmdIkRuntimeLink[];
  readonly iterationCount: number;
  readonly maxAnglePerIteration?: number;
  readonly tolerance?: number;
}

export interface CreateCcdIkSolveInputFromMmdIkInput {
  readonly bones: readonly MmdIkRuntimeBone[];
  readonly pose: CcdIkPose;
  readonly chains: readonly MmdIkRuntimeChain[];
}

export function createCcdIkSolveInputFromMmdIk(
  input: CreateCcdIkSolveInputFromMmdIkInput
): CcdIkSolveInput {
  return {
    bones: input.bones.map((bone): CcdIkBone => ({
      parentIndex: bone.parentIndex,
      translation: [...bone.translation]
    })),
    pose: input.pose,
    chains: input.chains.map(mmdIkChainToCcdIkChain)
  };
}

export function mmdIkChainToCcdIkChain(chain: MmdIkRuntimeChain): CcdIkChain {
  return {
    goalBoneIndex: chain.boneIndex,
    effectorBoneIndex: chain.targetBoneIndex,
    links: chain.links.map(mmdIkLinkToCcdIkLink),
    iterationCount: chain.iterationCount,
    maxAnglePerIteration: chain.maxAnglePerIteration,
    tolerance: chain.tolerance
  };
}

function mmdIkLinkToCcdIkLink(link: MmdIkRuntimeLink): CcdIkLink {
  return {
    boneIndex: link.boneIndex,
    enabled: link.enabled,
    angleLimit: link.angleLimit
  };
}
