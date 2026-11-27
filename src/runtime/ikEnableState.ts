import type { Bone } from "three";
import type { MmdAnimation } from "../parser/model/modelTypes.js";
import type { CcdIkPreparedChain } from "./ik/index.js";
import { readMmdBoneUserData } from "./userData.js";

type PropertyFrame = MmdAnimation["propertyFrames"][number];

export class IkEnableState {
  private preparedIkChains: CcdIkPreparedChain[] = [];
  private readonly activeIkChains: CcdIkPreparedChain[] = [];
  private currentIkPropertyFrame: PropertyFrame | undefined;
  private currentIkPropertyFrameIndex = -1;
  private readonly disabledIkBoneNames = new Set<string>();

  get chains(): readonly CcdIkPreparedChain[] {
    return this.preparedIkChains;
  }

  setChains(chains: CcdIkPreparedChain[]): void {
    this.preparedIkChains = chains;
    this.clear();
  }

  clear(): void {
    this.activeIkChains.length = 0;
    this.currentIkPropertyFrame = undefined;
    this.currentIkPropertyFrameIndex = -1;
    this.disabledIkBoneNames.clear();
  }

  update(propertyFrames: readonly PropertyFrame[] | undefined, frame: number, bones: readonly Bone[] | undefined): void {
    const propertyFrame = this.sampleCurrentPropertyFrame(propertyFrames, frame);
    if (propertyFrame === this.currentIkPropertyFrame) {
      return;
    }
    this.currentIkPropertyFrame = propertyFrame;
    this.disabledIkBoneNames.clear();
    this.activeIkChains.length = 0;
    if (!propertyFrame) {
      return;
    }
    for (const state of propertyFrame.ikStates) {
      if (!state.enabled) {
        this.disabledIkBoneNames.add(state.boneName);
      }
    }
    if (this.disabledIkBoneNames.size > 0) {
      this.rebuildActiveIkChains(bones);
    }
  }

  enabledChains(): readonly CcdIkPreparedChain[] {
    if (this.disabledIkBoneNames.size === 0) {
      return this.preparedIkChains;
    }
    return this.activeIkChains;
  }

  private rebuildActiveIkChains(bones: readonly Bone[] | undefined): void {
    this.activeIkChains.length = 0;
    if (!bones) {
      return;
    }
    for (const chain of this.preparedIkChains) {
      if (this.isIkChainEnabled(chain, bones)) {
        this.activeIkChains.push(chain);
      }
    }
  }

  private isIkChainEnabled(
    chain: CcdIkPreparedChain,
    bones: readonly Bone[]
  ): boolean {
    const bone = bones[chain.goalBoneIndex];
    if (!bone) {
      return true;
    }
    if (this.disabledIkBoneNames.has(bone.name)) {
      return false;
    }
    const userData = readMmdBoneUserData(bone);
    const mmdName = userData.mmdBoneName;
    if (typeof mmdName === "string" && this.disabledIkBoneNames.has(mmdName)) {
      return false;
    }
    const ikStateName = userData.mmdIkStateName;
    if (typeof ikStateName === "string" && this.disabledIkBoneNames.has(ikStateName)) {
      return false;
    }
    const englishName = userData.mmdEnglishBoneName;
    return !(typeof englishName === "string" && this.disabledIkBoneNames.has(englishName));
  }

  private sampleCurrentPropertyFrame(frames: readonly PropertyFrame[] | undefined, frame: number): PropertyFrame | undefined {
    if (!frames || frames.length === 0 || frame < (frames[0]?.frame ?? Number.POSITIVE_INFINITY)) {
      this.currentIkPropertyFrameIndex = -1;
      return undefined;
    }
    let index = this.currentIkPropertyFrameIndex;
    const current = index >= 0 && index < frames.length ? frames[index] : undefined;
    if (!current || current.frame > frame) {
      index = findPropertyFrameIndex(frames, frame);
    } else {
      while (index + 1 < frames.length && (frames[index + 1]?.frame ?? Number.POSITIVE_INFINITY) <= frame) {
        index += 1;
      }
    }
    this.currentIkPropertyFrameIndex = index;
    return frames[index];
  }
}

function findPropertyFrameIndex(
  frames: readonly PropertyFrame[],
  frame: number
): number {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const middleFrame = frames[middle]?.frame ?? Number.POSITIVE_INFINITY;
    if (middleFrame <= frame) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}

