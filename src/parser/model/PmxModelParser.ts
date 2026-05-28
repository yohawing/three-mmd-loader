import { BinaryReader } from "../binary/index.js";
import { createModelDiagnostics } from "./diagnostics.js";
import { sanitizeNonFiniteModelNormals } from "./normalSanitization.js";
import type {
  Diagnostic,
  GeometryBuffers,
  DisplayFrameData,
  MaterialInfo,
  ModelMetadata,
  MorphData,
  JointData,
  RigidBodyData,
  SoftBodyData,
  SkeletonData
} from "./modelTypes.js";

interface PmxIndexSizes {
  vertex: number;
  texture: number;
  material: number;
  bone: number;
  morph: number;
  rigidBody: number;
}

export interface ParsedPmx {
  metadata: ModelMetadata;
  geometry: GeometryBuffers;
  materials: MaterialInfo[];
  skeleton: SkeletonData;
  morphs: MorphData[];
  displayFrames: DisplayFrameData[];
  rigidBodies: RigidBodyData[];
  joints: JointData[];
  softBodies: SoftBodyData[];
}

const textDecoders = {
  "utf-8": new TextDecoder("utf-8"),
  "utf-16-le": new TextDecoder("utf-16le")
};
const maxPmxSectionCount = 10_000_000;
const PMX_BONE_FLAG_INDEXED_TAIL = 0x0001;
const PMX_BONE_FLAG_ROTATABLE = 0x0002;
const PMX_BONE_FLAG_TRANSLATABLE = 0x0004;
const PMX_BONE_FLAG_VISIBLE = 0x0008;
const PMX_BONE_FLAG_ENABLED = 0x0010;
const PMX_BONE_FLAG_IK = 0x0020;
const PMX_BONE_FLAG_APPEND_LOCAL = 0x0080;
const PMX_BONE_FLAG_APPEND_ROTATE = 0x0100;
const PMX_BONE_FLAG_APPEND_TRANSLATE = 0x0200;
const PMX_BONE_FLAG_FIXED_AXIS = 0x0400;
const PMX_BONE_FLAG_LOCAL_AXIS = 0x0800;
const PMX_BONE_FLAG_TRANSFORM_AFTER_PHYSICS = 0x1000;
const PMX_BONE_FLAG_EXTERNAL_PARENT_TRANSFORM = 0x2000;

