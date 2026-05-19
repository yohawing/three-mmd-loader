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

const asciiDecoder = new TextDecoder("ascii");
const shiftJisDecoder = new TextDecoder("shift-jis");
const pmdAlphaShadowDisable = 0.98;
const pmdAlphaShadowEpsilon = 1e-5;
const maxPmdSectionCount = 10_000_000;
const pmdVertexByteLength = 38;
const pmdMaterialByteLength = 70;

export function parsePmd(bytes: Uint8Array): ParsedPmd {
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
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
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

  const indexCount = readCount(reader, "vertex index", { remainingBytesPerEntry: 2 });
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    indices[i] = reader.u16();
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

  const boneCount = reader.u16();
  const skeleton: SkeletonData = { bones: [] };
  const pmdBoneTypes: number[] = [];
  for (let i = 0; i < boneCount; i++) {
    const boneName = readFixedText(reader, 20);
    const parentIndex = normalizePmdIndex(reader.u16());
    const tailIndex = normalizePmdIndex(reader.u16());
    const boneType = reader.u8();
    const ikIndex = normalizePmdIndex(reader.u16());
    pmdBoneTypes.push(boneType);
    const flags = createPmdBoneFlags(boneType, tailIndex);
    skeleton.bones.push({
      name: boneName,
      englishName: "",
      parentIndex,
      layer: boneType === 2 ? 1 : 0,
      position: [reader.f32(), reader.f32(), reader.f32()],
      tailIndex: flags.indexedTail ? tailIndex : -1,
      tailPosition: undefined,
      flags,
      appendTransform:
        boneType === 5
          ? {
              parentIndex: tailIndex,
              weight: ikIndex * 0.01
            }
          : undefined
    });
  }
  applyPmdTwistAxes(skeleton, pmdBoneTypes);

  const ikCount = reader.u16();
  const synthesizedIkChainBoneNames: string[] = [];
  for (let i = 0; i < ikCount; i++) {
    const ikBoneIndex = reader.u16();
    const targetBoneIndex = reader.u16();
    const linkCount = reader.u8();
    const loopCount = reader.u16();
    const limitAngle = reader.f32();
    const links = [];
    for (let j = 0; j < linkCount; j++) {
      const boneIndex = reader.u16();
      const boneName = skeleton.bones[boneIndex]?.name ?? "";
      links.push({
        boneIndex,
        limits: isPmdKneeBone(boneName)
          ? {
              kind: "pmdKnee" as const,
              lower: [-Math.PI, 0, 0] as [number, number, number],
              upper: [-0.0001, 0, 0] as [number, number, number]
            }
          : undefined
      });
    }
    const bone = skeleton.bones[ikBoneIndex];
    if (bone) {
      const ik = {
        targetIndex: targetBoneIndex,
        loopCount,
        limitAngle,
        links
      };
      if (bone.ik) {
        const chainBone = createPmdIkChainBone(bone, ikBoneIndex);
        chainBone.ik = ik;
        skeleton.bones.push(chainBone);
        synthesizedIkChainBoneNames.push(chainBone.name);
        continue;
      }
      bone.flags.ik = true;
      bone.flags.translatable = true;
      bone.layer = 1;
      bone.ik = ik;
    }
  }

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
  sanitizeNonFiniteModelNormals(positions, normals, indices, diagnostics);

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

function readPmdDisplayFrames(
  reader: BinaryReader,
  morphs: readonly MorphData[]
): {
  displayFrames: DisplayFrameData[];
  boneDisplayNameCount: number;
  boneDisplayFrameStart: number;
} {
  const displayFrames: DisplayFrameData[] = [];
  if (reader.remaining < 1) {
    return { displayFrames, boneDisplayNameCount: 0, boneDisplayFrameStart: 0 };
  }

  const morphDisplayFrameCount = reader.u8();
  for (let i = 0; i < morphDisplayFrameCount; i++) {
    const morphIndex = reader.u16();
    displayFrames.push({
      name: morphs[morphIndex]?.name ?? "",
      englishName: "",
      special: true,
      frames: [{ type: "morph", index: morphIndex }]
    });
  }

  if (reader.remaining < 1) {
    return { displayFrames, boneDisplayNameCount: 0, boneDisplayFrameStart: displayFrames.length };
  }
  const boneDisplayNameCount = reader.u8();
  const boneDisplayFrameStart = displayFrames.length;
  for (let i = 0; i < boneDisplayNameCount; i++) {
    displayFrames.push({
      name: readFixedText(reader, 50),
      englishName: "",
      special: false,
      frames: []
    });
  }

  if (reader.remaining < 4) {
    return { displayFrames, boneDisplayNameCount, boneDisplayFrameStart };
  }
  const boneDisplayCount = readCount(reader, "bone display", { remainingBytesPerEntry: 3 });
  for (let i = 0; i < boneDisplayCount; i++) {
    const boneIndex = reader.u16();
    const frameIndex = reader.u8();
    const displayFrame = displayFrames[boneDisplayFrameStart + frameIndex - 1];
    if (displayFrame) {
      displayFrame.frames.push({ type: "bone", index: boneIndex });
    }
  }
  return { displayFrames, boneDisplayNameCount, boneDisplayFrameStart };
}

function readCount(
  reader: BinaryReader,
  label: string,
  options: { readonly remainingBytesPerEntry?: number } = {}
): number {
  const count = reader.u32();
  validateCount(count, `PMD ${label}`, reader.remaining, options.remainingBytesPerEntry);
  return count;
}

function validateCount(
  count: number,
  label: string,
  remaining: number,
  remainingBytesPerEntry: number | undefined
): void {
  if (count > maxPmdSectionCount) {
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

function readFixedText(reader: BinaryReader, byteLength: number): string {
  const bytes = reader.bytes(byteLength);
  const end = bytes.indexOf(0);
  const slice = end >= 0 ? bytes.subarray(0, end) : bytes;
  return shiftJisDecoder.decode(slice).trim();
}

function normalizePmdIndex(value: number): number {
  return value === 0xffff ? -1 : value;
}

function createPmdBoneFlags(
  boneType: number,
  tailIndex: number
): SkeletonData["bones"][number]["flags"] {
  const rotateEffect = boneType === 5;
  return {
    indexedTail: !rotateEffect && tailIndex > 0,
    rotatable: true,
    translatable: boneType === 1 || boneType === 2,
    visible: boneType !== 5 && boneType !== 7,
    enabled: true,
    ik: boneType === 2,
    appendLocal: false,
    appendRotate: rotateEffect,
    appendTranslate: false,
    fixedAxis: false,
    localAxis: false,
    transformAfterPhysics: false,
    externalParentTransform: false
  };
}

function applyPmdTwistAxes(skeleton: SkeletonData, boneTypes: readonly number[]): void {
  for (let index = 0; index < skeleton.bones.length; index++) {
    const bone = skeleton.bones[index];
    if (!bone) {
      continue;
    }
    if (boneTypes[index] !== 8) {
      continue;
    }
    const tail = skeleton.bones[bone.tailIndex] ?? skeleton.bones[0];
    if (!tail || tail === bone) {
      continue;
    }
    const axis = normalizeVec3([
      tail.position[0] - bone.position[0],
      tail.position[1] - bone.position[1],
      tail.position[2] - bone.position[2]
    ]);
    bone.fixedAxis = axis;
    bone.flags.fixedAxis = true;
    bone.flags.indexedTail = false;
  }
}

function createPmdIkChainBone(
  source: SkeletonData["bones"][number],
  parentIndex: number
): SkeletonData["bones"][number] {
  return {
    name: `${source.name}+`,
    englishName: source.englishName,
    parentIndex,
    layer: source.layer,
    position: [...source.position],
    tailIndex: -1,
    tailPosition: [0, 0, 0],
    flags: {
      ...source.flags,
      indexedTail: false,
      visible: false
    },
    appendTransform:
      source.appendTransform === undefined ? undefined : { ...source.appendTransform },
    fixedAxis: source.fixedAxis === undefined ? undefined : [...source.fixedAxis],
    localAxis:
      source.localAxis === undefined
        ? undefined
        : {
            x: [...source.localAxis.x],
            z: [...source.localAxis.z]
          },
    externalParentKey: source.externalParentKey,
    ikStateName: source.ikStateName ?? source.name
  };
}

function normalizeVec3(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-8) {
    return [0, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function isPmdKneeBone(name: string): boolean {
  return name.includes("ひざ") || name.includes("ヒザ") || name.toLowerCase().includes("knee");
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

function readOptionalEnglishBlock(
  reader: BinaryReader,
  skeleton: SkeletonData,
  morphs: MorphData[],
  displayFrames: DisplayFrameData[],
  boneDisplayFrameStart: number,
  boneDisplayNameCount: number
): { name: string; comment: string } {
  if (reader.remaining < 1) {
    return { name: "", comment: "" };
  }
  const hasEnglish = reader.u8();
  if (hasEnglish === 0) {
    return { name: "", comment: "" };
  }
  const name = readFixedText(reader, 20);
  const comment = readFixedText(reader, 256);
  for (const bone of skeleton.bones) {
    bone.englishName = readFixedText(reader, 20);
  }
  for (let i = 1; i < morphs.length; i++) {
    const morph = morphs[i];
    const englishName = readFixedText(reader, 20);
    if (morph) {
      morph.englishName = englishName;
    }
  }
  for (let i = 0; i < boneDisplayNameCount; i++) {
    const displayFrame = displayFrames[boneDisplayFrameStart + i];
    const englishName = readFixedText(reader, 50);
    if (displayFrame) {
      displayFrame.englishName = englishName;
    }
  }
  return { name, comment };
}

function readOptionalRigidBodies(reader: BinaryReader): RigidBodyData[] {
  if (reader.remaining < 4) {
    return [];
  }
  const count = readCount(reader, "rigid body");
  const rigidBodies: RigidBodyData[] = [];
  for (let i = 0; i < count; i++) {
    rigidBodies.push({
      name: readFixedText(reader, 20),
      englishName: "",
      boneIndex: normalizePmdIndex(reader.u16()),
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
    });
  }
  return rigidBodies;
}

function normalizePmdRigidBodyPositions(
  rigidBodies: RigidBodyData[],
  skeleton: SkeletonData
): RigidBodyData[] {
  for (const body of rigidBodies) {
    const bone = skeleton.bones[body.boneIndex];
    if (!bone) {
      continue;
    }
    body.position = [
      body.position[0] + bone.position[0],
      body.position[1] + bone.position[1],
      body.position[2] + bone.position[2]
    ];
  }
  return rigidBodies;
}

function readOptionalJoints(reader: BinaryReader): JointData[] {
  if (reader.remaining < 4) {
    return [];
  }
  const count = readCount(reader, "joint");
  const joints: JointData[] = [];
  for (let i = 0; i < count; i++) {
    joints.push({
      name: readFixedText(reader, 20),
      englishName: "",
      type: "generic6dofSpring",
      rigidBodyIndexA: reader.u32(),
      rigidBodyIndexB: reader.u32(),
      position: readVec3(reader),
      rotation: readVec3(reader),
      translationLowerLimit: readVec3(reader),
      translationUpperLimit: readVec3(reader),
      rotationLowerLimit: readVec3(reader),
      rotationUpperLimit: readVec3(reader),
      springTranslationFactor: readVec3(reader),
      springRotationFactor: readVec3(reader)
    });
  }
  return joints;
}

function readVec3(reader: BinaryReader): [number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32()];
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
