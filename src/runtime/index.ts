import * as THREE from "three";

import { CcdIkSolver } from "./ik/index.js";

export * from "./ik/index.js";

export interface MmdFrameState {
  readonly seconds: number;
  readonly frame: number;
  readonly frameRate: number;
}

export interface MmdRuntime {
  setAnimation(clip: THREE.AnimationClip, mesh: THREE.SkinnedMesh): void;
  evaluate(seconds: number): MmdFrameState;
  reset(seconds?: number): MmdFrameState;
  frameState(): MmdFrameState;
}

export interface DefaultMmdRuntimeOptions {
  readonly frameRate?: number;
  readonly initialSeconds?: number;
}

export class DefaultMmdRuntime implements MmdRuntime {
  private readonly frameRate: number;
  private readonly ikSolver = new CcdIkSolver();
  private mixer: THREE.AnimationMixer | undefined;
  private mesh: THREE.SkinnedMesh | undefined;
  private state: MmdFrameState;

  constructor(options: DefaultMmdRuntimeOptions = {}) {
    this.frameRate = normalizeFrameRate(options.frameRate ?? 30);
    this.state = createFrameState(options.initialSeconds ?? 0, this.frameRate);
  }

  evaluate(seconds: number): MmdFrameState {
    const previousSeconds = this.state.seconds;
    this.state = createFrameState(seconds, this.frameRate);
    if (this.mixer) {
      const delta = seconds - previousSeconds;
      if (delta >= 0) {
        this.mixer.update(delta);
      } else {
        this.mixer.setTime(seconds);
      }
    }
    this.applyAppendTransforms();
    this.solveIk();
    this.mesh?.skeleton.update();
    return this.frameState();
  }

  reset(seconds = 0): MmdFrameState {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.mesh) {
        this.mixer.uncacheRoot(this.mesh);
      }
      this.mixer = undefined;
      this.mesh = undefined;
    }
    this.state = createFrameState(seconds, this.frameRate);
    return this.frameState();
  }

  setAnimation(clip: THREE.AnimationClip, mesh: THREE.SkinnedMesh): void {
    if (!(clip instanceof THREE.AnimationClip)) {
      throw new TypeError("MMD runtime animation clip must be a THREE.AnimationClip");
    }
    if (!mesh.isSkinnedMesh) {
      throw new TypeError("MMD runtime mesh must be a THREE.SkinnedMesh");
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.mesh) {
        this.mixer.uncacheRoot(this.mesh);
      }
    }
    this.mesh = mesh;
    this.mixer = new THREE.AnimationMixer(mesh);
    this.mixer.clipAction(clip).play();
  }

  frameState(): MmdFrameState {
    return { ...this.state };
  }

  private solveIk(): void {
    const mesh = this.mesh;
    if (!mesh) {
      return;
    }
    const chains = readIkChains(mesh);
    if (chains.length === 0) {
      return;
    }
    const bones = mesh.skeleton.bones.map((bone) => ({
      parentIndex: bone.parent instanceof THREE.Bone ? mesh.skeleton.bones.indexOf(bone.parent) : -1,
      translation: [bone.position.x, bone.position.y, bone.position.z] as [number, number, number]
    }));
    const rotations = mesh.skeleton.bones.map((bone) => {
      return [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w] as [
        number,
        number,
        number,
        number
      ];
    });
    this.ikSolver.solve({
      bones,
      pose: { rotations },
      chains
    });
    rotations.forEach((rotation, index) => {
      mesh.skeleton.bones[index]?.quaternion.fromArray(rotation);
    });
  }

  private applyAppendTransforms(): void {
    const mesh = this.mesh;
    if (!mesh) {
      return;
    }

    const bones = mesh.skeleton.bones;
    for (let index = 0; index < bones.length; index += 1) {
      const bone = bones[index];
      if (!bone) {
        continue;
      }
      const appendTransform = bone.userData.mmdAppendTransform as
        | { readonly parentIndex: number; readonly weight: number }
        | undefined;
      const flags = bone.userData.mmdFlags as
        | {
            readonly appendRotate?: boolean;
            readonly appendTranslate?: boolean;
            readonly appendLocal?: boolean;
          }
        | undefined;
      if (!appendTransform || (!flags?.appendRotate && !flags?.appendTranslate)) {
        continue;
      }

      const sourceBone = bones[appendTransform.parentIndex];
      if (!sourceBone) {
        continue;
      }
      const weight = appendTransform.weight;

      if (flags.appendRotate) {
        const slerpQ = new THREE.Quaternion().slerp(sourceBone.quaternion, weight);
        bone.quaternion.multiply(slerpQ);
      }
      if (flags.appendTranslate) {
        bone.position.addScaledVector(sourceBone.position, weight);
      }
    }
  }
}

type RuntimeIkChain = Parameters<CcdIkSolver["solve"]>[0]["chains"][number];

function readIkChains(mesh: THREE.SkinnedMesh): RuntimeIkChain[] {
  const chains = mesh.userData.mmdIkChains;
  return Array.isArray(chains) ? chains.filter(isRuntimeIkChain) : [];
}

function isRuntimeIkChain(value: unknown): value is RuntimeIkChain {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const chain = value as {
    readonly goalBoneIndex?: unknown;
    readonly effectorBoneIndex?: unknown;
    readonly links?: unknown;
    readonly iterationCount?: unknown;
  };
  return (
    Number.isInteger(chain.goalBoneIndex) &&
    Number.isInteger(chain.effectorBoneIndex) &&
    Number.isFinite(chain.iterationCount) &&
    Array.isArray(chain.links)
  );
}

function normalizeFrameRate(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new RangeError("MMD runtime frameRate must be a finite positive number");
  }
  return frameRate;
}

function createFrameState(seconds: number, frameRate: number): MmdFrameState {
  if (!Number.isFinite(seconds)) {
    throw new RangeError("MMD runtime seconds must be finite");
  }
  return {
    seconds,
    frame: seconds * frameRate,
    frameRate
  };
}