export function parsePmx(bytes: Uint8Array, options: { skipGeometry?: boolean } = {}): ParsedPmx {
  const reader = new BinaryReader(bytes);
  const signature = textDecoders["utf-8"].decode(reader.bytes(4));
  if (signature !== "PMX ") {
    throw new Error(`Invalid PMX signature: ${JSON.stringify(signature)}`);
  }

  const version = reader.f32();
  const headerSize = reader.u8();
  if (headerSize < 8) {
    throw new Error(`Unsupported PMX header size: ${headerSize}`);
  }

  const encodingByte = reader.u8();
  const encoding = encodingByte === 0 ? "utf-16-le" : encodingByte === 1 ? "utf-8" : "unknown";
  if (encoding === "unknown") {
    throw new Error(`Unsupported PMX text encoding byte: ${encodingByte}`);
  }

  const additionalUvCount = reader.u8();
  const indexSizes: PmxIndexSizes = {
    vertex: reader.u8(),
    texture: reader.u8(),
    material: reader.u8(),
    bone: reader.u8(),
    morph: reader.u8(),
    rigidBody: reader.u8()
  };
  if (headerSize > 8) {
    reader.skip(headerSize - 8);
  }

  const readText = (): string => {
    const byteLength = reader.i32();
    if (byteLength < 0) {
      throw new Error(`Invalid PMX text length: ${byteLength}`);
    }
    const raw = reader.bytes(byteLength);
    return textDecoders[encoding].decode(raw);
  };

  const name = readText();
  const englishName = readText();
  const comment = readText();
  const englishComment = readText();

  const vertexCount = readCount(reader, "vertex", {
    remainingBytesPerEntry: minimumPmxVertexByteLength(additionalUvCount, indexSizes.bone)
  });
  const skipGeometry = options.skipGeometry === true;
  const {
    positions,
    normals,
    uvs,
    additionalUvs,
    skinIndices,
    skinWeights,
    edgeScale,
    sdef,
    sdefVertexCount
  } = skipGeometry
    ? skipVerticesWithBoneIndexSizeFallback(reader, vertexCount, additionalUvCount, indexSizes)
    : readVerticesWithBoneIndexSizeFallback(reader, vertexCount, additionalUvCount, indexSizes);

  const indexCount = readCount(reader, "vertex index", {
    remainingBytesPerEntry: indexSizes.vertex
  });
  const indices = skipGeometry
    ? new Uint16Array(0)
    : vertexCount > 65535
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount);
  if (skipGeometry) {
    reader.skip(indexCount * indexSizes.vertex);
  } else {
    for (let i = 0; i < indexCount; i++) {
      indices[i] = readVertexIndex(reader, indexSizes.vertex);
    }
  }

  const textureCount = readCount(reader, "texture", { remainingBytesPerEntry: 4 });
  const textures: string[] = [];
  for (let i = 0; i < textureCount; i++) {
    textures.push(readText());
  }

  const materialCount = readCount(reader, "material");
  const materials: MaterialInfo[] = [];
  for (let i = 0; i < materialCount; i++) {
    materials.push(readMaterial(reader, readText, indexSizes, textures));
  }

  const boneCount = readCount(reader, "bone");
  const skeleton: SkeletonData = { bones: [] };
  for (let i = 0; i < boneCount; i++) {
    skeleton.bones.push(readBone(reader, readText, indexSizes));
  }

  const morphCount = readCount(reader, "morph");
  const morphs: MorphData[] = [];
  for (let i = 0; i < morphCount; i++) {
    morphs.push(readMorph(reader, readText, indexSizes));
  }

  const displayFrameCount = readCount(reader, "display frame");
  const displayFrames: DisplayFrameData[] = [];
  for (let i = 0; i < displayFrameCount; i++) {
    displayFrames.push(readDisplayFrame(reader, readText, indexSizes));
  }

  const rigidBodyCount = reader.remaining >= 4 ? readCount(reader, "rigid body") : 0;
  const rigidBodies: RigidBodyData[] = [];
  for (let i = 0; i < rigidBodyCount; i++) {
    rigidBodies.push(readRigidBody(reader, readText, indexSizes));
  }

  const jointCount = reader.remaining >= 4 ? readCount(reader, "joint") : 0;
  const joints: JointData[] = [];
  for (let i = 0; i < jointCount; i++) {
    joints.push(readJoint(reader, readText, indexSizes));
  }

  const softBodies =
    version >= 2.05 && reader.remaining >= 4 ? readSoftBodies(reader, readText, indexSizes) : [];
  const softBodyCount = softBodies.length;

  const diagnostics = createModelDiagnostics(
    materials,
    morphs,
    skeleton,
    rigidBodies,
    joints,
    displayFrames
  );
  if (sdefVertexCount > 0) {
    diagnostics.push({
      level: "warning",
      code: "SDEF_SKINNING_FALLBACK",
      message: `${sdefVertexCount} PMX SDEF vertices preserved SDEF parameters but are currently rendered with BDEF2-compatible weights.`
    });
  }
  if (softBodyCount > 0) {
    diagnostics.push({
      level: "warning",
      code: "PMX_SOFT_BODY_UNSUPPORTED",
      message: `${softBodyCount} PMX soft bodies are parsed but are not simulated by the current runtime.`
    });
    diagnostics.push(
      ...createSoftBodyDiagnostics(softBodies, materialCount, vertexCount, rigidBodyCount)
    );
  }
  if (reader.remaining > 0) {
    diagnostics.push({
      level: "warning",
      code: "PMX_TRAILING_DATA_UNPARSED",
      message: `${reader.remaining} trailing PMX bytes were left unparsed.`
    });
  }
  if (!skipGeometry) {
    sanitizeNonFiniteModelNormals(positions, normals, indices, diagnostics);
  }

  return {
    metadata: {
      format: "pmx",
      version,
      encoding,
      name,
      englishName,
      comment,
      englishComment,
      counts: {
        vertices: vertexCount,
        faces: indexCount / 3,
        materials: materialCount,
        bones: boneCount,
        morphs: morphCount,
        displayFrames: displayFrameCount,
        rigidBodies: rigidBodyCount,
        joints: jointCount,
        softBodies: softBodyCount
      },
      indexSizes,
      additionalUvCount,
      diagnostics
    },
    geometry: {
      positions,
      normals,
      uvs,
      additionalUvs,
      indices,
      edgeScale,
      skinIndices,
      skinWeights,
      sdef: sdefVertexCount > 0 ? sdef : undefined
    },
    materials,
    skeleton,
    morphs,
    displayFrames,
    rigidBodies,
    joints,
    softBodies
  };
}

interface PmxVertexBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  additionalUvs: Float32Array[];
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  edgeScale: Float32Array;
  sdef: NonNullable<GeometryBuffers["sdef"]>;
  sdefVertexCount: number;
}

