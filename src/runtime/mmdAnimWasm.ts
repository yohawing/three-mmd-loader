import type { MmdAnimRuntimeWasmHostRigConstructor } from "./hostRig.js";

export interface MmdAnimRuntimeWasmModel {
  boneCount(): number;
  morphCount?(): number;
  ikCount?(): number;
  free?(): void;
}

export interface MmdAnimRuntimeWasmClip {
  free?(): void;
}

export interface MmdAnimRuntimeWasmCameraTrack {
  frameCount(): number;
  sample(frame: number, out: Float32Array): boolean;
  free?(): void;
}

export interface MmdAnimRuntimeWasmLightTrack {
  frameCount(): number;
  sample(frame: number, out: Float32Array): boolean;
  free?(): void;
}

export interface MmdAnimRuntimeWasmRuntimeInstance {
  evaluateClipFrameWithMorphOverrides?(
    clip: MmdAnimRuntimeWasmClip, frame: number, indices: Uint32Array, weights: Float32Array,
    ikTolerance: number | undefined, ikMaxIterationsCap: number, ikEnabled: boolean
  ): void;
  evaluateRestPoseWithMorphOverrides?(
    indices: Uint32Array, weights: Float32Array,
    ikTolerance: number | undefined, ikMaxIterationsCap: number, ikEnabled: boolean
  ): void;
  evaluateRestPose(): void;
  resetIkHistory?(): void;
  evaluateClipFrame(clip: MmdAnimRuntimeWasmClip, frame: number): void;
  evaluateClipFrameWithIkOptions?(
    clip: MmdAnimRuntimeWasmClip,
    frame: number,
    ikTolerance: number,
    ikMaxIterationsCap: number
  ): void;
  worldMatrixF32Len(): number;
  copyWorldMatrices(out: Float32Array): boolean;
  worldMatricesView?(): Float32Array;
  morphWeightLen?(): number;
  copyMorphWeights?(out: Float32Array): boolean;
  morphWeightsView?(): Float32Array;
  free?(): void;
}

export interface MmdAnimRuntimeWasmModule {
  readonly WasmMmdHostRig?: MmdAnimRuntimeWasmHostRigConstructor;
  parseMmdFormatJson?(data: Uint8Array, fileName?: string | null): string;
  exportMmdFormatBytes?(data: Uint8Array, fileName?: string | null): Uint8Array;
  exportVmdAnimationJsonBytes?(json: string): Uint8Array;
  exportVpdPoseJsonBytes?(json: string): Uint8Array;
  readonly WasmMmdModel?: {
    fromPmxBytes?(bytes: Uint8Array): MmdAnimRuntimeWasmModel;
  };
  readonly WasmMmdClip?: {
    fromVmdBytesForModel?(model: MmdAnimRuntimeWasmModel, bytes: Uint8Array): MmdAnimRuntimeWasmClip;
  };
  readonly WasmVmdCameraTrack?: {
    fromVmdBytes?(bytes: Uint8Array): MmdAnimRuntimeWasmCameraTrack;
  };
  readonly WasmVmdLightTrack?: {
    fromVmdBytes?(bytes: Uint8Array): MmdAnimRuntimeWasmLightTrack;
  };
  readonly WasmMmdRuntimeInstance: {
    forModel?(model: MmdAnimRuntimeWasmModel): MmdAnimRuntimeWasmRuntimeInstance;
    new(model: MmdAnimRuntimeWasmModel, morphCount: number): MmdAnimRuntimeWasmRuntimeInstance;
  };
}

export function parseMmdAnimWasmFormatJson(
  wasm: Pick<MmdAnimRuntimeWasmModule, "parseMmdFormatJson">,
  data: Uint8Array,
  fileName?: string | null
): unknown {
  const parser = wasm.parseMmdFormatJson;
  if (!parser) {
    throw new TypeError("mmd-anim wasm module does not expose parseMmdFormatJson");
  }
  return JSON.parse(parser(data, fileName ?? null)) as unknown;
}

export function exportMmdAnimWasmFormatBytes(
  wasm: Pick<MmdAnimRuntimeWasmModule, "exportMmdFormatBytes">,
  data: Uint8Array,
  fileName?: string | null
): Uint8Array {
  const exporter = wasm.exportMmdFormatBytes;
  if (!exporter) {
    throw new TypeError("mmd-anim wasm module does not expose exportMmdFormatBytes");
  }
  return exporter(data, fileName ?? null);
}

export function exportMmdAnimWasmVmdAnimationJsonBytes(
  wasm: Pick<MmdAnimRuntimeWasmModule, "exportVmdAnimationJsonBytes">,
  json: string
): Uint8Array {
  const exporter = wasm.exportVmdAnimationJsonBytes;
  if (!exporter) {
    throw new TypeError("mmd-anim wasm module does not expose exportVmdAnimationJsonBytes");
  }
  return exporter(json);
}

export function exportMmdAnimWasmVpdPoseJsonBytes(
  wasm: Pick<MmdAnimRuntimeWasmModule, "exportVpdPoseJsonBytes">,
  json: string
): Uint8Array {
  const exporter = wasm.exportVpdPoseJsonBytes;
  if (!exporter) {
    throw new TypeError("mmd-anim wasm module does not expose exportVpdPoseJsonBytes");
  }
  return exporter(json);
}

export function createWasmModelFromPmxBytes(
  wasm: MmdAnimRuntimeWasmModule | undefined,
  bytes: Uint8Array | undefined
): MmdAnimRuntimeWasmModel {
  const factory = wasm?.WasmMmdModel?.fromPmxBytes;
  if (!factory || !bytes) {
    throw new TypeError("MmdAnimRuntime requires either a wasm model or wasm.WasmMmdModel.fromPmxBytes with pmxBytes");
  }
  return factory(bytes);
}

export function createWasmRuntime(
  wasm: MmdAnimRuntimeWasmModule | undefined,
  model: MmdAnimRuntimeWasmModel
): MmdAnimRuntimeWasmRuntimeInstance {
  const runtimeFactory = wasm?.WasmMmdRuntimeInstance;
  if (!runtimeFactory) {
    throw new TypeError("MmdAnimRuntime requires wasm.WasmMmdRuntimeInstance");
  }
  return runtimeFactory.forModel?.(model) ?? new runtimeFactory(model, model.morphCount?.() ?? 0);
}
