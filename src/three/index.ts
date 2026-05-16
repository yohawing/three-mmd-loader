import type * as THREE from "three";

import {
  detectModelFormat,
  parsePmdMetadata,
  parsePmdSectionInventory,
  parsePmxMetadata,
  parsePmxSectionInventory
} from "../parser/index.js";
import type { MmdRuntime, DefaultMmdRuntimeOptions } from "../runtime/index.js";
import type { LoaderMmdModelContainer } from "./internalModelData.js";
import { createLoaderMmdMetadata } from "./internalModelData.js";
import { isModelSource } from "./modelSource.js";
import { readModelSourceBytes } from "./modelSource.js";
import type { ModelSource } from "./modelSource.js";
import type { TextureMap, TextureResolver } from "./textures.js";
export { createThreeBufferGeometry } from "./geometry.js";
export { isModelSource, MODEL_SOURCE_STRING_UNRESOLVED, readModelSourceBytes } from "./modelSource.js";
export { mmdWorldMatrixToThree } from "./runtime-sync.js";
export { createThreeSkeleton } from "./skeleton.js";
export {
  createMmdBuiltInToonTextureMap,
  createTextureResolver,
  defaultSharedToonTexturePath,
  isBuiltInToonTexturePath,
  normalizeMmdTexturePath,
  resolveMappedTexture,
  resolveMmdToonTextureReference
} from "./textures.js";
export type {
  ThreeMmdAdditionalUvMorphOffset,
  ThreeMmdGeometryBuffers,
  ThreeMmdGeometryMaterial,
  ThreeMmdGeometryMorph,
  ThreeMmdMaterialGroup,
  ThreeMmdSdefBuffers,
  ThreeMmdUvMorphOffset,
  ThreeMmdVertexMorphOffset
} from "./geometry.js";
export type { ModelSource } from "./modelSource.js";
export type {
  MmdWorldMatrixBuffer,
  MmdWorldMatrixColumnMajorTuple
} from "./runtime-sync.js";
export type { ThreeMmdSkeletonBone, ThreeMmdSkeletonData } from "./skeleton.js";
export type {
  MmdToonTextureMaterial,
  MmdToonTextureReference,
  TextureMap,
  TextureResolver
} from "./textures.js";

export interface ThreeMmdLoaderOptions {
  readonly textureResolver?: TextureResolver;
  readonly textureMap?: TextureMap;
  readonly runtime?: DefaultMmdRuntimeOptions;
}

export interface TextureLoadDiagnostic {
  readonly level: "warning";
  readonly code: "TEXTURE_RESOLVE_FAILED";
  readonly materialIndex: number;
  readonly textureKind: "diffuse" | "sphere" | "toon";
  readonly path: string;
}

export interface ThreeMmdModel {
  readonly mesh: THREE.SkinnedMesh;
  readonly runtime?: MmdRuntime;
  readonly source: ModelSource;
  readonly textureDiagnostics: readonly TextureLoadDiagnostic[];
}

export interface ThreeMmdAnimation {
  readonly source: ModelSource;
  readonly name?: string;
}

export interface ThreeMmdPose {
  readonly source: ModelSource;
}

export class ThreeMmdLoader {
  constructor(readonly options: ThreeMmdLoaderOptions = {}) {
    validateLoaderOptions(options);
  }

  async loadModel(source: ModelSource): Promise<ThreeMmdModel> {
    validateModelSource(source, "loadModel");
    const container = await readModelContainer(source);
    const metadata = createLoaderMmdMetadata(container.metadata);
    throw createUnimplementedError(`loadModel ${metadata.format} model data assembly`);
  }

  async loadAnimation(source: ModelSource): Promise<ThreeMmdAnimation> {
    validateModelSource(source, "loadAnimation");
    throw createUnimplementedError("loadAnimation");
  }

  async loadPose(source: ModelSource): Promise<ThreeMmdPose> {
    validateModelSource(source, "loadPose");
    throw createUnimplementedError("loadPose");
  }

  async loadPoseAnimation(source: ModelSource, _name?: string): Promise<ThreeMmdAnimation> {
    validateModelSource(source, "loadPoseAnimation");
    throw createUnimplementedError("loadPoseAnimation");
  }
}

function createUnimplementedError(method: string): Error {
  return new Error(`ThreeMmdLoader.${method} is not implemented in this migration slice`);
}

async function readModelContainer(source: ModelSource): Promise<LoaderMmdModelContainer> {
  const bytes = await readModelSourceBytes(source);
  const format = detectModelFormat(bytes);

  if (format === "pmx") {
    return {
      format,
      metadata: parsePmxMetadata(bytes),
      inventory: parsePmxSectionInventory(bytes)
    };
  }

  if (format === "pmd") {
    return {
      format,
      metadata: parsePmdMetadata(bytes),
      inventory: parsePmdSectionInventory(bytes)
    };
  }

  throw new TypeError(`ThreeMmdLoader.loadModel source must be PMX or PMD, got ${format}`);
}

function validateLoaderOptions(options: ThreeMmdLoaderOptions): void {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("ThreeMmdLoader options must be an object");
  }

  if (options.textureResolver !== undefined) {
    if (typeof options.textureResolver !== "object" || options.textureResolver === null) {
      throw new TypeError("ThreeMmdLoader textureResolver must be an object");
    }
    if (typeof options.textureResolver.resolve !== "function") {
      throw new TypeError("ThreeMmdLoader textureResolver.resolve must be a function");
    }
  }

  if (options.textureMap !== undefined) {
    if (typeof options.textureMap !== "object" || options.textureMap === null || Array.isArray(options.textureMap)) {
      throw new TypeError("ThreeMmdLoader textureMap must be an object");
    }
    for (const [path, value] of Object.entries(options.textureMap)) {
      if (!isTextureMapValue(value)) {
        throw new TypeError(`ThreeMmdLoader textureMap entry "${path}" must be a string, URL, or Blob`);
      }
    }
  }

  if (options.runtime !== undefined && (typeof options.runtime !== "object" || options.runtime === null)) {
    throw new TypeError("ThreeMmdLoader runtime options must be an object");
  }
}

function validateModelSource(source: ModelSource, method: string): void {
  if (!isModelSource(source)) {
    throw new TypeError(`ThreeMmdLoader.${method} source must be a string, File, ArrayBuffer, or Uint8Array`);
  }
}

function isTextureMapValue(value: unknown): value is TextureMap[string] {
  return (
    typeof value === "string" ||
    value instanceof URL ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}