function readVerticesWithBoneIndexSizeFallback(
  reader: BinaryReader,
  vertexCount: number,
  additionalUvCount: number,
  indexSizes: PmxIndexSizes
): PmxVertexBuffers {
  const startOffset = reader.offset;
  const candidateBoneIndexSizes = uniqueNumbers([indexSizes.bone, 1, 2, 4]);
  let lastError: unknown;

  for (const boneIndexSize of candidateBoneIndexSizes) {
    reader.offset = startOffset;
    const candidateIndexSizes = { ...indexSizes, bone: boneIndexSize };
    const buffers = createPmxVertexBuffers(vertexCount, additionalUvCount);
    try {
      for (let i = 0; i < vertexCount; i++) {
        const weightType = readVertex(
          reader,
          additionalUvCount,
          candidateIndexSizes,
          buffers.positions,
          buffers.normals,
          buffers.uvs,
          buffers.additionalUvs,
          buffers.skinIndices,
          buffers.skinWeights,
          buffers.edgeScale,
          buffers.sdef,
          i
        );
        if (weightType === 3) {
          buffers.sdefVertexCount += 1;
        }
      }
      if (isPostVertexSectionPlausible(reader, indexSizes)) {
        return buffers;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid PMX ")) {
        throw error;
      }
      lastError = error;
    }
  }

  reader.offset = startOffset;
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to read PMX vertex payload");
}

function skipVerticesWithBoneIndexSizeFallback(
  reader: BinaryReader,
  vertexCount: number,
  additionalUvCount: number,
  indexSizes: PmxIndexSizes
): PmxVertexBuffers {
  const startOffset = reader.offset;
  const candidateBoneIndexSizes = uniqueNumbers([indexSizes.bone, 1, 2, 4]);
  let lastError: unknown;

  for (const boneIndexSize of candidateBoneIndexSizes) {
    reader.offset = startOffset;
    const candidateIndexSizes = { ...indexSizes, bone: boneIndexSize };
    try {
      for (let i = 0; i < vertexCount; i++) {
        skipVertex(reader, additionalUvCount, candidateIndexSizes);
      }
      if (isPostVertexSectionPlausible(reader, indexSizes)) {
        return createSkippedPmxVertexBuffers();
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid PMX ")) {
        throw error;
      }
      lastError = error;
    }
  }

  reader.offset = startOffset;
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to read PMX vertex payload");
}

function readCount(
  reader: BinaryReader,
  label: string,
  options: { readonly remainingBytesPerEntry?: number } = {}
): number {
  const count = reader.i32();
  validateCount(count, `PMX ${label}`, reader.remaining, options.remainingBytesPerEntry);
  return count;
}

function validateCount(
  count: number,
  label: string,
  remaining: number,
  remainingBytesPerEntry: number | undefined
): void {
  if (count < 0 || count > maxPmxSectionCount) {
    throw new Error(`Invalid ${label} count: ${count}`);
  }
  if (remainingBytesPerEntry === undefined) {
    return;
  }
  const minimumByteLength = count * remainingBytesPerEntry;
  if (!Number.isSafeInteger(minimumByteLength) || minimumByteLength > remaining) {
    throw new Error(`Invalid ${label} count: ${count}`);
  }
}

function minimumPmxVertexByteLength(additionalUvCount: number, boneIndexSize: number): number {
  return 3 * 4 + 3 * 4 + 2 * 4 + additionalUvCount * 4 * 4 + 1 + boneIndexSize + 4;
}

function createPmxVertexBuffers(
  vertexCount: number,
  additionalUvCount: number
): PmxVertexBuffers {
  return {
    positions: new Float32Array(vertexCount * 3),
    normals: new Float32Array(vertexCount * 3),
    uvs: new Float32Array(vertexCount * 2),
    additionalUvs: Array.from(
      { length: additionalUvCount },
      () => new Float32Array(vertexCount * 4)
    ),
    skinIndices: new Uint16Array(vertexCount * 4),
    skinWeights: new Float32Array(vertexCount * 4),
    edgeScale: new Float32Array(vertexCount),
    sdef: {
      enabled: new Float32Array(vertexCount),
      c: new Float32Array(vertexCount * 3),
      r0: new Float32Array(vertexCount * 3),
      r1: new Float32Array(vertexCount * 3),
      rw0: new Float32Array(vertexCount * 3),
      rw1: new Float32Array(vertexCount * 3)
    },
    sdefVertexCount: 0
  };
}

function createSkippedPmxVertexBuffers(): PmxVertexBuffers {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    additionalUvs: [],
    skinIndices: new Uint16Array(0),
    skinWeights: new Float32Array(0),
    edgeScale: new Float32Array(0),
    sdef: {
      enabled: new Float32Array(0),
      c: new Float32Array(0),
      r0: new Float32Array(0),
      r1: new Float32Array(0),
      rw0: new Float32Array(0),
      rw1: new Float32Array(0)
    },
    sdefVertexCount: 0
  };
}

