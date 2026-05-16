import type { MmdModelFormat, PmdMetadata, PmdSectionInventory, PmxMetadata, PmxSectionInventory } from "../parser/index.js";
import type {
  Diagnostic,
  DisplayFrameData,
  JointData,
  MaterialInfo,
  MorphData,
  RigidBodyData,
  SoftBodyData
} from "../parser/model/modelTypes.js";
import type { ThreeMmdGeometryBuffers } from "./geometry.js";
import type { ThreeMmdSkeletonData } from "./skeleton.js";

export type LoaderMmdCoordinateSystem = "mmd-right-handed-y-up";

export interface LoaderMmdModelMetadata {
  readonly format: MmdModelFormat;
  readonly version: number;
  readonly encoding: "utf-8" | "utf-16-le" | "shift-jis" | "unknown";
  readonly name: string;
  readonly englishName: string;
  readonly comment: string;
  readonly englishComment: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface LoaderMmdModelData {
  readonly coordinateSystem: LoaderMmdCoordinateSystem;
  readonly metadata: LoaderMmdModelMetadata;
  readonly geometry: ThreeMmdGeometryBuffers;
  readonly materials: readonly MaterialInfo[];
  readonly morphs: readonly MorphData[];
  readonly skeleton: ThreeMmdSkeletonData;
  readonly displayFrames: readonly DisplayFrameData[];
  readonly rigidBodies: readonly RigidBodyData[];
  readonly joints: readonly JointData[];
  readonly softBodies: readonly SoftBodyData[];
}

export type LoaderMmdModelContainerMetadata = PmxMetadata | PmdMetadata;
export type LoaderMmdModelContainerInventory = PmxSectionInventory | PmdSectionInventory;

export interface LoaderMmdModelContainer {
  readonly format: MmdModelFormat;
  readonly metadata: LoaderMmdModelContainerMetadata;
  readonly inventory: LoaderMmdModelContainerInventory;
}

export function createLoaderMmdModelData(input: LoaderMmdModelData): LoaderMmdModelData {
  validateLoaderMmdModelData(input);
  return input;
}

export function createLoaderMmdMetadata(
  metadata: LoaderMmdModelContainerMetadata
): LoaderMmdModelMetadata {
  return {
    format: metadata.format,
    version: metadata.header.version,
    encoding: metadata.format === "pmx" ? metadata.header.encoding : metadata.encoding,
    name: metadata.name,
    englishName: metadata.englishName,
    comment: metadata.comment,
    englishComment: metadata.englishComment,
    diagnostics: []
  };
}

export function validateLoaderMmdModelData(modelData: LoaderMmdModelData): void {
  if (modelData.coordinateSystem !== "mmd-right-handed-y-up") {
    throw new TypeError(`LOADER_MMD_MODEL_COORDINATE_SYSTEM_INVALID:${modelData.coordinateSystem}`);
  }
  validateMetadata(modelData.metadata);
  validateGeometryShape(modelData.geometry);
  validateMaterials(modelData.materials);
  validateMorphs(modelData.morphs);
  validateSkeletonShape(modelData.skeleton);
}

function validateMetadata(metadata: LoaderMmdModelMetadata): void {
  if (metadata.format !== "pmx" && metadata.format !== "pmd") {
    throw new TypeError(`LOADER_MMD_MODEL_FORMAT_INVALID:${metadata.format}`);
  }
  validateString("NAME", metadata.name);
  validateString("ENGLISH_NAME", metadata.englishName);
  validateString("COMMENT", metadata.comment);
  validateString("ENGLISH_COMMENT", metadata.englishComment);
  if (!Number.isFinite(metadata.version)) {
    throw new TypeError("LOADER_MMD_MODEL_VERSION_NON_FINITE");
  }
  if (
    metadata.encoding !== "utf-8" &&
    metadata.encoding !== "utf-16-le" &&
    metadata.encoding !== "shift-jis" &&
    metadata.encoding !== "unknown"
  ) {
    throw new TypeError(`LOADER_MMD_MODEL_ENCODING_INVALID:${metadata.encoding}`);
  }
}

function validateGeometryShape(geometry: ThreeMmdGeometryBuffers): void {
  const vertexCount = validateFloat32Buffer("POSITIONS", geometry.positions, 3);
  validateFloat32Buffer("NORMALS", geometry.normals, 3, vertexCount);
  validateFloat32Buffer("UVS", geometry.uvs, 2, vertexCount);
  validateUint16Buffer("SKIN_INDICES", geometry.skinIndices, 4, vertexCount);
  validateFloat32Buffer("SKIN_WEIGHTS", geometry.skinWeights, 4, vertexCount);

  if (!(geometry.indices instanceof Uint16Array || geometry.indices instanceof Uint32Array)) {
    throw new TypeError("LOADER_MMD_MODEL_INDICES_BUFFER_INVALID");
  }
  if (geometry.indices.length % 3 !== 0) {
    throw new RangeError(`LOADER_MMD_MODEL_INDICES_LENGTH_INVALID:${geometry.indices.length}`);
  }

  geometry.additionalUvs?.forEach((additionalUv, index) => {
    validateFloat32Buffer(`ADDITIONAL_UV_${index}`, additionalUv, 4, vertexCount);
  });

  if (geometry.edgeScale) {
    validateFloat32Buffer("EDGE_SCALE", geometry.edgeScale, 1, vertexCount);
  }

  if (geometry.sdef) {
    validateFloat32Buffer("SDEF_ENABLED", geometry.sdef.enabled, 1, vertexCount);
    validateFloat32Buffer("SDEF_C", geometry.sdef.c, 3, vertexCount);
    validateFloat32Buffer("SDEF_R0", geometry.sdef.r0, 3, vertexCount);
    validateFloat32Buffer("SDEF_R1", geometry.sdef.r1, 3, vertexCount);
    validateFloat32Buffer("SDEF_RW0", geometry.sdef.rw0, 3, vertexCount);
    validateFloat32Buffer("SDEF_RW1", geometry.sdef.rw1, 3, vertexCount);
  }
}

function validateMaterials(materials: readonly MaterialInfo[]): void {
  materials.forEach((material, index) => {
    validateString(`MATERIAL_NAME:${index}`, material.name);
    validateString(`MATERIAL_ENGLISH_NAME:${index}`, material.englishName);
    validateNonNegativeInteger(`MATERIAL_FACE_COUNT:${index}`, material.faceCount);
    validateOptionalString(`MATERIAL_TEXTURE:${index}`, material.texturePath);
    validateOptionalString(`MATERIAL_SPHERE_TEXTURE:${index}`, material.sphereTexturePath);
    validateOptionalString(`MATERIAL_TOON_TEXTURE:${index}`, material.toonTexturePath);
  });
}

function validateMorphs(morphs: readonly MorphData[]): void {
  morphs.forEach((morph, morphIndex) => {
    morph.vertexOffsets?.forEach((offset, offsetIndex) => {
      validateNonNegativeInteger(`MORPH_VERTEX:${morphIndex}:${offsetIndex}`, offset.vertexIndex);
      validateNumberTuple(`MORPH_VERTEX_POSITION:${morphIndex}:${offsetIndex}`, offset.position, 3);
    });
    morph.uvOffsets?.forEach((offset, offsetIndex) => {
      validateNonNegativeInteger(`MORPH_UV:${morphIndex}:${offsetIndex}`, offset.vertexIndex);
      validateNumberTuple(`MORPH_UV_VALUE:${morphIndex}:${offsetIndex}`, offset.uv, 2);
    });
    morph.additionalUvOffsets?.forEach((offset, offsetIndex) => {
      validateNonNegativeInteger(`MORPH_ADDITIONAL_UV_VERTEX:${morphIndex}:${offsetIndex}`, offset.vertexIndex);
      validateNonNegativeInteger(`MORPH_ADDITIONAL_UV_INDEX:${morphIndex}:${offsetIndex}`, offset.uvIndex);
      validateNumberTuple(`MORPH_ADDITIONAL_UV_VALUE:${morphIndex}:${offsetIndex}`, offset.uv, 4);
    });
  });
}

function validateSkeletonShape(skeleton: ThreeMmdSkeletonData): void {
  skeleton.bones.forEach((bone, index) => {
    validateString(`BONE_NAME:${index}`, bone.name);
    validateString(`BONE_ENGLISH_NAME:${index}`, bone.englishName);
    if (!Number.isInteger(bone.parentIndex)) {
      throw new RangeError(`LOADER_MMD_MODEL_BONE_PARENT_INVALID:${index}:${bone.parentIndex}`);
    }
    validateNumberTuple(`BONE_POSITION:${index}`, bone.position, 3);
  });
}

function validateFloat32Buffer(
  name: string,
  buffer: Float32Array | readonly Float32Array[] | undefined,
  itemSize: number,
  expectedItems?: number
): number {
  if (!(buffer instanceof Float32Array)) {
    throw new TypeError(`LOADER_MMD_MODEL_${name}_BUFFER_INVALID`);
  }
  if (buffer.length % itemSize !== 0) {
    throw new RangeError(`LOADER_MMD_MODEL_${name}_LENGTH_INVALID:${buffer.length}:${itemSize}`);
  }
  if (expectedItems !== undefined && buffer.length !== expectedItems * itemSize) {
    throw new RangeError(
      `LOADER_MMD_MODEL_${name}_COUNT_INVALID:${buffer.length}:${expectedItems * itemSize}`
    );
  }
  buffer.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`LOADER_MMD_MODEL_${name}_NON_FINITE:${index}`);
    }
  });
  return buffer.length / itemSize;
}

