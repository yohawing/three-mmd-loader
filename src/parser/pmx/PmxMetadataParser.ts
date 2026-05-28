import { BinaryReader, toUint8Array } from "../binary/index.js";

export type PmxTextEncoding = "utf-16-le" | "utf-8";

export interface PmxIndexSizes {
  vertex: number;
  texture: number;
  material: number;
  bone: number;
  morph: number;
  rigidBody: number;
}

export interface PmxHeader {
  version: number;
  encoding: PmxTextEncoding;
  additionalUvCount: number;
  indexSizes: PmxIndexSizes;
}

export interface PmxSectionCounts {
  vertices: number;
  faces: number;
  textures: number;
  materials: number;
  bones: number;
  morphs: number;
  displayFrames: number;
  rigidBodies: number;
  joints: number;
  softBodies: number;
}

export interface PmxMetadata {
  format: "pmx";
  header: PmxHeader;
  name: string;
  englishName: string;
  comment: string;
  englishComment: string;
  counts: PmxSectionCounts;
  trailingBytes: number;
}

export type PmxSectionName =
  | "vertices"
  | "faces"
  | "textures"
  | "materials"
  | "bones"
  | "morphs"
  | "displayFrames"
  | "rigidBodies"
  | "joints"
  | "softBodies";

export interface PmxSectionRange {
  name: PmxSectionName;
  count: number;
  offset: number;
  byteLength: number;
}

export interface PmxSectionInventory {
  format: "pmx";
  header: PmxHeader;
  counts: PmxSectionCounts;
  sections: PmxSectionRange[];
  trailingBytes: number;
}

const utf8Decoder = new TextDecoder("utf-8");
const utf16LeDecoder = new TextDecoder("utf-16le");
const PMX_BONE_FLAG_INDEXED_TAIL = 0x0001;
const PMX_BONE_FLAG_IK = 0x0020;
const PMX_BONE_FLAG_APPEND_ROTATE = 0x0100;
const PMX_BONE_FLAG_APPEND_TRANSLATE = 0x0200;
const PMX_BONE_FLAG_FIXED_AXIS = 0x0400;
const PMX_BONE_FLAG_LOCAL_AXIS = 0x0800;
const PMX_BONE_FLAG_EXTERNAL_PARENT_TRANSFORM = 0x2000;

export function parsePmxMetadata(input: ArrayBuffer | Uint8Array): PmxMetadata {
  return parsePmx(input).metadata;
}

export function parsePmxSectionInventory(input: ArrayBuffer | Uint8Array): PmxSectionInventory {
  return parsePmx(input).inventory;
}