function skipVertex(
  reader: BinaryReader,
  additionalUvCount: number,
  sizes: PmxIndexSizes
): void {
  reader.skip(3 * 4 + 3 * 4 + 2 * 4 + additionalUvCount * 4 * 4);
  const weightType = reader.u8();
  switch (weightType) {
    case 0:
      reader.skip(sizes.bone);
      break;
    case 1:
      reader.skip(sizes.bone * 2 + 4);
      break;
    case 2:
    case 4:
      reader.skip(sizes.bone * 4 + 4 * 4);
      break;
    case 3:
      reader.skip(sizes.bone * 2 + 4 + 3 * 4 + 3 * 4 + 3 * 4);
      break;
    default:
      throw new Error(`Unsupported PMX vertex weight type: ${weightType}`);
  }
  reader.skip(4);
}

function readVertex(
  reader: BinaryReader,
  additionalUvCount: number,
  sizes: PmxIndexSizes,
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  additionalUvs: Float32Array[],
  skinIndices: Uint16Array,
  skinWeights: Float32Array,
  edgeScale: Float32Array,
  sdef: NonNullable<GeometryBuffers["sdef"]>,
  index: number
): number {
  const positionOffset = index * 3;
  positions[positionOffset] = reader.f32();
  positions[positionOffset + 1] = reader.f32();
  positions[positionOffset + 2] = reader.f32();
  normals[positionOffset] = reader.f32();
  normals[positionOffset + 1] = reader.f32();
  normals[positionOffset + 2] = reader.f32();
  const uvOffset = index * 2;
  uvs[uvOffset] = reader.f32();
  uvs[uvOffset + 1] = reader.f32();
  for (let i = 0; i < additionalUvCount; i++) {
    const additionalUvOffset = index * 4;
    const target = additionalUvs[i];
    target[additionalUvOffset] = reader.f32();
    target[additionalUvOffset + 1] = reader.f32();
    target[additionalUvOffset + 2] = reader.f32();
    target[additionalUvOffset + 3] = reader.f32();
  }
  const skinOffset = index * 4;
  const weightType = reader.u8();
  switch (weightType) {
    case 0:
      skinIndices[skinOffset] = normalizeIndex(reader.index(sizes.bone));
      skinWeights[skinOffset] = 1;
      break;
    case 1:
    case 3: {
      skinIndices[skinOffset] = normalizeIndex(reader.index(sizes.bone));
      skinIndices[skinOffset + 1] = normalizeIndex(reader.index(sizes.bone));
      const weight = reader.f32();
      skinWeights[skinOffset] = weight;
      skinWeights[skinOffset + 1] = 1 - weight;
      if (weightType === 3) {
        readSdefParameters(reader, sdef, index, weight);
      }
      break;
    }
    case 2:
    case 4:
      for (let i = 0; i < 4; i++) {
        skinIndices[skinOffset + i] = normalizeIndex(reader.index(sizes.bone));
      }
      for (let i = 0; i < 4; i++) {
        skinWeights[skinOffset + i] = reader.f32();
      }
      break;
    default:
      throw new Error(`Unsupported PMX vertex weight type: ${weightType}`);
  }
  edgeScale[index] = reader.f32();
  return weightType;
}

function isPostVertexSectionPlausible(reader: BinaryReader, indexSizes: PmxIndexSizes): boolean {
  const vertexIndexCount = peekI32(reader, reader.offset);
  if (vertexIndexCount === undefined || vertexIndexCount < 0) {
    return false;
  }
  if (vertexIndexCount > maxPmxSectionCount) {
    throw new Error(`Invalid PMX vertex index count: ${vertexIndexCount}`);
  }

  const vertexIndexBytes = vertexIndexCount * indexSizes.vertex;
  if (!Number.isSafeInteger(vertexIndexBytes)) {
    return false;
  }

  const textureCountOffset = reader.offset + 4 + vertexIndexBytes;
  const textureCount = peekI32(reader, textureCountOffset);
  if (textureCount === undefined || textureCount < 0) {
    return false;
  }
  if (textureCount > maxPmxSectionCount) {
    throw new Error(`Invalid PMX texture count: ${textureCount}`);
  }

  const remainingAfterTextureCount = reader.view.byteLength - (textureCountOffset + 4);
  return textureCount * 4 <= remainingAfterTextureCount;
}

