import type {
  MmdAnimation,
  MmdPose,
  VmdBoneInterpolation,
  VmdBoneTrack,
  VmdCameraInterpolation,
  VmdMorphTrack
} from "../parser/model/modelTypes.js";
import type { MmdAnimRuntimeWasmModule } from "./mmdAnimRuntime.js";
import { parseMmdAnimWasmFormatJson } from "./mmdAnimRuntime.js";

interface RuntimeWasmVmdDto {
  readonly kind: "vmd";
  readonly metadata: {
    readonly modelName: string;
    readonly counts: {
      readonly bones: number;
      readonly morphs: number;
      readonly cameras: number;
      readonly lights: number;
      readonly selfShadows: number;
      readonly properties: number;
    };
    readonly maxFrame: number;
  };
  readonly boneFrames: readonly RuntimeWasmVmdBoneFrame[];
  readonly morphFrames: readonly RuntimeWasmVmdMorphFrame[];
  readonly cameraFrames: readonly RuntimeWasmVmdCameraFrame[];
  readonly lightFrames: readonly RuntimeWasmVmdLightFrame[];
  readonly selfShadowFrames: readonly RuntimeWasmVmdSelfShadowFrame[];
  readonly propertyFrames: readonly RuntimeWasmVmdPropertyFrame[];
}

interface RuntimeWasmVmdBoneFrame {
  readonly boneName: string;
  readonly frame: number;
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly interpolation?: readonly number[];
}

interface RuntimeWasmVmdMorphFrame {
  readonly morphName: string;
  readonly frame: number;
  readonly weight: number;
}

interface RuntimeWasmVmdCameraFrame {
  readonly frame: number;
  readonly distance: number;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly interpolation?: readonly number[];
  readonly fov: number;
  readonly perspective: boolean;
}