function parsePmx(input: ArrayBuffer | Uint8Array): {
  metadata: PmxMetadata;
  inventory: PmxSectionInventory;
} {
  const reader = new BinaryReader(toUint8Array(input));
  const sections: PmxSectionRange[] = [];
  const signature = utf8Decoder.decode(reader.bytes(4));
  if (signature !== "PMX ") {
    throw new Error(`Invalid PMX signature: ${JSON.stringify(signature)}`);
  }

  const header = readHeader(reader);
  const decodeText = createTextReader(reader, header.encoding);
  const name = decodeText();
  const englishName = decodeText();
  const comment = decodeText();
  const englishComment = decodeText();

  const vertices = readCount(reader, "vertex");
  readVariableSection(reader, sections, "vertices", vertices, () => {
    skipVertices(reader, header, vertices);
  });
  const vertexIndexCount = readCount(reader, "vertex index");
  const faces = readFaceCount(vertexIndexCount, "PMX vertex index");
  readFixedByteSection(
    reader,
    sections,
    "faces",
    faces,
    checkedSectionBytes(vertexIndexCount, header.indexSizes.vertex, "vertex index")
  );

  const textures = readCount(reader, "texture");
  readVariableSection(reader, sections, "textures", textures, () => {
    for (let i = 0; i < textures; i++) {
      decodeText();
    }
  });

  const materials = readCount(reader, "material");
  readVariableSection(reader, sections, "materials", materials, () => {
    for (let i = 0; i < materials; i++) {
      skipMaterial(reader, decodeText, header);
    }
  });

  const bones = readCount(reader, "bone");
  readVariableSection(reader, sections, "bones", bones, () => {
    for (let i = 0; i < bones; i++) {
      skipBone(reader, decodeText, header);
    }
  });

  const morphs = readCount(reader, "morph");
  readVariableSection(reader, sections, "morphs", morphs, () => {
    for (let i = 0; i < morphs; i++) {
      skipMorph(reader, decodeText, header);
    }
  });

  const displayFrames = readCount(reader, "display frame");
  readVariableSection(reader, sections, "displayFrames", displayFrames, () => {
    for (let i = 0; i < displayFrames; i++) {
      skipDisplayFrame(reader, decodeText, header);
    }
  });

  const rigidBodies = readCount(reader, "rigid body");
  readVariableSection(reader, sections, "rigidBodies", rigidBodies, () => {
    for (let i = 0; i < rigidBodies; i++) {
      skipRigidBody(reader, decodeText, header);
    }
  });

  const joints = readCount(reader, "joint");
  readVariableSection(reader, sections, "joints", joints, () => {
    for (let i = 0; i < joints; i++) {
      skipJoint(reader, decodeText, header);
    }
  });

  const softBodies = header.version >= 2.05 ? readCount(reader, "soft body") : 0;
  if (header.version >= 2.05) {
    readVariableSection(reader, sections, "softBodies", softBodies, () => {
      for (let i = 0; i < softBodies; i++) {
        skipSoftBody(reader, decodeText, header);
      }
    });
  }

  const counts = {
    vertices,
    faces,
    textures,
    materials,
    bones,
    morphs,
    displayFrames,
    rigidBodies,
    joints,
    softBodies
  } satisfies PmxSectionCounts;
  const trailingBytes = reader.remaining;

  return {
    metadata: {
      format: "pmx",
      header,
      name,
      englishName,
      comment,
      englishComment,
      counts,
      trailingBytes
    },
    inventory: {
      format: "pmx",
      header,
      counts,
      sections,
      trailingBytes
    }
  };
}

function readFaceCount(vertexIndexCount: number, label: string): number {
  if (vertexIndexCount % 3 !== 0) {
    throw new Error(`${label} count must be divisible by 3: ${vertexIndexCount}`);
  }
  return vertexIndexCount / 3;
}

function readHeader(reader: BinaryReader): PmxHeader {
  const version = reader.f32();
  const headerSize = reader.u8();
  if (headerSize < 8) {
    throw new Error(`Unsupported PMX header size: ${headerSize}`);
  }

  const encodingByte = reader.u8();
  const encoding = encodingByte === 0 ? "utf-16-le" : encodingByte === 1 ? "utf-8" : undefined;
  if (encoding === undefined) {
    throw new Error(`Unsupported PMX text encoding byte: ${encodingByte}`);
  }

  const header: PmxHeader = {
    version,
    encoding,
    additionalUvCount: reader.u8(),
    indexSizes: {
      vertex: reader.u8(),
      texture: reader.u8(),
      material: reader.u8(),
      bone: reader.u8(),
      morph: reader.u8(),
      rigidBody: reader.u8()
    }
  };
  validateIndexSize("vertex", header.indexSizes.vertex, [1, 2, 4]);
  validateIndexSize("texture", header.indexSizes.texture, [1, 2, 4]);
  validateIndexSize("material", header.indexSizes.material, [1, 2, 4]);
  validateIndexSize("bone", header.indexSizes.bone, [1, 2, 4]);
  validateIndexSize("morph", header.indexSizes.morph, [1, 2, 4]);
  validateIndexSize("rigidBody", header.indexSizes.rigidBody, [1, 2, 4]);

  if (headerSize > 8) {
    reader.skip(headerSize - 8);
  }
  return header;
}

function createTextReader(reader: BinaryReader, encoding: PmxTextEncoding): () => string {
  const decoder = encoding === "utf-16-le" ? utf16LeDecoder : utf8Decoder;
  return () => {
    const byteLength = reader.i32();
    if (byteLength < 0) {
      throw new Error(`Invalid PMX text length: ${byteLength}`);
    }
    return decoder.decode(reader.bytes(byteLength));
  };
}

