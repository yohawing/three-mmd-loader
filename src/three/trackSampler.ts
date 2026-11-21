import type { MmdCameraState, MmdLightState } from "../parser/model/modelTypes.js";
import type { MmdAnimRuntimeWasmCameraTrack } from "../runtime/mmdAnimWasm.js";

/** Samples a VMD camera track by frame number. */
export interface MmdCameraTrackSampler {
  /**
   * Writes into target and returns it without allocating per frame.
   * Returns undefined without throwing for an empty track, a failed sample, or a disposed sampler.
   */
  sampleInto(frame: number, target: MmdCameraState): MmdCameraState | undefined;
  /** Releases any WASM resources and ends sampling. Safe to call multiple times. */
  dispose(): void;
}

/** Samples a VMD light track by frame number. */
export interface MmdLightTrackSampler {
  /**
   * Writes into target and returns it without allocating per frame.
   * Returns undefined without throwing for an empty track, a failed sample, or a disposed sampler.
   */
  sampleInto(frame: number, target: MmdLightState): MmdLightState | undefined;
  /** Releases any WASM resources and ends sampling. Safe to call multiple times. */
  dispose(): void;
}

export function wasmTrackSampler<T>(
  track: Pick<MmdAnimRuntimeWasmCameraTrack, "sample" | "free">,
  scratch: Float32Array,
  readState: (scratch: Float32Array, target: T) => T
) {
  let disposed = false;
  return {
    sampleInto(frame: number, target: T): T | undefined {
      if (disposed) return undefined;
      try {
        if (!track.sample(frame, scratch)) return undefined;
      } catch {
        return undefined;
      }
      return readState(scratch, target);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      track.free?.();
    }
  };
}

export function tsTrackSampler<T>(sample: (frame: number, target: T) => T | undefined) {
  let disposed = false;
  return {
    sampleInto(frame: number, target: T): T | undefined {
      if (disposed) return undefined;
      return sample(frame, target);
    },
    dispose(): void {
      disposed = true;
    }
  };
}
