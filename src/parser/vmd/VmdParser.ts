import { BinaryReader, toUint8Array } from "../binary/index.js";
import { parseVmdMetadata } from "./VmdMetadataParser.js";
import type {
  MmdAnimation,
  VmdBoneFrame,
  VmdBoneInterpolation,
  VmdCameraFrame,
  VmdCameraInterpolation,
  VmdIkState,
  VmdLightFrame,
  VmdMetadata,
  VmdMorphFrame,
  VmdPropertyFrame,
  VmdSelfShadowFrame
} from "../model/modelTypes.js";

type MutableVmdMetadata = VmdMetadata & {
  readonly format: "vmd";
  readonly name?: string;
};

const asciiDecoder = new TextDecoder("ascii");
const shiftJisDecoder = new TextDecoder("shift-jis");
const maxVmdSectionCount = 10_000_000;

export function parseVmd(input: Uint8Array | ArrayBuffer): MmdAnimation {
  const bytes = toUint8Array(input);
  const metadataInventory = parseVmdMetadata(bytes);
  const reader = new BinaryReader(bytes);
  const signature = readFixedText(reader, 30, asciiDecoder);
  if (!signature.startsWith("Vocaloid Motion Data")) {
    throw new Error(`Invalid VMD signature: ${JSON.stringify(signature)}`);
  }
  const modelName = readFixedText(reader, 20, shiftJisDecoder);

  const boneTracks: Record<string, VmdBoneFrame[]> = {};
  const morphTracks: Record<string, VmdMorphFrame[]> = {};
  const cameraFrames: VmdCameraFrame[] = [];
  const lightFrames: VmdLightFrame[] = [];
  const selfShadowFrames: VmdSelfShadowFrame[] = [];
  const propertyFrames: VmdPropertyFrame[] = [];
  let maxFrame = 0;

  const boneCount = readCount(reader, "bone");
  for (let index = 0; index < boneCount; index += 1) {
    const name = readFixedText(reader, 15, shiftJisDecoder);
    const frame = reader.u32();
    const boneFrame: VmdBoneFrame = {
      frame,
      translation: readVec3(reader),
      rotation: readVec4(reader),
      interpolation: readBoneInterpolation(reader.bytes(64))
    };
    pushTrackFrame(boneTracks, name, boneFrame);
    maxFrame = Math.max(maxFrame, frame);
  }

  const morphCount = readCount(reader, "morph");
  for (let index = 0; index < morphCount; index += 1) {
    const name = readFixedText(reader, 15, shiftJisDecoder);
    const frame = reader.u32();
    const morphFrame: VmdMorphFrame = {
      frame,
      weight: reader.f32()
    };
    pushTrackFrame(morphTracks, name, morphFrame);
    maxFrame = Math.max(maxFrame, frame);
  }

  const cameraCount = readCount(reader, "camera");
  for (let index = 0; index < cameraCount; index += 1) {
    const frame = reader.u32();
    const cameraFrame: VmdCameraFrame = {
      frame,
      distance: reader.f32(),
      position: readVec3(reader),
      rotation: readVec3(reader),
      interpolation: readCameraInterpolation(reader.bytes(24)),
      fov: reader.u32(),
      perspective: reader.u8() === 0
    };
    cameraFrames.push(cameraFrame);
    maxFrame = Math.max(maxFrame, frame);
  }

  const lightCount = readCount(reader, "light");
  for (let index = 0; index < lightCount; index += 1) {
    const frame = reader.u32();
    lightFrames.push({
      frame,
      color: readVec3(reader),
      direction: readVec3(reader)
    });
    maxFrame = Math.max(maxFrame, frame);
  }

  const selfShadowCount = readOptionalCount(reader, "self-shadow");
  for (let index = 0; index < selfShadowCount; index += 1) {
    const frame = reader.u32();
    selfShadowFrames.push({
      frame,
      mode: reader.u8(),
      distance: reader.f32()
    });
    maxFrame = Math.max(maxFrame, frame);
  }

  const propertyCount = readOptionalCount(reader, "property");
  for (let index = 0; index < propertyCount; index += 1) {
    const frame = reader.u32();
    const visible = reader.u8() !== 0;
    const ikCount = readCount(reader, "property IK state");
    const ikStates: VmdIkState[] = [];
    for (let ikIndex = 0; ikIndex < ikCount; ikIndex += 1) {
      ikStates.push({
        boneName: readFixedText(reader, 20, shiftJisDecoder),
        enabled: reader.u8() !== 0
      });
    }
    propertyFrames.push({
      frame,
      visible,
      physicsSimulation: true,
      ikStates
    });
    maxFrame = Math.max(maxFrame, frame);
  }

  sortTrackFrames(boneTracks);
  sortTrackFrames(morphTracks);
  sortFrames(cameraFrames);
  sortFrames(lightFrames);
  sortFrames(selfShadowFrames);
  sortFrames(propertyFrames);

  const metadata: MutableVmdMetadata = {
    format: "vmd",
    name: modelName,
    modelName,
    counts: {
      bones: boneCount,
      morphs: morphCount,
      cameras: cameraCount,
      lights: lightCount,
      selfShadows: selfShadowCount,
      properties: propertyCount
    },
    maxFrame
  };

  if (metadataInventory.modelName !== modelName) {
    throw new Error("VMD metadata model name mismatch");
  }

  return {
    kind: "vmd",
    bytes,
    metadata,
    boneTracks,
    morphTracks,
    cameraFrames,
    lightFrames,
    selfShadowFrames,
    propertyFrames
  };
}