function peekI32(reader: BinaryReader, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > reader.view.byteLength) {
    return undefined;
  }
  return reader.view.getInt32(offset, true);
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function readSdefParameters(
  reader: BinaryReader,
  sdef: NonNullable<GeometryBuffers["sdef"]>,
  vertexIndex: number,
  boneWeight0: number
): void {
  const c = readVec3(reader);
  const r0 = readVec3(reader);
  const r1 = readVec3(reader);
  const offset = vertexIndex * 3;
  sdef.enabled[vertexIndex] = 1;
  sdef.c.set(c, offset);
  sdef.r0.set(r0, offset);
  sdef.r1.set(r1, offset);

  const boneWeight1 = 1 - boneWeight0;
  const rw: [number, number, number] = [
    r0[0] * boneWeight0 + r1[0] * boneWeight1,
    r0[1] * boneWeight0 + r1[1] * boneWeight1,
    r0[2] * boneWeight0 + r1[2] * boneWeight1
  ];
  const adjustedR0: [number, number, number] = [
    c[0] + r0[0] - rw[0],
    c[1] + r0[1] - rw[1],
    c[2] + r0[2] - rw[2]
  ];
  const adjustedR1: [number, number, number] = [
    c[0] + r1[0] - rw[0],
    c[1] + r1[1] - rw[1],
    c[2] + r1[2] - rw[2]
  ];
  sdef.rw0.set(
    [(c[0] + adjustedR0[0]) * 0.5, (c[1] + adjustedR0[1]) * 0.5, (c[2] + adjustedR0[2]) * 0.5],
    offset
  );
  sdef.rw1.set(
    [(c[0] + adjustedR1[0]) * 0.5, (c[1] + adjustedR1[1]) * 0.5, (c[2] + adjustedR1[2]) * 0.5],
    offset
  );
}

function normalizeIndex(index: number): number {
  return index < 0 ? 0 : index;
}

function readVertexIndex(reader: BinaryReader, size: number): number {
  switch (size) {
    case 1:
      return reader.u8();
    case 2:
      return reader.u16();
    case 4:
      return reader.i32();
    default:
      throw new Error(`Unsupported PMX vertex index size: ${size}`);
  }
}

function readMaterial(
  reader: BinaryReader,
  readText: () => string,
  sizes: PmxIndexSizes,
  textures: readonly string[]
): MaterialInfo {
  const name = readText();
  const englishName = readText();
  const diffuse: [number, number, number, number] = [
    reader.f32(),
    reader.f32(),
    reader.f32(),
    reader.f32()
  ];
  const specular: [number, number, number] = [reader.f32(), reader.f32(), reader.f32()];
  const specularPower = reader.f32();
  const ambient: [number, number, number] = [reader.f32(), reader.f32(), reader.f32()];
  const flagBits = reader.u8();
  const edgeColor: [number, number, number, number] = [
    reader.f32(),
    reader.f32(),
    reader.f32(),
    reader.f32()
  ];
  const edgeSize = reader.f32();
  const textureIndex = reader.index(sizes.texture);
  const sphereTextureIndex = reader.index(sizes.texture);
  const sphereMode = reader.u8();
  const toonFlag = reader.u8();
  const toonTextureIndex = toonFlag === 0 ? reader.index(sizes.texture) : -1;
  const sharedToonIndex = toonFlag === 0 ? undefined : reader.u8();
  readText();
  const faceCount = reader.i32() / 3;
  return {
    name,
    englishName,
    texturePath: textureIndex >= 0 ? (textures[textureIndex] ?? "") : "",
    sphereTexturePath: sphereTextureIndex >= 0 ? (textures[sphereTextureIndex] ?? "") : "",
    sphereMode: toSphereMode(sphereMode),
    toonTexturePath: toonTextureIndex >= 0 ? (textures[toonTextureIndex] ?? "") : "",
    sharedToonIndex,
    diffuse,
    specular,
    specularPower,
    ambient,
    edgeColor,
    edgeSize,
    flags: parseMaterialFlags(flagBits),
    faceCount
  };
}

function parseMaterialFlags(bits: number): MaterialInfo["flags"] {
  return {
    doubleSided: (bits & 0x01) !== 0,
    groundShadow: (bits & 0x02) !== 0,
    selfShadowMap: (bits & 0x04) !== 0,
    selfShadow: (bits & 0x08) !== 0,
    edge: (bits & 0x10) !== 0,
    vertexColor: (bits & 0x20) !== 0,
    pointDraw: (bits & 0x40) !== 0,
    lineDraw: (bits & 0x80) !== 0
  };
}

function toSphereMode(mode: number): MaterialInfo["sphereMode"] {
  switch (mode) {
    case 1:
      return "multiply";
    case 2:
      return "add";
    case 3:
      return "subTexture";
    default:
      return "none";
  }
}

function readBone(reader: BinaryReader, readText: () => string, sizes: PmxIndexSizes) {
  const name = readText();
  const englishName = readText();
  const position: [number, number, number] = [reader.f32(), reader.f32(), reader.f32()];
  const parentIndex = reader.index(sizes.bone);
  const layer = reader.i32();
  const flagBits = reader.u16();
  const flags = parseBoneFlags(flagBits);
  const tailIndex = flags.indexedTail ? reader.index(sizes.bone) : -1;
  const tailPosition = flags.indexedTail ? undefined : readVec3(reader);
  const appendTransform =
    flags.appendRotate || flags.appendTranslate
      ? {
          parentIndex: reader.index(sizes.bone),
          weight: reader.f32()
        }
      : undefined;
  const fixedAxis = flags.fixedAxis ? readVec3(reader) : undefined;
  const localAxis = flags.localAxis
    ? {
        x: readVec3(reader),
        z: readVec3(reader)
      }
    : undefined;
  const externalParentKey = flags.externalParentTransform ? reader.i32() : undefined;
  const ik = flags.ik
    ? {
        targetIndex: reader.index(sizes.bone),
        loopCount: reader.i32(),
        limitAngle: reader.f32(),
        links: readIkLinks(reader, sizes)
      }
    : undefined;

  return {
    name,
    englishName,
    parentIndex,
    layer,
    position,
    tailIndex,
    tailPosition,
    flags,
    appendTransform,
    fixedAxis,
    localAxis,
    externalParentKey,
    ik
  };
}

