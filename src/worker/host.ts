import type { MmdAnimation } from "../parser/model/modelTypes.js";
import { DefaultMmdRuntime } from "../runtime/core.js";
import type {
  DefaultMmdRuntimeOptions,
  MmdFrameState,
  MmdRuntime,
  MmdRuntimeDebugState,
  MmdRuntimeEvaluateOptions
} from "../runtime/types.js";
import {
  buildShadowMmdSkinnedMesh,
  type MmdRuntimeModelDescriptor
} from "./modelDescriptor.js";
import {
  captureMmdRuntimePoseInto,
  createMmdRuntimePoseBuffer,
  type MmdRuntimePoseBuffer
} from "./protocol.js";

export interface MmdRuntimeWorkerHostOptions {
  readonly runtime?: MmdRuntime;
  readonly runtimeOptions?: DefaultMmdRuntimeOptions;
}

/**
 * Worker-API-independent runtime host. P0 runs this in-process; later transports
 * can forward the same commands without changing runtime evaluation order.
 */
export class MmdRuntimeWorkerHost {
  readonly mesh;
  private readonly runtime: MmdRuntime;
  private readonly poseBuffer: MmdRuntimePoseBuffer;
  private currentEpoch = 0;
  private currentSequence = 0;
  private disposed = false;

  constructor(
    descriptor: MmdRuntimeModelDescriptor,
    options: MmdRuntimeWorkerHostOptions = {}
  ) {
    this.mesh = buildShadowMmdSkinnedMesh(descriptor);
    this.runtime = options.runtime ?? new DefaultMmdRuntime(options.runtimeOptions);
    this.poseBuffer = createMmdRuntimePoseBuffer(
      descriptor.bones.length,
      descriptor.morphCount
    );
    this.publish(this.runtime.frameState());
  }

  epoch(): number {
    return this.currentEpoch;
  }

  setAnimation(animation: MmdAnimation): MmdRuntimePoseBuffer {
    this.assertActive();
    this.currentEpoch += 1;
    this.runtime.setAnimation(animation, this.mesh);
    return this.publish(this.runtime.frameState());
  }

  evaluate(
    seconds: number,
    options?: MmdRuntimeEvaluateOptions
  ): MmdRuntimePoseBuffer {
    this.assertActive();
    return this.publish(this.runtime.evaluate(seconds, options));
  }

  seek(seconds: number): MmdFrameState {
    this.assertActive();
    this.currentEpoch += 1;
    return this.runtime.seek(seconds);
  }

  resetPose(): MmdRuntimePoseBuffer {
    this.assertActive();
    this.currentEpoch += 1;
    this.runtime.resetPose();
    return this.publish(this.runtime.frameState());
  }

  clearAnimation(): MmdRuntimePoseBuffer {
    this.assertActive();
    this.currentEpoch += 1;
    this.runtime.clearAnimation();
    return this.publish(this.runtime.frameState());
  }

  frameState(): MmdFrameState {
    this.assertActive();
    return this.runtime.frameState();
  }

  debugState(): MmdRuntimeDebugState {
    this.assertActive();
    return this.runtime.debugState();
  }

  pose(): MmdRuntimePoseBuffer {
    return this.poseBuffer;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.currentEpoch += 1;
    this.runtime.clearAnimation();
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose();
      }
    } else {
      material.dispose();
    }
  }

  private publish(frameState: MmdFrameState): MmdRuntimePoseBuffer {
    this.currentSequence += 1;
    return captureMmdRuntimePoseInto(
      this.mesh,
      frameState,
      this.currentEpoch,
      this.currentSequence,
      this.poseBuffer
    );
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("MMD runtime worker host is disposed");
    }
  }
}
