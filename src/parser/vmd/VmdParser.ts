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
    const translation = readVec3(reader);
    const rotation = readVec4(reader);
    const interpolationBytes = reader.bytes(64);
    const physicsToggle = readBonePhysicsToggle(interpolationBytes);
    const boneFrame: VmdBoneFrame = {
      frame,
      translation,
      rotation,
      interpolation: readBoneInterpolation(interpolationBytes)
    };
    if (physicsToggle !== undefined) {
      boneFrame.physicsToggle = physicsToggle;
    }
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

  // Old-format / morph-only (lip-sync) VMDs end after the morph section and
  // omit camera onward entirely, so every trailing count is optional.
  const cameraCount = readOptionalCount(reader, "camera");
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

  const lightCount = readOptionalCount(reader, "light");
  for (let index = 0; index < lightCount; index += 1) {
    const frame = reader.u32();
    lightFrames.push({
      frame,
      color: readVec3(reader),
      direction: readVec3(reader)
    });
    maxFrame = Math.max(maxFrame, frame);
  }

  const selfShadowCount = readOptionalTailCount(reader, "self-shadow");
  for (let index = 0; index < selfShadowCount; index += 1) {
    const frame = reader.u32();
    selfShadowFrames.push({
      frame,
      mode: reader.u8(),
      distance: reader.f32()
    });
    maxFrame = Math.max(maxFrame, frame);
  }

  const propertyCount = readOptionalTailCount(reader, "property");
  const propertyLayout = selectPropertyFrameLayout(reader, propertyCount);
  for (let index = 0; index < propertyCount; index += 1) {
    const frame = reader.u32();
    const visible = reader.u8() !== 0;
    const physicsSimulation =
      propertyLayout === "extendedPhysics" ? reader.u8() !== 0 : true;
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
      physicsSimulation,
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

export interface PackedVmdBoneTrack {
  readonly packed: "bone";
  readonly frames: Uint32Array;
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly interpolations: Float32Array;
  readonly physicsToggles: Int8Array;
}

export interface PackedVmdMorphTrack {
  readonly packed: "morph";
  readonly frames: Uint32Array;
  readonly weights: Float32Array;
}

export function parseVmdCompact(input: Uint8Array | ArrayBuffer): MmdAnimation {
  const bytes = toUint8Array(input);
  const firstPass = readVmdCompactLayout(bytes);
  const boneTracks = createPackedBoneTracks(firstPass.boneTrackCounts);
  const morphTracks = createPackedMorphTracks(firstPass.morphTrackCounts);
  const parsedTail = fillPackedVmdTracks(bytes, boneTracks, morphTracks);
  return {
    kind: "vmd",
    bytes,
    metadata: {
      format: "vmd",
      name: firstPass.modelName,
      modelName: firstPass.modelName,
      counts: {
        bones: firstPass.boneCount,
        morphs: firstPass.morphCount,
        cameras: parsedTail.cameraFrames.length,
        lights: parsedTail.lightFrames.length,
        selfShadows: parsedTail.selfShadowFrames.length,
        properties: parsedTail.propertyFrames.length
      },
      maxFrame: Math.max(firstPass.maxFrame, parsedTail.maxFrame)
    } as MutableVmdMetadata,
    boneTracks: boneTracks as unknown as MmdAnimation["boneTracks"],
    morphTracks: morphTracks as unknown as MmdAnimation["morphTracks"],
    cameraFrames: parsedTail.cameraFrames,
    lightFrames: parsedTail.lightFrames,
    selfShadowFrames: parsedTail.selfShadowFrames,
    propertyFrames: parsedTail.propertyFrames
  };
}

function readVmdCompactLayout(bytes: Uint8Array): {
  readonly modelName: string;
  readonly boneCount: number;
  readonly morphCount: number;
  readonly boneTrackCounts: Map<string, number>;
  readonly morphTrackCounts: Map<string, number>;
  readonly maxFrame: number;
} {
  const reader = new BinaryReader(bytes);
  const signature = readFixedText(reader, 30, asciiDecoder);
  if (!signature.startsWith("Vocaloid Motion Data")) {
    throw new Error(`Invalid VMD signature: ${JSON.stringify(signature)}`);
  }
  const modelName = readFixedText(reader, 20, shiftJisDecoder);
  const boneTrackCounts = new Map<string, number>();
  const morphTrackCounts = new Map<string, number>();
  let maxFrame = 0;
  const boneCount = readCount(reader, "bone");
  for (let index = 0; index < boneCount; index += 1) {
    const name = readFixedText(reader, 15, shiftJisDecoder);
    const frame = reader.u32();
    incrementMapCount(boneTrackCounts, name);
    maxFrame = Math.max(maxFrame, frame);
    reader.skip(12 + 16 + 64);
  }
  const morphCount = readCount(reader, "morph");
  for (let index = 0; index < morphCount; index += 1) {
    const name = readFixedText(reader, 15, shiftJisDecoder);
    const frame = reader.u32();
    incrementMapCount(morphTrackCounts, name);
    maxFrame = Math.max(maxFrame, frame);
    reader.skip(4);
  }
  return { modelName, boneCount, morphCount, boneTrackCounts, morphTrackCounts, maxFrame };
}

function fillPackedVmdTracks(
  bytes: Uint8Array,
  boneTracks: Record<string, PackedVmdBoneTrack>,
  morphTracks: Record<string, PackedVmdMorphTrack>
): {
  readonly cameraFrames: VmdCameraFrame[];
  readonly lightFrames: VmdLightFrame[];
  readonly selfShadowFrames: VmdSelfShadowFrame[];
  readonly propertyFrames: VmdPropertyFrame[];
  readonly maxFrame: number;
} {
  const reader = new BinaryReader(bytes);
  reader.skip(30 + 20);
  const boneWriteIndices = createWriteIndexMap(boneTracks);
  const morphWriteIndices = createWriteIndexMap(morphTracks);
  let maxFrame = 0;
  const boneCount = readCount(reader, "bone");
  for (let index = 0; index < boneCount; index += 1) {
    const name = readFixedText(reader, 15, shiftJisDecoder);
    const track = boneTracks[name];
    const writeIndex = boneWriteIndices.get(name) ?? 0;
    boneWriteIndices.set(name, writeIndex + 1);
    const frame = reader.u32();
    maxFrame = Math.max(maxFrame, frame);
    const translationOffset = writeIndex * 3;
    track.frames[writeIndex] = frame;
    track.translations[translationOffset] = reader.f32();
    track.translations[translationOffset + 1] = reader.f32();
    track.translations[translationOffset + 2] = reader.f32();
    const rotationOffset = writeIndex * 4;
    track.rotations[rotationOffset] = reader.f32();
    track.rotations[rotationOffset + 1] = reader.f32();
    track.rotations[rotationOffset + 2] = reader.f32();
    track.rotations[rotationOffset + 3] = reader.f32();
    const interpolationBytes = reader.bytes(64);
    writePackedBoneInterpolation(track.interpolations, writeIndex, readBoneInterpolation(interpolationBytes));
    track.physicsToggles[writeIndex] = readBonePhysicsToggle(interpolationBytes) ?? -1;
  }
  const morphCount = readCount(reader, "morph");
  for (let index = 0; index < morphCount; index += 1) {
    const name = readFixedText(reader, 15, shiftJisDecoder);
    const track = morphTracks[name];
    const writeIndex = morphWriteIndices.get(name) ?? 0;
    morphWriteIndices.set(name, writeIndex + 1);
    const frame = reader.u32();
    maxFrame = Math.max(maxFrame, frame);
    track.frames[writeIndex] = frame;
    track.weights[writeIndex] = reader.f32();
  }
  Object.values(boneTracks).forEach(sortPackedBoneTrack);
  Object.values(morphTracks).forEach(sortPackedMorphTrack);
  const cameraFrames = readCompactCameraFrames(reader);
  const lightFrames = readCompactLightFrames(reader);
  const selfShadowFrames = readCompactSelfShadowFrames(reader);
  const propertyFrames = readCompactPropertyFrames(reader);
  for (const frame of [...cameraFrames, ...lightFrames, ...selfShadowFrames, ...propertyFrames]) {
    maxFrame = Math.max(maxFrame, frame.frame);
  }
  return { cameraFrames, lightFrames, selfShadowFrames, propertyFrames, maxFrame };
}

function incrementMapCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function createPackedBoneTracks(counts: ReadonlyMap<string, number>): Record<string, PackedVmdBoneTrack> {
  const tracks: Record<string, PackedVmdBoneTrack> = {};
  for (const [name, count] of counts) {
    const physicsToggles = new Int8Array(count);
    physicsToggles.fill(-1);
    tracks[name] = {
      packed: "bone",
      frames: new Uint32Array(count),
      translations: new Float32Array(count * 3),
      rotations: new Float32Array(count * 4),
      interpolations: new Float32Array(count * 16),
      physicsToggles
    };
  }
  return tracks;
}

function createPackedMorphTracks(counts: ReadonlyMap<string, number>): Record<string, PackedVmdMorphTrack> {
  const tracks: Record<string, PackedVmdMorphTrack> = {};
  for (const [name, count] of counts) {
    tracks[name] = {
      packed: "morph",
      frames: new Uint32Array(count),
      weights: new Float32Array(count)
    };
  }
  return tracks;
}

function createWriteIndexMap<T extends { readonly frames: Uint32Array }>(
  tracks: Record<string, T>
): Map<string, number> {
  return new Map(Object.keys(tracks).map((name) => [name, 0]));
}

function sortPackedBoneTrack(track: PackedVmdBoneTrack): void {
  const order = packedSortOrder(track.frames);
  if (!order) {
    return;
  }
  reorderUint32(track.frames, order);
  reorderFloat32Tuple(track.translations, 3, order);
  reorderFloat32Tuple(track.rotations, 4, order);
  reorderFloat32Tuple(track.interpolations, 16, order);
  reorderInt8(track.physicsToggles, order);
}

function sortPackedMorphTrack(track: PackedVmdMorphTrack): void {
  const order = packedSortOrder(track.frames);
  if (!order) {
    return;
  }
  reorderUint32(track.frames, order);
  reorderFloat32Tuple(track.weights, 1, order);
}

function packedSortOrder(frames: Uint32Array): Uint32Array | undefined {
  let sorted = true;
  for (let index = 1; index < frames.length; index += 1) {
    if ((frames[index - 1] ?? 0) > (frames[index] ?? 0)) {
      sorted = false;
      break;
    }
  }
  if (sorted) {
    return undefined;
  }
  return Uint32Array.from(
    Array.from(frames.keys()).sort((left, right) => (frames[left] ?? 0) - (frames[right] ?? 0))
  );
}

function reorderUint32(values: Uint32Array, order: Uint32Array): void {
  const copy = values.slice();
  for (let index = 0; index < order.length; index += 1) {
    values[index] = copy[order[index] ?? 0] ?? 0;
  }
}

function reorderInt8(values: Int8Array, order: Uint32Array): void {
  const copy = values.slice();
  for (let index = 0; index < order.length; index += 1) {
    values[index] = copy[order[index] ?? 0] ?? -1;
  }
}

function reorderFloat32Tuple(values: Float32Array, tupleSize: number, order: Uint32Array): void {
  const copy = values.slice();
  for (let index = 0; index < order.length; index += 1) {
    const source = (order[index] ?? 0) * tupleSize;
    const target = index * tupleSize;
    for (let component = 0; component < tupleSize; component += 1) {
      values[target + component] = copy[source + component] ?? 0;
    }
  }
}

function readCompactCameraFrames(reader: BinaryReader): VmdCameraFrame[] {
  const cameraCount = readOptionalCount(reader, "camera");
  const cameraFrames: VmdCameraFrame[] = [];
  for (let index = 0; index < cameraCount; index += 1) {
    cameraFrames.push({
      frame: reader.u32(),
      distance: reader.f32(),
      position: readVec3(reader),
      rotation: readVec3(reader),
      interpolation: readCameraInterpolation(reader.bytes(24)),
      fov: reader.u32(),
      perspective: reader.u8() === 0
    });
  }
  sortFrames(cameraFrames);
  return cameraFrames;
}

function readCompactLightFrames(reader: BinaryReader): VmdLightFrame[] {
  const lightCount = readOptionalCount(reader, "light");
  const lightFrames: VmdLightFrame[] = [];
  for (let index = 0; index < lightCount; index += 1) {
    lightFrames.push({
      frame: reader.u32(),
      color: readVec3(reader),
      direction: readVec3(reader)
    });
  }
  sortFrames(lightFrames);
  return lightFrames;
}

function readCompactSelfShadowFrames(reader: BinaryReader): VmdSelfShadowFrame[] {
  const selfShadowCount = readOptionalTailCount(reader, "self-shadow");
  const selfShadowFrames: VmdSelfShadowFrame[] = [];
  for (let index = 0; index < selfShadowCount; index += 1) {
    selfShadowFrames.push({
      frame: reader.u32(),
      mode: reader.u8(),
      distance: reader.f32()
    });
  }
  sortFrames(selfShadowFrames);
  return selfShadowFrames;
}

function readCompactPropertyFrames(reader: BinaryReader): VmdPropertyFrame[] {
  const propertyCount = readOptionalTailCount(reader, "property");
  const propertyLayout = selectPropertyFrameLayout(reader, propertyCount);
  const propertyFrames: VmdPropertyFrame[] = [];
  for (let index = 0; index < propertyCount; index += 1) {
    const frame = reader.u32();
    const visible = reader.u8() !== 0;
    const physicsSimulation =
      propertyLayout === "extendedPhysics" ? reader.u8() !== 0 : true;
    const ikCount = readCount(reader, "property IK state");
    const ikStates: VmdIkState[] = [];
    for (let ikIndex = 0; ikIndex < ikCount; ikIndex += 1) {
      ikStates.push({
        boneName: readFixedText(reader, 20, shiftJisDecoder),
        enabled: reader.u8() !== 0
      });
    }
    propertyFrames.push({ frame, visible, physicsSimulation, ikStates });
  }
  sortFrames(propertyFrames);
  return propertyFrames;
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

function readOptionalCount(reader: BinaryReader, label: string): number {
  if (reader.remaining === 0) {
    return 0;
  }
  return readCount(reader, label);
}

function readOptionalTailCount(reader: BinaryReader, label: string): number {
  if (reader.remaining === 0) {
    return 0;
  }
  if (reader.remaining < 4) {
    return readCount(reader, label);
  }
  const offset = reader.offset;
  const count = reader.u32();
  if (count > maxVmdSectionCount) {
    reader.offset = offset;
    return 0;
  }
  return count;
}

type VmdPropertyFrameLayout = "classic" | "extendedPhysics";

function selectPropertyFrameLayout(
  reader: BinaryReader,
  count: number
): VmdPropertyFrameLayout {
  if (count === 0) {
    return "classic";
  }
  const classicEnd = scanPropertyFrameLayout(reader, count, "classic");
  const extendedEnd = scanPropertyFrameLayout(reader, count, "extendedPhysics");
  if (extendedEnd === undefined) {
    return "classic";
  }
  if (classicEnd === undefined) {
    return "extendedPhysics";
  }
  const byteLength = reader.view.byteLength;
  return byteLength - extendedEnd < byteLength - classicEnd ? "extendedPhysics" : "classic";
}

function scanPropertyFrameLayout(
  reader: BinaryReader,
  count: number,
  layout: VmdPropertyFrameLayout
): number | undefined {
  const startOffset = reader.offset;
  try {
    for (let index = 0; index < count; index += 1) {
      reader.skip(5);
      if (layout === "extendedPhysics") {
        reader.skip(1);
      }
      const ikCount = readCount(reader, "property IK state");
      reader.skip(ikCount * 21);
    }
    return reader.offset;
  } catch {
    return undefined;
  } finally {
    reader.offset = startOffset;
  }
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

function readBonePhysicsToggle(bytes: Uint8Array): number | undefined {
  const physicsInfo = ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
  if (physicsInfo === 0x0000) {
    return 1;
  }
  if (physicsInfo === 0x630f) {
    return 0;
  }
  return undefined;
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
