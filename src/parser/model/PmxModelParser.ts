import { BinaryReader } from "../binary/index.js";
import { createModelDiagnostics } from "./diagnostics.js";
import { sanitizeNonFiniteModelNormals } from "./normalSanitization.js";
import type {
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
import type { PmxIndexSizes } from "./pmxBinary.js";
import { readCount, readVertexIndex } from "./pmxBinary.js";
import {
  readVerticesWithBoneIndexSizeFallback,
  skipVerticesWithBoneIndexSizeFallback,
  minimumPmxVertexByteLength
} from "./pmxGeometry.js";
import { readMaterial, readBone, readMorph, readDisplayFrame } from "./pmxModelSections.js";
import {
  readRigidBody,
  readJoint,
  readSoftBodies,
  createSoftBodyDiagnostics
} from "./pmxPhysics.js";

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
    sdefVertexCount,
    qdef,
    qdefVertexCount
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
      sdef: sdefVertexCount > 0 ? sdef : undefined,
      qdef: qdefVertexCount > 0 ? qdef : undefined
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
