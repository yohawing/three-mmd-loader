import * as THREE from "three";

import { parseVmd, parseVpd } from "../parser/index.js";
import { DefaultMmdRuntime } from "../runtime/index.js";
import { createThreeAnimationClip, createThreePoseAnimationClip } from "./animation.js";
import type { MmdRuntime, DefaultMmdRuntimeOptions } from "../runtime/index.js";
import type { MmdAnimation, MmdPose, VmdBoneFrame } from "../parser/model/modelTypes.js";
import { createThreeBufferGeometry } from "./geometry.js";
import { parseLoaderMmdModelData } from "./modelAssembly.js";
import type { LoaderMmdModelData } from "./internalModelData.js";
import { applyThreeMmdMaterialTextures, createThreeMmdMaterials } from "./materials.js";
import {
  computeMmdMaterialRenderOrder,
  syncMmdModelShadowFlags
} from "./material/material-metadata.js";
import { attachMmdSdefSkinning } from "./material/material-sdef.js";
import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "./materials.js";
import { isModelSource } from "./modelSource.js";
import { readModelSourceBytes } from "./modelSource.js";
import { createMmdMaterialRenderOrderMeshes, createMmdOutlineMesh } from "./outline.js";
import { createThreeSkeleton } from "./skeleton.js";
import type { ModelSource } from "./modelSource.js";
import type { TextureMap, TextureResolver } from "./textures.js";
export { createThreeBufferGeometry } from "./geometry.js";
export { createThreeAnimationClip, createThreePoseAnimationClip } from "./animation.js";
export { isModelSource } from "./modelSource.js";
export { applyThreeMmdMaterialTextures, createThreeMmdMaterials } from "./materials.js";
export { mmdWorldMatrixToThree, syncThreeMmdRuntimeToMesh } from "./runtime-sync.js";
export { createThreeSkeleton } from "./skeleton.js";
export {
  attachMmdMaterialMetadata,
  computeMmdMaterialRenderOrder,
  materialTransparencyMode,
  mmdMaterialAlphaTest,
  mmdMaterialCastsShadow,
  mmdMaterialDepthWrite,
  mmdMaterialMorphCanAffectAlpha,
  mmdMaterialSuppressesColorAtAlpha,
  mmdMaterialTransparencyMode,
  syncMmdModelShadowFlags
} from "./material/material-metadata.js";
export {
  attachMmdMaterialFactors,
  attachMmdSphereTexture,
  materialHasTextureMap,
  mmdSphereModeToUniform
} from "./material/material-shader-hooks.js";
export { syncMmdMaterialStates, syncMmdSpecularDirection } from "./material/material-sync.js";
export {
  attachMmdOutlineExpansion,
  computeMmdOutlineScale,
  createMmdMaterialRenderOrderMeshes,
  createMmdOutlineMesh,
  createMmdOutlineMeshes,
  syncMmdOutlineMaterialStates
} from "./outline.js";
export {
  attachMmdSdefSkinning,
  computeMmdSdefSkinnedNormal,
  computeMmdSdefSkinnedPosition
} from "./material/material-sdef.js";
export {
  createMmdBuiltInToonTextureMap,
  createTextureResolver,
  defaultSharedToonTexturePath,
  getDefaultToonGradientMap,
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
export type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "./materials.js";
export type { ThreeMmdSphereMappedToonMaterial } from "./materials.js";
export type { MmdSdefNormalSkinningInput, MmdSdefSkinningInput } from "./material/material-sdef.js";
export type {
  MmdMaterialRenderOrderMeshOptions,
  MmdOutlineModelSource,
  MmdOutlineOptions
} from "./outline.js";
export type { MmdMaterialRenderOrderEntry } from "./material/material-metadata.js";
export type { MmdWorldMatrixBuffer, MmdWorldMatrixColumnMajorTuple } from "./runtime-sync.js";
export type { ThreeMmdSkeletonBone, ThreeMmdSkeletonData } from "./skeleton.js";
export type {
  MmdToonTextureMaterial,
  MmdToonTextureReference,
  MmdMaterialTransparencyMode,
  TextureMap,
  TextureResolver
} from "./textures.js";

export interface ThreeMmdLoaderOptions {
  readonly textureResolver?: TextureResolver;
  readonly textureMap?: TextureMap;
  readonly textureLoader?: ThreeMmdTextureLoader;
  readonly runtime?: DefaultMmdRuntimeOptions;
}

export type ThreeMmdModelSourceDescriptor =
  | {
      readonly kind: "bytes";
      readonly byteLength: number;
    }
  | {
      readonly kind: "url";
      readonly byteLength: number;
      readonly name?: string;
    }
  | {
      readonly kind: "file";
      readonly byteLength: number;
      readonly name?: string;
    };

export interface ThreeMmdModel {
  readonly mesh: THREE.SkinnedMesh;
  readonly outlineMeshes: readonly THREE.SkinnedMesh[];
  readonly renderOrderMeshes: readonly THREE.SkinnedMesh[];
  readonly runtime?: MmdRuntime;
  readonly source: ThreeMmdModelSourceDescriptor;
  readonly textureDiagnostics: readonly TextureLoadDiagnostic[];
}

export interface ThreeMmdAnimation {
  readonly source: ModelSource;
  readonly name?: string;
  readonly animation: MmdAnimation;
  readonly clip?: THREE.AnimationClip;
}

export interface ThreeMmdPose {
  readonly source: ModelSource;
  readonly pose: MmdPose;
}

export class ThreeMmdLoader {
  private readonly textureCache = new Map<string, Promise<THREE.Texture | undefined>>();

  constructor(readonly options: ThreeMmdLoaderOptions = {}) {
    validateLoaderOptions(options);
  }

  async loadModel(source: ModelSource): Promise<ThreeMmdModel> {
    validateModelSource(source, "loadModel");
    const bytes = await readModelSourceBytes(source);
    const modelData = parseLoaderMmdModelData(bytes);
    const mesh = createThreeMmdMesh(modelData);
    const materials = normalizeMeshMaterials(mesh.material);
    const textureDiagnostics = await applyThreeMmdMaterialTextures(materials, modelData.materials, {
      textureResolver: this.options.textureResolver,
      textureMap: this.options.textureMap,
      textureLoader: this.options.textureLoader,
      modelUrl: typeof source === "string" ? source : undefined,
      geometry: mesh.geometry,
      morphs: modelData.morphs,
      textureCache: this.textureCache
    });
    const renderOrder = computeMmdMaterialRenderOrder(
      materials.map((material, materialIndex) => ({
        materialIndex,
        transparencyMode: material.userData.mmdMaterial?.transparencyMode ?? "opaque"
      }))
    );
    mesh.userData.mmdMaterialRenderOrder = renderOrder;
    syncMmdModelShadowFlags(mesh, modelData.materials);
    return createThreeMmdModel({
      mesh,
      runtime: new DefaultMmdRuntime(this.options.runtime),
      source: createModelSourceDescriptor(source, bytes.byteLength),
      textureDiagnostics,
      materials: modelData.materials
    });
  }

  async loadAnimation(source: ModelSource, model?: ThreeMmdModel): Promise<ThreeMmdAnimation> {
    validateModelSource(source, "loadAnimation");
    const bytes = await readModelSourceBytes(source);
    if (bytes.byteLength === 0) {
      throw createEmptySourceError("loadAnimation");
    }
    const animation = parseVmd(bytes);
    return {
      source,
      name: animation.metadata.modelName,
      animation,
      clip: model ? this.createAnimationClip(animation, model) : undefined
    };
  }

  async loadPose(source: ModelSource): Promise<ThreeMmdPose> {
    validateModelSource(source, "loadPose");
    const bytes = await readModelSourceBytes(source);
    if (bytes.byteLength === 0) {
      throw createEmptySourceError("loadPose");
    }
    return {
      source,
      pose: parseVpd(bytes)
    };
  }

  async loadPoseAnimation(
    source: ModelSource,
    name = "pose",
    model?: ThreeMmdModel
  ): Promise<ThreeMmdAnimation> {
    validateModelSource(source, "loadPoseAnimation");
    const bytes = await readModelSourceBytes(source);
    if (bytes.byteLength === 0) {
      throw createEmptySourceError("loadPoseAnimation");
    }
    const pose = parseVpd(bytes);
    const animation = createMmdAnimationFromPose(pose, name);
    return {
      source,
      name,
      animation,
      clip: model
        ? createThreePoseAnimationClip(pose, model.mesh.skeleton.bones, name)
        : createThreeAnimationClip(animation, createPoseBones(pose), {
            morphTargetDictionary: {}
          })
    };
  }

  createAnimationClip(animation: MmdAnimation, model: ThreeMmdModel): THREE.AnimationClip {
    return createThreeAnimationClip(animation, model.mesh.skeleton.bones, {
      morphTargetDictionary: model.mesh.morphTargetDictionary ?? undefined
    });
  }
}

function createThreeMmdModel(options: {
  readonly mesh: THREE.SkinnedMesh;
  readonly runtime?: MmdRuntime;
  readonly source: ThreeMmdModelSourceDescriptor;
  readonly textureDiagnostics: readonly TextureLoadDiagnostic[];
  readonly materials: readonly LoaderMmdModelData["materials"][number][];
}): ThreeMmdModel {
  let outlineMeshes: readonly THREE.SkinnedMesh[] | undefined;
  let renderOrderMeshes: readonly THREE.SkinnedMesh[] | undefined;
  const ensureOutlineMeshes = () => {
    if (!outlineMeshes) {
      const outlineMesh = createMmdOutlineMesh({
        mesh: options.mesh,
        materials: options.materials
      });
      outlineMeshes = outlineMesh ? [outlineMesh] : [];
      outlineMeshes.forEach((outline) => {
        syncMmdModelShadowFlags(outline, options.materials);
        options.mesh.add(outline);
      });
    }
    return outlineMeshes;
  };

  const model: Omit<ThreeMmdModel, "outlineMeshes" | "renderOrderMeshes"> = {
    mesh: options.mesh,
    runtime: options.runtime,
    source: options.source,
    textureDiagnostics: options.textureDiagnostics
  };

  options.mesh.addEventListener("added", ensureOutlineMeshes);

  return Object.defineProperties(model, {
    outlineMeshes: {
      enumerable: true,
      configurable: false,
      get() {
        return ensureOutlineMeshes();
      }
    },
    renderOrderMeshes: {
      enumerable: true,
      configurable: false,
      get() {
        renderOrderMeshes ??= createMmdMaterialRenderOrderMeshes({
          mesh: options.mesh,
          materials: options.materials
        });
        return renderOrderMeshes;
      }
    }
  }) as ThreeMmdModel;
}

function createModelSourceDescriptor(
  source: ModelSource,
  byteLength: number
): ThreeMmdModelSourceDescriptor {
  if (typeof source === "string") {
    return {
      kind: "url",
      byteLength,
      name: source.split(/[\\/]/).at(-1)
    };
  }
  if (typeof File !== "undefined" && source instanceof File) {
    return {
      kind: "file",
      byteLength,
      name: source.name || undefined
    };
  }
  return {
    kind: "bytes",
    byteLength
  };
}

function createEmptySourceError(method: string): Error {
  return new Error(
    `ThreeMmdLoader.${method} source must not be empty; ` +
      `ThreeMmdLoader.${method} is not implemented in this migration slice for empty sources`
  );
}

function createThreeMmdMesh(modelData: LoaderMmdModelData): THREE.SkinnedMesh {
  const geometry = createThreeBufferGeometry(
    modelData.geometry,
    modelData.materials,
    modelData.morphs
  );
  const materials = createThreeMmdMaterials(modelData.materials);
  if (geometry.userData.mmdSdef) {
    materials.forEach((material) => attachMmdSdefSkinning(material));
  }
  const mesh = new THREE.SkinnedMesh(geometry, materials.length === 1 ? materials[0] : materials);
  mesh.morphTargetDictionary = createMorphTargetDictionary(modelData.morphs);
  mesh.morphTargetInfluences = new Array(modelData.morphs.length).fill(0);
  mesh.name = modelData.metadata.englishName || modelData.metadata.name;
  mesh.userData.mmdModel = {
    format: modelData.metadata.format,
    name: modelData.metadata.name,
    englishName: modelData.metadata.englishName,
    diagnostics: modelData.metadata.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    rigidBodyCount: modelData.rigidBodies.length,
    jointCount: modelData.joints.length
  };
  mesh.userData.mmdPhysics = {
    rigidBodies: modelData.rigidBodies.map((body) => ({
      name: body.name,
      englishName: body.englishName,
      boneIndex: body.boneIndex,
      group: body.group,
      mask: body.mask,
      shape: body.shape,
      mode: body.mode,
      size: [...body.size],
      position: [...body.position],
      rotation: [...body.rotation],
      mass: body.mass,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      restitution: body.restitution,
      friction: body.friction
    })),
    joints: modelData.joints.map((joint) => ({
      name: joint.name,
      englishName: joint.englishName,
      rigidBodyIndexA: joint.rigidBodyIndexA,
      rigidBodyIndexB: joint.rigidBodyIndexB,
      position: [...joint.position],
      rotation: [...joint.rotation],
      translationLowerLimit: [...joint.translationLowerLimit],
      translationUpperLimit: [...joint.translationUpperLimit],
      rotationLowerLimit: [...joint.rotationLowerLimit],
      rotationUpperLimit: [...joint.rotationUpperLimit],
      springTranslationFactor: [...joint.springTranslationFactor],
      springRotationFactor: [...joint.springRotationFactor]
    }))
  };
  mesh.userData.mmdMorphs = modelData.morphs.map((morph) => ({
    name: morph.name,
    englishName: morph.englishName,
    type: morph.type,
    boneOffsets: morph.boneOffsets.map((offset) => ({ ...offset })),
    groupOffsets: morph.groupOffsets.map((offset) => ({ ...offset })),
    flipOffsets: morph.flipOffsets?.map((offset) => ({ ...offset })),
    impulseOffsets: morph.impulseOffsets?.map((offset) => ({ ...offset }))
  }));
  mesh.userData.mmdIkChains = createRuntimeIkChains(modelData);

  const skeleton = createThreeSkeleton(modelData.skeleton);
  skeleton.bones.forEach((bone, index) => {
    const boneData = modelData.skeleton.bones[index];
    if (boneData) {
      bone.userData.mmdBoneName = boneData.name;
      bone.userData.mmdEnglishBoneName = boneData.englishName;
      bone.userData.mmdRestPosition = [...boneData.position];
    }
    if (boneData?.appendTransform) {
      bone.userData.mmdAppendTransform = boneData.appendTransform;
    }
    if (boneData?.flags) {
      bone.userData.mmdFlags = boneData.flags;
    }
    if (boneData?.layer !== undefined) {
      bone.userData.mmdLayer = boneData.layer;
    }
  });
  skeleton.bones.forEach((bone) => {
    if (!bone.parent) {
      mesh.add(bone);
    }
  });
  mesh.bind(skeleton);
  return mesh;
}

function createRuntimeIkChains(modelData: LoaderMmdModelData): unknown[] {
  return modelData.skeleton.bones
    .map((bone, boneIndex) => {
      if (!bone.ik) {
        return null;
      }
      return {
        goalBoneIndex: boneIndex,
        effectorBoneIndex: bone.ik.targetIndex,
        iterationCount: bone.ik.loopCount,
        maxAnglePerIteration: bone.ik.limitAngle,
        links: bone.ik.links.map((link) => ({
          boneIndex: link.boneIndex,
          enabled: true,
          limitsKind:
            link.limits === undefined
              ? undefined
              : link.limits.kind === "pmdKnee"
                ? "pmdKnee"
                : "pmxLinkLimit",
          angleLimit: link.limits
            ? {
                minimumAngle: link.limits.lower,
                maximumAngle: link.limits.upper
              }
            : undefined
        }))
      };
    })
    .filter((chain): chain is NonNullable<typeof chain> => chain !== null);
}

function createMorphTargetDictionary(
  morphs: readonly LoaderMmdModelData["morphs"][number][]
): Record<string, number> {
  const dictionary: Record<string, number> = {};
  morphs.forEach((morph, index) => {
    const primaryName = morph.name || morph.englishName;
    const secondaryName = morph.englishName || morph.name;
    if (primaryName) {
      dictionary[primaryName] = index;
    }
    if (secondaryName && dictionary[secondaryName] === undefined) {
      dictionary[secondaryName] = index;
    }
  });
  return dictionary;
}

function createMmdAnimationFromPose(pose: MmdPose, name: string): MmdAnimation {
  const boneTracks: Record<string, VmdBoneFrame[]> = {};
  for (const [boneName, bonePose] of Object.entries(pose.bones)) {
    boneTracks[boneName] = [
      {
        frame: 0,
        translation: bonePose.translation,
        rotation: bonePose.rotation
      }
    ];
  }
  return {
    kind: "vmd",
    bytes: pose.bytes,
    metadata: {
      modelName: pose.metadata.modelFile,
      counts: {
        bones: Object.keys(boneTracks).length,
        morphs: 0,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 0,
      name
    } as MmdAnimation["metadata"] & { readonly name: string },
    boneTracks,
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

function createPoseBones(pose: MmdPose): THREE.Bone[] {
  return Object.keys(pose.bones).map((boneName) => {
    const bone = new THREE.Bone();
    bone.name = boneName;
    bone.userData.mmdBoneName = boneName;
    return bone;
  });
}

function normalizeMeshMaterials(
  material: THREE.Material | THREE.Material[]
): THREE.MeshToonMaterial[] {
  const materials = Array.isArray(material) ? material : [material];
  return materials.filter((candidate): candidate is THREE.MeshToonMaterial => {
    return candidate instanceof THREE.MeshToonMaterial;
  });
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
    if (
      typeof options.textureMap !== "object" ||
      options.textureMap === null ||
      Array.isArray(options.textureMap)
    ) {
      throw new TypeError("ThreeMmdLoader textureMap must be an object");
    }
    for (const [path, value] of Object.entries(options.textureMap)) {
      if (!isTextureMapValue(value)) {
        throw new TypeError(
          `ThreeMmdLoader textureMap entry "${path}" must be a string, URL, or Blob`
        );
      }
    }
  }

  if (options.textureLoader !== undefined) {
    if (typeof options.textureLoader !== "object" || options.textureLoader === null) {
      throw new TypeError("ThreeMmdLoader textureLoader must be an object");
    }
    if (typeof options.textureLoader.load !== "function") {
      throw new TypeError("ThreeMmdLoader textureLoader.load must be a function");
    }
  }

  if (
    options.runtime !== undefined &&
    (typeof options.runtime !== "object" || options.runtime === null)
  ) {
    throw new TypeError("ThreeMmdLoader runtime options must be an object");
  }
}

function validateModelSource(source: ModelSource, method: string): void {
  if (!isModelSource(source)) {
    throw new TypeError(
      `ThreeMmdLoader.${method} source must be a string, File, ArrayBuffer, or Uint8Array`
    );
  }
}

function isTextureMapValue(value: unknown): value is TextureMap[string] {
  return (
    typeof value === "string" ||
    value instanceof URL ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}