function readCount(reader: BinaryReader, label: string): number {
  const count = reader.i32();
  if (count < 0) {
    throw new Error(`Invalid PMX ${label} count: ${count}`);
  }
  return count;
}

function skipVertices(reader: BinaryReader, header: PmxHeader, count: number): void {
  const startOffset = reader.offset;
  const candidateBoneIndexSizes = uniqueNumbers([header.indexSizes.bone, 1, 2, 4]);
  let lastError: unknown;

  for (const boneIndexSize of candidateBoneIndexSizes) {
    reader.offset = startOffset;
    try {
      for (let i = 0; i < count; i++) {
        skipVertex(reader, header, boneIndexSize);
      }
      if (isPostVertexSectionPlausible(reader, header)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }

  reader.offset = startOffset;
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to skip PMX vertex payload");
}

function skipVertex(reader: BinaryReader, header: PmxHeader, boneIndexSize: number): void {
  reader.skip(12 + 12 + 8 + header.additionalUvCount * 16);
  const weightType = reader.u8();
  switch (weightType) {
    case 0:
      skipIndex(reader, boneIndexSize);
      break;
    case 1:
      skipIndex(reader, boneIndexSize);
      skipIndex(reader, boneIndexSize);
      reader.skip(4);
      break;
    case 2:
    case 4:
      for (let i = 0; i < 4; i++) {
        skipIndex(reader, boneIndexSize);
      }
      reader.skip(16);
      break;
    case 3:
      skipIndex(reader, boneIndexSize);
      skipIndex(reader, boneIndexSize);
      reader.skip(4 + 36);
      break;
    default:
      throw new Error(`Unsupported PMX vertex weight type: ${weightType}`);
  }
  reader.skip(4);
}

function isPostVertexSectionPlausible(reader: BinaryReader, header: PmxHeader): boolean {
  const vertexIndexCount = peekI32(reader, reader.offset);
  if (vertexIndexCount === undefined || vertexIndexCount < 0) {
    return false;
  }

  const vertexIndexBytes = vertexIndexCount * header.indexSizes.vertex;
  if (!Number.isSafeInteger(vertexIndexBytes)) {
    return false;
  }

  const textureCountOffset = reader.offset + 4 + vertexIndexBytes;
  const textureCount = peekI32(reader, textureCountOffset);
  if (textureCount === undefined || textureCount < 0) {
    return false;
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

function readVariableSection(
  reader: BinaryReader,
  sections: PmxSectionRange[],
  name: PmxSectionName,
  count: number,
  readPayload: () => void
): void {
  const offset = reader.offset;
  readPayload();
  sections.push({
    name,
    count,
    offset,
    byteLength: reader.offset - offset
  });
}

function readFixedByteSection(
  reader: BinaryReader,
  sections: PmxSectionRange[],
  name: PmxSectionName,
  count: number,
  byteLength: number
): void {
  const offset = reader.offset;
  reader.skip(byteLength);
  sections.push({
    name,
    count,
    offset,
    byteLength
  });
}

function skipMaterial(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  reader.skip(16 + 12 + 4 + 12 + 1 + 16 + 4);
  skipIndex(reader, header.indexSizes.texture);
  skipIndex(reader, header.indexSizes.texture);
  reader.skip(1);
  const toonFlag = reader.u8();
  if (toonFlag === 0) {
    skipIndex(reader, header.indexSizes.texture);
  } else {
    reader.skip(1);
  }
  readText();
  reader.skip(4);
}

function skipBone(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  reader.skip(12);
  skipIndex(reader, header.indexSizes.bone);
  reader.skip(4);
  const flags = reader.u16();
  if ((flags & PMX_BONE_FLAG_INDEXED_TAIL) !== 0) {
    skipIndex(reader, header.indexSizes.bone);
  } else {
    reader.skip(12);
  }
  if (
    (flags & PMX_BONE_FLAG_APPEND_ROTATE) !== 0 ||
    (flags & PMX_BONE_FLAG_APPEND_TRANSLATE) !== 0
  ) {
    skipIndex(reader, header.indexSizes.bone);
    reader.skip(4);
  }
  if ((flags & PMX_BONE_FLAG_FIXED_AXIS) !== 0) {
    reader.skip(12);
  }
  if ((flags & PMX_BONE_FLAG_LOCAL_AXIS) !== 0) {
    reader.skip(24);
  }
  if ((flags & PMX_BONE_FLAG_EXTERNAL_PARENT_TRANSFORM) !== 0) {
    reader.skip(4);
  }
  if ((flags & PMX_BONE_FLAG_IK) !== 0) {
    skipIndex(reader, header.indexSizes.bone);
    reader.skip(8);
    const linkCount = readCount(reader, "IK link");
    for (let i = 0; i < linkCount; i++) {
      skipIndex(reader, header.indexSizes.bone);
      const hasLimit = reader.u8();
      if (hasLimit !== 0) {
        reader.skip(24);
      }
    }
  }
}

function skipMorph(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  reader.skip(1);
  const type = reader.u8();
  const count = readCount(reader, "morph offset");
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 0:
        skipIndex(reader, header.indexSizes.morph);
        reader.skip(4);
        break;
      case 1:
        skipVertexIndex(reader, header.indexSizes.vertex);
        reader.skip(12);
        break;
      case 2:
        skipIndex(reader, header.indexSizes.bone);
        reader.skip(28);
        break;
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        skipVertexIndex(reader, header.indexSizes.vertex);
        reader.skip(16);
        break;
      case 8:
        skipIndex(reader, header.indexSizes.material);
        reader.skip(1 + 16 + 12 + 4 + 12 + 16 + 4 + 16 + 16 + 16);
        break;
      case 9:
        skipIndex(reader, header.indexSizes.morph);
        reader.skip(4);
        break;
      case 10:
        skipIndex(reader, header.indexSizes.rigidBody);
        reader.skip(1 + 12 + 12);
        break;
      default:
        throw new Error(`Unsupported PMX morph type: ${type}`);
    }
  }
}

function skipDisplayFrame(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  reader.skip(1);
  const count = readCount(reader, "display frame entry");
  for (let i = 0; i < count; i++) {
    const type = reader.u8();
    skipIndex(reader, type === 0 ? header.indexSizes.bone : header.indexSizes.morph);
  }
}

function skipRigidBody(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  skipIndex(reader, header.indexSizes.bone);
  reader.skip(1 + 2 + 1 + 36 + 20 + 1);
}

function skipJoint(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  reader.skip(1);
  skipIndex(reader, header.indexSizes.rigidBody);
  skipIndex(reader, header.indexSizes.rigidBody);
  reader.skip(96);
}

function skipSoftBody(reader: BinaryReader, readText: () => string, header: PmxHeader): void {
  readText();
  readText();
  reader.skip(1);
  skipIndex(reader, header.indexSizes.material);
  reader.skip(1 + 2 + 1 + 4 + 4 + 4 + 4 + 4 + 48 + 24 + 16 + 12);
  const anchorCount = readCount(reader, "soft body anchor");
  for (let i = 0; i < anchorCount; i++) {
    skipIndex(reader, header.indexSizes.rigidBody);
    skipVertexIndex(reader, header.indexSizes.vertex);
    reader.skip(1);
  }
  const pinnedCount = readCount(reader, "soft body pinned vertex");
  reader.skip(
    checkedSectionBytes(pinnedCount, header.indexSizes.vertex, "soft body pinned vertex")
  );
}

function skipIndex(reader: BinaryReader, size: number): void {
  validateIndexSize("generic", size, [1, 2, 4]);
  reader.skip(size);
}

function skipVertexIndex(reader: BinaryReader, size: number): void {
  validateIndexSize("vertex", size, [1, 2, 4]);
  reader.skip(size);
}

function checkedSectionBytes(count: number, entrySize: number, label: string): number {
  const byteLength = count * entrySize;
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error(`Invalid PMX ${label} byte length`);
  }
  return byteLength;
}

function validateIndexSize(label: string, size: number, supported: readonly number[]): void {
  if (!supported.includes(size)) {
    throw new Error(`Unsupported PMX ${label} index size: ${size}`);
  }
}