function parseBoneFlags(bits: number) {
  return {
    indexedTail: (bits & PMX_BONE_FLAG_INDEXED_TAIL) !== 0,
    rotatable: (bits & PMX_BONE_FLAG_ROTATABLE) !== 0,
    translatable: (bits & PMX_BONE_FLAG_TRANSLATABLE) !== 0,
    visible: (bits & PMX_BONE_FLAG_VISIBLE) !== 0,
    enabled: (bits & PMX_BONE_FLAG_ENABLED) !== 0,
    ik: (bits & PMX_BONE_FLAG_IK) !== 0,
    appendLocal: (bits & PMX_BONE_FLAG_APPEND_LOCAL) !== 0,
    appendRotate: (bits & PMX_BONE_FLAG_APPEND_ROTATE) !== 0,
    appendTranslate: (bits & PMX_BONE_FLAG_APPEND_TRANSLATE) !== 0,
    fixedAxis: (bits & PMX_BONE_FLAG_FIXED_AXIS) !== 0,
    localAxis: (bits & PMX_BONE_FLAG_LOCAL_AXIS) !== 0,
    transformAfterPhysics: (bits & PMX_BONE_FLAG_TRANSFORM_AFTER_PHYSICS) !== 0,
    externalParentTransform: (bits & PMX_BONE_FLAG_EXTERNAL_PARENT_TRANSFORM) !== 0
  };
}

function readVec3(reader: BinaryReader): [number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32()];
}

function readVec4(reader: BinaryReader): [number, number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32(), reader.f32()];
}

function readIkLinks(reader: BinaryReader, sizes: PmxIndexSizes) {
  const linkCount = readCount(reader, "IK link");
  const links = [];
  for (let i = 0; i < linkCount; i++) {
    const boneIndex = reader.index(sizes.bone);
    const hasLimit = reader.u8();
    links.push({
      boneIndex,
      limits:
        hasLimit !== 0
          ? {
              lower: readVec3(reader),
              upper: readVec3(reader)
            }
          : undefined
    });
  }
  return links;
}

function readMorph(reader: BinaryReader, readText: () => string, sizes: PmxIndexSizes): MorphData {
  const name = readText();
  const englishName = readText();
  reader.skip(1);
  const type = reader.u8();
  const count = readCount(reader, "morph offset");
  const morph: MorphData = {
    name,
    englishName,
    type: toMorphType(type),
    vertexOffsets: [],
    groupOffsets: [],
    boneOffsets: [],
    uvOffsets: [],
    additionalUvOffsets: [],
    materialOffsets: [],
    flipOffsets: [],
    impulseOffsets: []
  };
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 0:
        morph.groupOffsets.push({
          morphIndex: reader.index(sizes.morph),
          weight: reader.f32()
        });
        break;
      case 1: {
        const vertexIndex = readVertexIndex(reader, sizes.vertex);
        morph.vertexOffsets.push({
          vertexIndex,
          position: [reader.f32(), reader.f32(), reader.f32()]
        });
        break;
      }
      case 2:
        morph.boneOffsets.push({
          boneIndex: reader.index(sizes.bone),
          translation: readVec3(reader),
          rotation: readVec4(reader)
        });
        break;
      case 3:
        morph.uvOffsets.push({
          vertexIndex: readVertexIndex(reader, sizes.vertex),
          uv: readVec4(reader)
        });
        break;
      case 4:
      case 5:
      case 6:
      case 7:
        morph.additionalUvOffsets.push({
          vertexIndex: readVertexIndex(reader, sizes.vertex),
          uvIndex: type - 4,
          uv: readVec4(reader)
        });
        break;
      case 8:
        morph.materialOffsets.push({
          materialIndex: reader.index(sizes.material),
          operation: reader.u8() === 0 ? "multiply" : "add",
          diffuse: readVec4(reader),
          specular: readVec3(reader),
          specularPower: reader.f32(),
          ambient: readVec3(reader),
          edgeColor: readVec4(reader),
          edgeSize: reader.f32(),
          textureFactor: readVec4(reader),
          sphereTextureFactor: readVec4(reader),
          toonTextureFactor: readVec4(reader)
        });
        break;
      case 9:
        morph.flipOffsets?.push({
          morphIndex: reader.index(sizes.morph),
          weight: reader.f32()
        });
        break;
      case 10:
        morph.impulseOffsets?.push({
          rigidBodyIndex: reader.index(sizes.rigidBody),
          local: reader.u8() === 1,
          velocity: readVec3(reader),
          torque: readVec3(reader)
        });
        break;
      default:
        throw new Error(`Unsupported PMX morph type: ${type}`);
    }
  }
  return morph;
}

