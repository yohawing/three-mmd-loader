import type { BinaryReader } from "../binary/index.js";
import type { DisplayFrameData, MaterialInfo, MorphData } from "./modelTypes.js";
import type { PmxIndexSizes } from "./pmxBinary.js";
import { readCount, readVertexIndex, readVec3, readVec4 } from "./pmxBinary.js";

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

export function readMaterial(
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

export function readBone(reader: BinaryReader, readText: () => string, sizes: PmxIndexSizes) {
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

export function readMorph(reader: BinaryReader, readText: () => string, sizes: PmxIndexSizes): MorphData {
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

export function readDisplayFrame(
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
