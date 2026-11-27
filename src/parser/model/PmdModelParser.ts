import { BinaryReader } from "../binary/index.js";
import { createModelDiagnostics } from "./diagnostics.js";
import { sanitizeNonFiniteModelNormals } from "./normalSanitization.js";
import { asciiDecoder, readCount, readFixedText } from "./pmdBinary.js";
import { readOptionalEnglishBlock, readPmdDisplayFrames } from "./pmdDisplay.js";
import { normalizePmdRigidBodyPositions, readOptionalJoints, readOptionalRigidBodies } from "./pmdPhysics.js";
import { readPmdSkeleton } from "./pmdSkeleton.js";
import type {
  GeometryBuffers,
  DisplayFrameData,
  MaterialInfo,
  ModelMetadata,
  MorphData,
  JointData,
  RigidBodyData,
  SkeletonData
} from "./modelTypes.js";

export interface ParsedPmd {
  metadata: ModelMetadata;
  geometry: GeometryBuffers;
  materials: MaterialInfo[];
  skeleton: SkeletonData;
  morphs: MorphData[];
  displayFrames: DisplayFrameData[];
  rigidBodies: RigidBodyData[];
  joints: JointData[];
  softBodies: [];
}

const pmdAlphaShadowDisable = 0.98;
const pmdAlphaShadowEpsilon = 1e-5;
const pmdVertexByteLength = 38;
const pmdMaterialByteLength = 70;