interface RuntimeWasmVmdLightFrame {
  readonly frame: number;
  readonly color: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

interface RuntimeWasmVmdSelfShadowFrame {
  readonly frame: number;
  readonly mode: number;
  readonly distance: number;
}

interface RuntimeWasmVmdPropertyFrame {
  readonly frame: number;
  readonly visible: boolean;
  readonly physicsSimulation?: boolean;
  readonly ikStates: readonly {
    readonly boneName: string;
    readonly enabled: boolean;
  }[];
}

interface RuntimeWasmVpdDto {
  readonly kind?: "vpd";
  readonly format?: "vpd";
  readonly modelFile: string;
  readonly boneCount: number;
  readonly bones: readonly RuntimeWasmVpdBonePose[];
}

interface RuntimeWasmVpdBonePose {
  readonly name: string;
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}

export function loadMmdAnimWasmVmd(
  wasm: Pick<MmdAnimRuntimeWasmModule, "parseMmdFormatJson">,
  bytes: Uint8Array,
  fileName?: string | null
): MmdAnimation {
  return mmdAnimWasmVmdDtoToAnimation(
    expectVmdDto(parseMmdAnimWasmFormatJson(wasm, bytes, fileName)),
    bytes.slice()
  );
}

export function loadMmdAnimWasmVpd(
  wasm: Pick<MmdAnimRuntimeWasmModule, "parseMmdFormatJson">,
  bytes: Uint8Array,
  fileName?: string | null
): MmdPose {
  return mmdAnimWasmVpdDtoToPose(
    expectVpdDto(parseMmdAnimWasmFormatJson(wasm, bytes, fileName)),
    bytes.slice()
  );
}

export function mmdAnimWasmVmdDtoToAnimation(
  dto: RuntimeWasmVmdDto,
  bytes = new Uint8Array()
): MmdAnimation {
  return {
    kind: "vmd",
    bytes,
    metadata: {
      modelName: dto.metadata.modelName,
      counts: dto.metadata.counts,
      maxFrame: dto.metadata.maxFrame
    },
    boneTracks: createBoneTracks(dto.boneFrames),
    morphTracks: createMorphTracks(dto.morphFrames),
    cameraFrames: dto.cameraFrames.map((frame) => ({
      frame: frame.frame,
      distance: frame.distance,
      position: toTuple3(frame.position),
      rotation: toTuple3(frame.rotation),
      fov: frame.fov,
      perspective: frame.perspective,
      interpolation: readCameraInterpolation(frame.interpolation)
    })),
    lightFrames: dto.lightFrames.map((frame) => ({
      frame: frame.frame,
      color: toTuple3(frame.color),
      direction: toTuple3(frame.direction)
    })),
    selfShadowFrames: dto.selfShadowFrames.map((frame) => ({
      frame: frame.frame,
      mode: frame.mode,
      distance: frame.distance
    })),
    propertyFrames: dto.propertyFrames.map((frame) => ({
      frame: frame.frame,
      visible: frame.visible,
      physicsSimulation: frame.physicsSimulation ?? true,
      ikStates: frame.ikStates.map((state) => ({
        boneName: state.boneName,
        enabled: state.enabled
      }))
    }))
  };
}

export function mmdAnimWasmVpdDtoToPose(
  dto: RuntimeWasmVpdDto,
  bytes = new Uint8Array()
): MmdPose {
  const bones: MmdPose["bones"] = {};
  for (const bone of dto.bones) {
    bones[bone.name] = {
      name: bone.name,
      translation: toTuple3(bone.translation),
      rotation: toTuple4(bone.rotation)
    };
  }
  return {
    kind: "vpd",
    bytes,
    metadata: {
      modelFile: dto.modelFile,
      boneCount: dto.boneCount,
      morphCount: 0
    },
    bones,
    morphs: {}
  };
}

function createBoneTracks(frames: readonly RuntimeWasmVmdBoneFrame[]): Record<string, VmdBoneTrack> {
  const grouped = groupBy(frames, (frame) => frame.boneName);
  const tracks: Record<string, VmdBoneTrack> = {};
  for (const [name, sourceFrames] of grouped) {
    const sorted = [...sourceFrames].sort(compareFrame);
    const track = createBoneTrack(sorted.length);
    sorted.forEach((frame, index) => {
      track.frames[index] = frame.frame;
      track.translations.set(frame.translation, index * 3);
      track.rotations.set(frame.rotation, index * 4);
      writePackedBoneInterpolation(track.interpolations, index, readBoneInterpolation(frame.interpolation));
      track.physicsToggles[index] = readBonePhysicsToggle(frame.interpolation) ?? -1;
    });
    tracks[name] = track;
  }
  return tracks;
}

function createMorphTracks(
  frames: readonly RuntimeWasmVmdMorphFrame[]
): Record<string, VmdMorphTrack> {
  const grouped = groupBy(frames, (frame) => frame.morphName);
  const tracks: Record<string, VmdMorphTrack> = {};
  for (const [name, sourceFrames] of grouped) {
    const sorted = [...sourceFrames].sort(compareFrame);
    const track = createMorphTrack(sorted.length);
    sorted.forEach((frame, index) => {
      track.frames[index] = frame.frame;
      track.weights[index] = frame.weight;
    });
    tracks[name] = track;
  }
  return tracks;
}

function createBoneTrack(count: number): VmdBoneTrack {
  const physicsToggles = new Int8Array(count);
  physicsToggles.fill(-1);
  return {
    packed: "bone",
    frames: new Uint32Array(count),
    translations: new Float32Array(count * 3),
    rotations: new Float32Array(count * 4),
    interpolations: new Float32Array(count * 16),
    physicsToggles
  };
}

function createMorphTrack(count: number): VmdMorphTrack {
  return {
    packed: "morph",
    frames: new Uint32Array(count),
    weights: new Float32Array(count)
  };
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = result.get(key);
    if (group) {
      group.push(value);
    } else {
      result.set(key, [value]);
    }
  }
  return result;
}

