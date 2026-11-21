import type { MmdCameraState, MmdLightState } from "../parser/model/modelTypes.js";
import type {
  MmdAnimRuntimeWasmCameraTrack,
  MmdAnimRuntimeWasmLightTrack,
  MmdAnimRuntimeWasmModule
} from "./mmdAnimWasm.js";

export function createMmdAnimWasmCameraTrack(
  wasm: Pick<MmdAnimRuntimeWasmModule, "WasmVmdCameraTrack">,
  bytes: Uint8Array
): MmdAnimRuntimeWasmCameraTrack | undefined {
  return wasm.WasmVmdCameraTrack?.fromVmdBytes?.(bytes);
}

export function createMmdAnimWasmLightTrack(
  wasm: Pick<MmdAnimRuntimeWasmModule, "WasmVmdLightTrack">,
  bytes: Uint8Array
): MmdAnimRuntimeWasmLightTrack | undefined {
  return wasm.WasmVmdLightTrack?.fromVmdBytes?.(bytes);
}

export function sampleMmdAnimWasmCameraTrackInto(
  track: MmdAnimRuntimeWasmCameraTrack,
  frame: number,
  scratch: Float32Array,
  target: MmdCameraState
): MmdCameraState {
  if (scratch.length < 9 || !track.sample(frame, scratch)) {
    throw new RangeError("MmdAnimRuntime camera sample buffer is too short");
  }
  target.distance = scratch[0] ?? 0;
  target.position[0] = scratch[1] ?? 0;
  target.position[1] = scratch[2] ?? 0;
  target.position[2] = scratch[3] ?? 0;
  target.rotation[0] = scratch[4] ?? 0;
  target.rotation[1] = scratch[5] ?? 0;
  target.rotation[2] = scratch[6] ?? 0;
  target.fov = scratch[7] ?? 1;
  target.perspective = (scratch[8] ?? 1) >= 0.5;
  return target;
}

export function sampleMmdAnimWasmLightTrackInto(
  track: MmdAnimRuntimeWasmLightTrack,
  frame: number,
  scratch: Float32Array,
  target: MmdLightState
): MmdLightState {
  if (scratch.length < 6 || !track.sample(frame, scratch)) {
    throw new RangeError("MmdAnimRuntime light sample buffer is too short");
  }
  target.color[0] = scratch[0] ?? 0;
  target.color[1] = scratch[1] ?? 0;
  target.color[2] = scratch[2] ?? 0;
  target.direction[0] = scratch[3] ?? 0;
  target.direction[1] = scratch[4] ?? 0;
  target.direction[2] = scratch[5] ?? 0;
  return target;
}