export function parsePmd(bytes: Uint8Array, options: { skipGeometry?: boolean } = {}): ParsedPmd {
  const reader = new BinaryReader(bytes);
  const signature = asciiDecoder.decode(reader.bytes(3));
  if (signature !== "Pmd") {
    throw new Error(`Invalid PMD signature: ${JSON.stringify(signature)}`);
  }

  const version = reader.f32();
  const name = readFixedText(reader, 20);
  let englishName = "";
  const comment = readFixedText(reader, 256);
  let englishComment = "";

  const vertexCount = readCount(reader, "vertex", {
    remainingBytesPerEntry: pmdVertexByteLength
  });
  const skipGeometry = options.skipGeometry === true;
  const positions = skipGeometry ? new Float32Array(0) : new Float32Array(vertexCount * 3);
  const normals = skipGeometry ? new Float32Array(0) : new Float32Array(vertexCount * 3);
  const uvs = skipGeometry ? new Float32Array(0) : new Float32Array(vertexCount * 2);
  const skinIndices = skipGeometry ? new Uint16Array(0) : new Uint16Array(vertexCount * 4);
  const skinWeights = skipGeometry ? new Float32Array(0) : new Float32Array(vertexCount * 4);
  if (skipGeometry) {
    reader.skip(vertexCount * pmdVertexByteLength);
  } else {
    for (let i = 0; i < vertexCount; i++) {
      const p = i * 3;
      positions[p] = reader.f32();
      positions[p + 1] = reader.f32();
      positions[p + 2] = reader.f32();
      normals[p] = reader.f32();
      normals[p + 1] = reader.f32();
      normals[p + 2] = reader.f32();
      const uv = i * 2;
      uvs[uv] = reader.f32();
      uvs[uv + 1] = reader.f32();
      const skin = i * 4;
      skinIndices[skin] = reader.u16();
      skinIndices[skin + 1] = reader.u16();
      const weight = reader.u8() / 100;
      skinWeights[skin] = weight;
      skinWeights[skin + 1] = 1 - weight;
      reader.skip(1);
    }
  }

  const indexCount = readCount(reader, "vertex index", { remainingBytesPerEntry: 2 });
  const indices = skipGeometry
    ? new Uint16Array(0)
    : vertexCount > 65535
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount);
  if (skipGeometry) {
    reader.skip(indexCount * 2);
  } else {
    for (let i = 0; i < indexCount; i++) {
      indices[i] = reader.u16();
    }
  }

  const materialCount = readCount(reader, "material", {
    remainingBytesPerEntry: pmdMaterialByteLength
  });
  const materials: MaterialInfo[] = [];
  const materialToonIndices: number[] = [];
  for (let i = 0; i < materialCount; i++) {
    const diffuse: [number, number, number, number] = [
      reader.f32(),
      reader.f32(),
      reader.f32(),
      reader.f32()
    ];
    const specularPower = reader.f32();
    const specular: [number, number, number] = [reader.f32(), reader.f32(), reader.f32()];
    const ambient: [number, number, number] = [reader.f32(), reader.f32(), reader.f32()];
    const toonIndex = reader.u8();
    const edgeFlag = reader.u8();
    const faceCount = reader.u32() / 3;
    const textureName = readFixedText(reader, 20);
    const texture = parsePmdMaterialTexture(textureName);
    const edgeEnabled = edgeFlag !== 0;
    const shadowEnabled = Math.abs(diffuse[3] - pmdAlphaShadowDisable) > pmdAlphaShadowEpsilon;
    materialToonIndices.push(toonIndex);
    materials.push({
      name: textureName,
      englishName: "",
      texturePath: texture.texturePath,
      sphereTexturePath: texture.sphereTexturePath,
      sphereMode: texture.sphereMode,
      toonTexturePath: "",
      sharedToonIndex: normalizePmdToonIndex(toonIndex),
      diffuse,
      specular,
      specularPower,
      ambient,
      edgeColor: [0, 0, 0, 1],
      edgeSize: edgeEnabled ? 1 : 0,
      flags: {
        doubleSided: diffuse[3] < 1,
        groundShadow: edgeEnabled,
        selfShadowMap: shadowEnabled,
        selfShadow: shadowEnabled,
        edge: edgeEnabled,
        vertexColor: false,
        pointDraw: false,
        lineDraw: false
      },
      faceCount
    });
  }

  const { skeleton, pmdBoneTypes, synthesizedIkChainBoneNames } = readPmdSkeleton(reader);

  const morphCount = reader.u16();
  const morphs: MorphData[] = [];
  const baseMorphVertexIndices: number[] = [];
  for (let i = 0; i < morphCount; i++) {
    const morphName = readFixedText(reader, 20);
    const morphVertexCount = readCount(reader, "morph vertex", { remainingBytesPerEntry: 16 });
    const morphType = reader.u8();
    const morph: MorphData = {
      name: morphName,
      englishName: "",
      type: morphType === 0 ? "base" : "vertex",
      vertexOffsets: [],
      groupOffsets: [],
      boneOffsets: [],
      uvOffsets: [],
      additionalUvOffsets: [],
      materialOffsets: []
    };
    for (let j = 0; j < morphVertexCount; j++) {
      const morphVertexIndex = reader.u32();
      const vertexIndex =
        morphType === 0 ? morphVertexIndex : (baseMorphVertexIndices[morphVertexIndex] ?? -1);
      const position: [number, number, number] = [reader.f32(), reader.f32(), reader.f32()];
      if (morphType === 0) {
        baseMorphVertexIndices.push(morphVertexIndex);
        continue;
      }
      if (vertexIndex < 0) {
        continue;
      }
      morph.vertexOffsets.push({
        vertexIndex,
        position
      });
    }
    morphs.push(morph);
  }

  const { displayFrames, boneDisplayNameCount, boneDisplayFrameStart } = readPmdDisplayFrames(
    reader,
    morphs
  );

  const english = readOptionalEnglishBlock(
    reader,
    skeleton,
    morphs,
    displayFrames,
    boneDisplayFrameStart,
    boneDisplayNameCount
  );
  englishName = english.name;
  englishComment = english.comment;
  if (reader.remaining >= 1000) {
    const toonTexturePaths = Array.from({ length: 10 }, () => readFixedText(reader, 100));
    materials.forEach((material, index) => {
      const toonIndex = normalizePmdToonIndex(materialToonIndices[index] ?? 255);
      material.toonTexturePath = toonIndex === undefined ? "" : (toonTexturePaths[toonIndex] ?? "");
    });
  }

  const rigidBodies = normalizePmdRigidBodyPositions(readOptionalRigidBodies(reader), skeleton);
  const joints = readOptionalJoints(reader);
  const diagnostics = createModelDiagnostics(
    materials,
    morphs,
    skeleton,
    rigidBodies,
    joints,
    displayFrames
  );
  const unsupportedPmdBoneTypes = new Set(
    pmdBoneTypes.filter((boneType) => boneType === 3 || boneType > 9)
  );
  if (unsupportedPmdBoneTypes.size > 0) {
    diagnostics.push({
      level: "warning",
      code: "PMD_BONE_TYPE_UNSUPPORTED",
      message: `Unsupported PMD bone types are present: ${Array.from(unsupportedPmdBoneTypes).join(
        ", "
      )}; the current parser preserves them as basic rotatable bones.`
    });
  }
  if (synthesizedIkChainBoneNames.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "PMD_DUPLICATE_IK_CHAIN_SYNTHESIZED",
      message: `PMD duplicate IK chains were normalized into synthetic chain bones ${synthesizedIkChainBoneNames.join(
        ", "
      )}.`
    });
  }
  if (!skipGeometry) {
    sanitizeNonFiniteModelNormals(positions, normals, indices, diagnostics);
  }

  return {
    metadata: {
      format: "pmd",
      version,
      encoding: "shift-jis",
      name,
      englishName,
      comment,
      englishComment,
      counts: {
        vertices: vertexCount,
        faces: indexCount / 3,
        materials: materialCount,
        bones: skeleton.bones.length,
        morphs: morphCount,
        displayFrames: displayFrames.length,
        rigidBodies: rigidBodies.length,
        joints: joints.length,
        softBodies: 0
      },
      indexSizes: {
        vertex: 2,
        texture: 4,
        material: 2,
        bone: 2,
        morph: 2,
        rigidBody: 4
      },
      additionalUvCount: 0,
      diagnostics
    },
    geometry: { positions, normals, uvs, additionalUvs: [], indices, skinIndices, skinWeights },
    materials,
    skeleton,
    morphs,
    displayFrames,
    rigidBodies,
    joints,
    softBodies: []
  };
}

function parsePmdMaterialTexture(
  textureName: string
): Pick<MaterialInfo, "texturePath" | "sphereTexturePath" | "sphereMode"> {
  const paths = textureName
    .split("*")
    .map((path) => path.trim())
    .filter(Boolean);
  let texturePath = "";
  let sphereTexturePath = "";
  let sphereMode: MaterialInfo["sphereMode"] = "none";
  for (const path of paths) {
    const lower = path.toLowerCase();
    if (lower.endsWith(".spa") || lower.endsWith(".sph")) {
      sphereTexturePath = path;
      sphereMode = lower.endsWith(".spa") ? "add" : "multiply";
    } else {
      texturePath = path;
    }
  }
  return { texturePath, sphereTexturePath, sphereMode };
}

function normalizePmdToonIndex(index: number): number | undefined {
  return index >= 0 && index < 10 ? index : undefined;
}