function compareFrame(left: { readonly frame: number }, right: { readonly frame: number }): number {
  return left.frame - right.frame;
}

function writePackedBoneInterpolation(
  target: Float32Array,
  frameIndex: number,
  interpolation: VmdBoneInterpolation | undefined
): void {
  const offset = frameIndex * 16;
  const curves = [
    interpolation?.translationX,
    interpolation?.translationY,
    interpolation?.translationZ,
    interpolation?.rotation
  ];
  curves.forEach((curve, curveIndex) => {
    const curveOffset = offset + curveIndex * 4;
    target[curveOffset] = curve?.[0] ?? 0;
    target[curveOffset + 1] = curve?.[1] ?? 0;
    target[curveOffset + 2] = curve?.[2] ?? 0;
    target[curveOffset + 3] = curve?.[3] ?? 0;
  });
}

function readBoneInterpolation(bytes: readonly number[] | undefined): VmdBoneInterpolation | undefined {
  if (!bytes) {
    return undefined;
  }
  return {
    translationX: normalizeInterpolationCurve([bytes[0] ?? 0, bytes[4] ?? 0, bytes[8] ?? 0, bytes[12] ?? 0]),
    translationY: normalizeInterpolationCurve([bytes[1] ?? 0, bytes[5] ?? 0, bytes[9] ?? 0, bytes[13] ?? 0]),
    translationZ: normalizeInterpolationCurve([bytes[2] ?? 0, bytes[6] ?? 0, bytes[10] ?? 0, bytes[14] ?? 0]),
    rotation: normalizeInterpolationCurve([bytes[3] ?? 0, bytes[7] ?? 0, bytes[11] ?? 0, bytes[15] ?? 0])
  };
}

function readBonePhysicsToggle(bytes: readonly number[] | undefined): number | undefined {
  const physicsInfo = (((bytes?.[2] ?? 0) << 8) | (bytes?.[3] ?? 0)) >>> 0;
  if (physicsInfo === 0x0000) {
    return 1;
  }
  if (physicsInfo === 0x630f) {
    return 0;
  }
  return undefined;
}

function readCameraInterpolation(bytes: readonly number[] | undefined): VmdCameraInterpolation | undefined {
  if (!bytes) {
    return undefined;
  }
  return {
    positionX: readCameraInterpolationCurve(bytes, 0),
    positionY: readCameraInterpolationCurve(bytes, 1),
    positionZ: readCameraInterpolationCurve(bytes, 2),
    rotation: readCameraInterpolationCurve(bytes, 3),
    distance: readCameraInterpolationCurve(bytes, 4),
    fov: readCameraInterpolationCurve(bytes, 5)
  };
}

function readCameraInterpolationCurve(bytes: readonly number[], channel: number): [number, number, number, number] {
  const offset = channel * 4;
  return normalizeInterpolationCurve([
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0
  ]);
}

function normalizeInterpolationCurve(values: [number, number, number, number]): [number, number, number, number] {
  return values.map((value) => Math.min(Math.max(value / 127, 0), 1)) as [number, number, number, number];
}

function toTuple3(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}

function toTuple4(value: readonly [number, number, number, number]): [number, number, number, number] {
  return [value[0], value[1], value[2], value[3]];
}

function expectVmdDto(value: unknown): RuntimeWasmVmdDto {
  if (!isObject(value) || value.kind !== "vmd") {
    throw new TypeError("mmd-anim wasm parser did not return a VMD DTO");
  }
  return value as unknown as RuntimeWasmVmdDto;
}

function expectVpdDto(value: unknown): RuntimeWasmVpdDto {
  if (!isObject(value) || (value.kind !== "vpd" && value.format !== "vpd")) {
    throw new TypeError("mmd-anim wasm parser did not return a VPD DTO");
  }
  return value as unknown as RuntimeWasmVpdDto;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