function readOptionalCount(reader: BinaryReader, label: string): number {
  if (reader.remaining === 0) {
    return 0;
  }
  return readCount(reader, label);
}

function readCount(reader: BinaryReader, label: string): number {
  const count = reader.u32();
  if (count > maxVmdSectionCount) {
    throw new Error(`Invalid VMD ${label} count: ${count}`);
  }
  return count;
}

function readFixedText(reader: BinaryReader, byteLength: number, decoder: TextDecoder): string {
  const bytes = reader.bytes(byteLength);
  const end = bytes.indexOf(0);
  return decoder.decode(end >= 0 ? bytes.subarray(0, end) : bytes).trim();
}

function readVec3(reader: BinaryReader): [number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32()];
}

function readVec4(reader: BinaryReader): [number, number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32(), reader.f32()];
}

function readBoneInterpolation(bytes: Uint8Array): VmdBoneInterpolation {
  return {
    translationX: normalizeInterpolationCurve([bytes[0] ?? 0, bytes[4] ?? 0, bytes[8] ?? 0, bytes[12] ?? 0]),
    translationY: normalizeInterpolationCurve([bytes[1] ?? 0, bytes[5] ?? 0, bytes[9] ?? 0, bytes[13] ?? 0]),
    translationZ: normalizeInterpolationCurve([bytes[2] ?? 0, bytes[6] ?? 0, bytes[10] ?? 0, bytes[14] ?? 0]),
    rotation: normalizeInterpolationCurve([bytes[3] ?? 0, bytes[7] ?? 0, bytes[11] ?? 0, bytes[15] ?? 0])
  };
}

function readCameraInterpolation(bytes: Uint8Array): VmdCameraInterpolation {
  return {
    positionX: readCameraInterpolationCurve(bytes, 0),
    positionY: readCameraInterpolationCurve(bytes, 1),
    positionZ: readCameraInterpolationCurve(bytes, 2),
    rotation: readCameraInterpolationCurve(bytes, 3),
    distance: readCameraInterpolationCurve(bytes, 4),
    fov: readCameraInterpolationCurve(bytes, 5)
  };
}

function readCameraInterpolationCurve(bytes: Uint8Array, channel: number): [number, number, number, number] {
  return normalizeInterpolationCurve([
    bytes[channel] ?? 0,
    bytes[channel + 6] ?? 0,
    bytes[channel + 12] ?? 0,
    bytes[channel + 18] ?? 0
  ]);
}

function normalizeInterpolationCurve(values: [number, number, number, number]): [number, number, number, number] {
  return values.map((value) => Math.min(Math.max(value / 127, 0), 1)) as [number, number, number, number];
}

function pushTrackFrame<T extends { readonly frame: number }>(
  tracks: Record<string, T[]>,
  name: string,
  frame: T
): void {
  (tracks[name] ??= []).push(frame);
}

function sortTrackFrames<T extends { readonly frame: number }>(tracks: Record<string, T[]>): void {
  Object.values(tracks).forEach(sortFrames);
}

function sortFrames<T extends { readonly frame: number }>(frames: T[]): void {
  frames.sort((a, b) => a.frame - b.frame);
}