function toMorphType(type: number): MorphData["type"] {
  switch (type) {
    case 0:
      return "group";
    case 1:
      return "vertex";
    case 2:
      return "bone";
    case 3:
      return "uv";
    case 4:
    case 5:
    case 6:
    case 7:
      return "additionalUv";
    case 8:
      return "material";
    case 9:
      return "flip";
    case 10:
      return "impulse";
    default:
      return "unknown";
  }
}

function readDisplayFrame(
  reader: BinaryReader,
  readText: () => string,
  sizes: PmxIndexSizes
): DisplayFrameData {
  const name = readText();
  const englishName = readText();
  const special = reader.u8() === 1;
  const count = readCount(reader, "display frame entry");
  const frames: DisplayFrameData["frames"] = [];
  for (let i = 0; i < count; i++) {
    const type = reader.u8();
    frames.push({
      type: type === 0 ? "bone" : type === 1 ? "morph" : "unknown",
      index: reader.index(type === 0 ? sizes.bone : sizes.morph)
    });
  }
  return { name, englishName, special, frames };
}

function readRigidBody(
  reader: BinaryReader,
  readText: () => string,
  sizes: PmxIndexSizes
): RigidBodyData {
  return {
    name: readText(),
    englishName: readText(),
    boneIndex: reader.index(sizes.bone),
    group: reader.u8(),
    mask: reader.u16(),
    shape: toRigidBodyShape(reader.u8()),
    size: readVec3(reader),
    position: readVec3(reader),
    rotation: readVec3(reader),
    mass: reader.f32(),
    linearDamping: reader.f32(),
    angularDamping: reader.f32(),
    restitution: reader.f32(),
    friction: reader.f32(),
    mode: toRigidBodyMode(reader.u8())
  };
}

function readJoint(reader: BinaryReader, readText: () => string, sizes: PmxIndexSizes): JointData {
  return {
    name: readText(),
    englishName: readText(),
    type: toJointType(reader.u8()),
    rigidBodyIndexA: reader.index(sizes.rigidBody),
    rigidBodyIndexB: reader.index(sizes.rigidBody),
    position: readVec3(reader),
    rotation: readVec3(reader),
    translationLowerLimit: readVec3(reader),
    translationUpperLimit: readVec3(reader),
    rotationLowerLimit: readVec3(reader),
    rotationUpperLimit: readVec3(reader),
    springTranslationFactor: readVec3(reader),
    springRotationFactor: readVec3(reader)
  };
}

function readSoftBodies(
  reader: BinaryReader,
  readText: () => string,
  sizes: PmxIndexSizes
): SoftBodyData[] {
  const count = readCount(reader, "soft body");
  const softBodies: SoftBodyData[] = [];
  for (let i = 0; i < count; i++) {
    softBodies.push({
      name: readText(),
      englishName: readText(),
      type: toSoftBodyType(reader.u8()),
      materialIndex: reader.index(sizes.material),
      collisionGroup: reader.u8(),
      collisionMask: reader.u16(),
      flags: reader.u8(),
      bendingConstraintsDistance: reader.i32(),
      clusterCount: reader.i32(),
      totalMass: reader.f32(),
      collisionMargin: reader.f32(),
      aeroModel: toSoftBodyAeroModel(reader.i32()),
      config: {
        velocityCorrectionFactor: reader.f32(),
        dampingCoefficient: reader.f32(),
        dragCoefficient: reader.f32(),
        liftCoefficient: reader.f32(),
        pressureCoefficient: reader.f32(),
        volumeConversationCoefficient: reader.f32(),
        dynamicFrictionCoefficient: reader.f32(),
        poseMatchingCoefficient: reader.f32(),
        rigidContactHardness: reader.f32(),
        kineticContactHardness: reader.f32(),
        softContactHardness: reader.f32(),
        anchorHardness: reader.f32()
      },
      cluster: {
        softVsRigidHardness: reader.f32(),
        softVsKineticHardness: reader.f32(),
        softVsSoftHardness: reader.f32(),
        softVsRigidImpulseSplit: reader.f32(),
        softVsKineticImpulseSplit: reader.f32(),
        softVsSoftImpulseSplit: reader.f32()
      },
      iteration: {
        velocity: reader.i32(),
        position: reader.i32(),
        drift: reader.i32(),
        cluster: reader.i32()
      },
      material: {
        linearStiffnessCoefficient: reader.f32(),
        angularStiffnessCoefficient: reader.f32(),
        volumeStiffnessCoefficient: reader.f32()
      },
      anchors: readSoftBodyAnchors(reader, sizes),
      pinnedVertexIndices: readSoftBodyPinnedVertexIndices(reader, sizes)
    });
  }
  return softBodies;
}