function validateUint16Buffer(
  name: string,
  buffer: Uint16Array,
  itemSize: number,
  expectedItems: number
): void {
  if (!(buffer instanceof Uint16Array)) {
    throw new TypeError(`LOADER_MMD_MODEL_${name}_BUFFER_INVALID`);
  }
  if (buffer.length !== expectedItems * itemSize) {
    throw new RangeError(
      `LOADER_MMD_MODEL_${name}_COUNT_INVALID:${buffer.length}:${expectedItems * itemSize}`
    );
  }
}

function validateString(name: string, value: string): void {
  if (typeof value !== "string") {
    throw new TypeError(`LOADER_MMD_MODEL_${name}_INVALID`);
  }
}

function validateOptionalString(name: string, value: string | undefined): void {
  if (value !== undefined) {
    validateString(name, value);
  }
}

function validateNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`LOADER_MMD_MODEL_${name}_INVALID:${value}`);
  }
}

function validateNumberTuple(name: string, values: readonly unknown[], expectedLength: number): void {
  if (!Array.isArray(values) || values.length < expectedLength) {
    throw new TypeError(`LOADER_MMD_MODEL_${name}_INVALID`);
  }
  for (let index = 0; index < expectedLength; index += 1) {
    if (typeof values[index] !== "number" || !Number.isFinite(values[index])) {
      throw new TypeError(`LOADER_MMD_MODEL_${name}_NON_FINITE:${index}`);
    }
  }
}