function readSoftBodyAnchors(reader: BinaryReader, sizes: PmxIndexSizes): SoftBodyData["anchors"] {
  const count = readCount(reader, "soft body anchor");
  const anchors: SoftBodyData["anchors"] = [];
  for (let i = 0; i < count; i++) {
    anchors.push({
      rigidBodyIndex: reader.index(sizes.rigidBody),
      vertexIndex: readVertexIndex(reader, sizes.vertex),
      nearMode: reader.u8() !== 0
    });
  }
  return anchors;
}

function readSoftBodyPinnedVertexIndices(reader: BinaryReader, sizes: PmxIndexSizes): number[] {
  const count = readCount(reader, "soft body pinned vertex");
  const vertexIndices: number[] = [];
  for (let i = 0; i < count; i++) {
    vertexIndices.push(readVertexIndex(reader, sizes.vertex));
  }
  return vertexIndices;
}

function toSoftBodyType(value: number): SoftBodyData["type"] {
  switch (value) {
    case 0:
      return "triMesh";
    case 1:
      return "rope";
    default:
      return "unknown";
  }
}

function toSoftBodyAeroModel(value: number): SoftBodyData["aeroModel"] {
  switch (value) {
    case 0:
      return "vertexPoint";
    case 1:
      return "vertexTwoSided";
    case 2:
      return "vertexOneSided";
    case 3:
      return "faceTwoSided";
    case 4:
      return "faceOneSided";
    default:
      return "unknown";
  }
}

function createSoftBodyDiagnostics(
  softBodies: readonly SoftBodyData[],
  materialCount: number,
  vertexCount: number,
  rigidBodyCount: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (
    softBodies.some((softBody) => softBody.type === "unknown" || softBody.aeroModel === "unknown")
  ) {
    diagnostics.push({
      level: "warning",
      code: "PMX_SOFT_BODY_TYPE_UNSUPPORTED",
      message:
        "Unknown PMX soft-body type or aero model values were parsed but cannot be simulated by the current runtime."
    });
  }
  for (const [softBodyIndex, softBody] of softBodies.entries()) {
    pushSoftBodyReferenceDiagnostic(
      diagnostics,
      softBody.materialIndex,
      materialCount,
      `soft body ${softBodyIndex} material`,
      "material"
    );
    for (const [anchorIndex, anchor] of softBody.anchors.entries()) {
      pushSoftBodyReferenceDiagnostic(
        diagnostics,
        anchor.rigidBodyIndex,
        rigidBodyCount,
        `soft body ${softBodyIndex} anchor ${anchorIndex} rigid body`,
        "rigid body"
      );
      pushSoftBodyReferenceDiagnostic(
        diagnostics,
        anchor.vertexIndex,
        vertexCount,
        `soft body ${softBodyIndex} anchor ${anchorIndex} vertex`,
        "vertex"
      );
    }
    for (const [pinnedIndex, pinnedVertexIndex] of softBody.pinnedVertexIndices.entries()) {
      pushSoftBodyReferenceDiagnostic(
        diagnostics,
        pinnedVertexIndex,
        vertexCount,
        `soft body ${softBodyIndex} pinned vertex ${pinnedIndex}`,
        "vertex"
      );
    }
  }
  return diagnostics;
}

function pushSoftBodyReferenceDiagnostic(
  diagnostics: Diagnostic[],
  index: number,
  count: number,
  owner: string,
  label: string
): void {
  if (index < 0) {
    return;
  }
  if (index >= count) {
    diagnostics.push({
      level: "warning",
      code: "PMX_SOFT_BODY_REFERENCE_INVALID",
      message: `${owner} references ${label} index ${index}, but only ${count} ${label} entries exist.`
    });
  }
}

function toRigidBodyShape(value: number): RigidBodyData["shape"] {
  switch (value) {
    case 0:
      return "sphere";
    case 1:
      return "box";
    case 2:
      return "capsule";
    default:
      return "unknown";
  }
}

function toRigidBodyMode(value: number): RigidBodyData["mode"] {
  switch (value) {
    case 0:
      return "static";
    case 1:
      return "dynamic";
    case 2:
      return "dynamicBone";
    default:
      return "unknown";
  }
}

function toJointType(value: number): JointData["type"] {
  switch (value) {
    case 0:
      return "generic6dofSpring";
    case 1:
      return "generic6dof";
    case 2:
      return "point2point";
    case 3:
      return "coneTwist";
    case 4:
      return "slider";
    case 5:
      return "hinge";
    default:
      return "unknown";
  }
}
