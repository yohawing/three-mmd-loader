import * as THREE from "three";

import { FallbackCore, initCore } from "../parser/wasm/index.js";
import { parseVpd } from "../parser/index.js";
import type { MmdAnimation, MmdCore, MmdPose, VmdBoneTrack } from "../parser/model/modelTypes.js";
import { DefaultMmdRuntime } from "../runtime/index.js";
import type {
  DefaultMmdRuntimeOptions,
  MmdFrameState,
  MmdRuntime,
  MmdRuntimeEvaluateOptions,
  MmdRuntimeTickOptions
} from "../runtime/index.js";
import { createThreeBufferGeometry } from "./geometry.js";
import { createLoaderMmdModelDataFromModel } from "./modelAssembly.js";
import type { LoaderMmdModelData } from "./internalModelData.js";
import { applyThreeMmdMaterialTextures, createThreeMmdMaterials } from "./materials.js";
import {
  computeMmdMaterialRenderOrder,
  mmdMaterialCastsSelfShadow,
  syncMmdModelShadowFlags
} from "./material/material-metadata.js";
import { attachMmdSdefSkinning } from "./material/material-sdef.js";
import type {
  MaterialTransparencyDiagnostic,
  TextureLoadDiagnostic,
  ThreeMmdTextureLoader
} from "./materials.js";
import { isModelSource } from "./modelSource.js";
import { readModelSource, readModelSourceBytes } from "./modelSource.js";
import {
  createMmdMaterialRenderOrderMeshes,
  createMmdOutlineMeshes
} from "./outline.js";
import { createLoaderPerformanceProfile } from "./performance.js";
import type { LoaderPerformanceMeasure, LoaderPerformanceOptions } from "./performance.js";
import { MMD_SELF_SHADOW_LAYER } from "./shadow.js";
import { createThreeSkeleton } from "./skeleton.js";
import type { ModelSource } from "./modelSource.js";
import type { ModelSourceDiagnostic, ModelSourceFetch } from "./modelSource.js";
import type { TextureMap, TextureResolver } from "./textures.js";
export { createThreeBufferGeometry } from "./geometry.js";
export { applyMmdCameraStateToThreeCamera } from "./camera.js";
export { disposeMmdModel } from "./dispose.js";
export type { DisposeMmdModelOptions } from "./dispose.js";
export {
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  findMmdMotionFiles,
  isMmdTextureFile,
  normalizeMmdRelativePath
} from "./folder.js";
export { isModelSource } from "./modelSource.js";
export { applyThreeMmdMaterialTextures, createThreeMmdMaterials } from "./materials.js";
export {
  mmdWorldMatrixToThree,
  syncThreeMmdRuntimeToMesh,
  syncThreeMmdRuntimeToModel
} from "./runtime-sync.js";
export {
  applyMmdSelfShadowStateToThreeDirectionalLight,
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox,
  MMD_SELF_SHADOW_LAYER
} from "./shadow.js";
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
  createMmdMaterialRenderOrderMeshes,
  createMmdOutlineMeshes,
  syncMmdOutlineMaterialStates
} from "./outline.js";
export {
  attachMmdSdefSkinning,
  computeMmdSdefSkinnedNormal,
  computeMmdSdefSkinnedPosition
} from "./material/material-sdef.js";
export {
  computeQdefSkinnedNormal,
  computeQdefSkinnedPosition
} from "./material/material-qdef.js";
export type { MmdQdefNormalSkinningInput, MmdQdefSkinningInput } from "./material/material-qdef.js";
export {
  createMmdBuiltInToonTextureMap,
  createTextureResolver,
  defaultSharedToonTexturePath,
  getDefaultToonGradientMap,
  isMmdDdsTexturePath,
  normalizeMmdTexturePath,
  resolveMappedTexture,
  resolveMmdToonTextureReference
} from "./textures.js";
export type {
  ApplyMmdCameraStateOptions
} from "./camera.js";
export type {
  ApplyMmdSelfShadowStateOptions,
  ConfigureMmdSelfShadowDirectionalLightOptions,
  FitMmdSelfShadowDirectionalLightOptions
} from "./shadow.js";
export type {
  ThreeMmdAdditionalUvMorphOffset,
  ThreeMmdGeometryBuffers,
  ThreeMmdGeometryMaterial,
  ThreeMmdGeometryMorph,
  ThreeMmdMaterialGroup,
  ThreeMmdQdefBuffers,
  ThreeMmdSdefBuffers,
  ThreeMmdUvMorphOffset,
  ThreeMmdVertexMorphOffset
} from "./geometry.js";
export type {
  ModelSource,
  ModelSourceDiagnostic,
  ModelSourceFetch,
  ReadModelSourceOptions,
  ReadModelSourceResult
} from "./modelSource.js";
export type {
  MaterialTransparencyDiagnostic,
  TextureLoadDiagnostic,
  ThreeMmdTextureLoader
} from "./materials.js";
export type {
  LoaderPerformanceMeasure,
  LoaderPerformanceOptions
} from "./performance.js";
export type { ThreeMmdSphereMappedToonMaterial } from "./materials.js";
export type { MmdSdefNormalSkinningInput, MmdSdefSkinningInput } from "./material/material-sdef.js";
export type {
  MmdMaterialRenderOrderMeshOptions,
  MmdOutlineModelSource,
  MmdOutlineOptions
} from "./outline.js";
export type { MmdMaterialRenderOrderEntry } from "./material/material-metadata.js";
export type {
  MmdRuntimeMeshSyncSource,
  MmdWorldMatrixBuffer,
  MmdWorldMatrixColumnMajorTuple,
  ThreeMmdRuntimeSyncTarget
} from "./runtime-sync.js";
export type { ThreeMmdSkeletonBone, ThreeMmdSkeletonData } from "./skeleton.js";
export type {
  MmdToonTextureMaterial,
  MmdToonTextureReference,
  MmdMaterialTransparencyMode,
  TextureMap,
  TextureResolver
} from "./textures.js";

export interface ThreeMmdLoaderOptions {
  /** Resolves MMD-relative texture paths when loading model materials. */
  readonly textureResolver?: TextureResolver;
  /** Maps MMD-relative texture paths to browser-loadable texture sources. */
  readonly textureMap?: TextureMap;
  /** Overrides the default Three.js texture loader for ordinary textures. */
  readonly textureLoader?: ThreeMmdTextureLoader;
  /** Overrides the texture loader used for DDS textures. */
  readonly ddsLoader?: ThreeMmdTextureLoader;
  /** Enables geometry-aware texture alpha checks. Defaults to off, except when outlines require it internally. */
  readonly geometryAwareAlpha?: boolean;
  /** Options forwarded to the per-model DefaultMmdRuntime. */
  readonly runtime?: DefaultMmdRuntimeOptions;
  /** Creates a per-model runtime. When omitted, DefaultMmdRuntime is used. */
  readonly runtimeFactory?: (context: ThreeMmdRuntimeFactoryContext) => MmdRuntime;
  /** Parser core override. When omitted, the loader uses the TypeScript parser core. */
  readonly core?: MmdCore | Promise<MmdCore>;
  /** Overrides fetch for string ModelSource values. */
  readonly fetch?: ModelSourceFetch;
  /** Enables load-time performance marks and diagnostics. */
  readonly performance?: boolean | LoaderPerformanceOptions;
  /** Receives recoverable parser-core failures before falling back to the TypeScript parser. */
  readonly onCoreFallback?: (event: ThreeMmdCoreFallbackEvent) => void;
}

export interface ThreeMmdRuntimeFactoryContext {
  readonly modelBytes: Uint8Array;
  readonly mesh: THREE.SkinnedMesh;
  readonly source: ThreeMmdModelSourceDescriptor;
}

export interface ThreeMmdCoreFallbackEvent {
  readonly operation: "initCore" | "loadModel" | "loadVmd";
  readonly error: unknown;
}

export interface ThreeMmdLoadModelOptions {
  /** Creates MMD outline proxy meshes. Defaults to true. */
  readonly outline?: boolean;
  /**
   * @deprecated Use outline instead. This alias will be removed in the next
   * breaking release.
   */
  readonly outlines?: boolean;
  /** Applies MMD-compatible per-material render ordering with proxy meshes. Defaults to true. */
  readonly materialRenderOrder?: boolean;
  /**
   * @deprecated Use materialRenderOrder instead. This alias will be removed in
   * the next breaking release.
   */
  readonly renderOrderProxies?: boolean;
  /** Applies frustum culling to the base mesh and generated proxy meshes. */
  readonly frustumCulled?: boolean;
  /** Overrides fetch for this string ModelSource load. */
  readonly fetch?: ModelSourceFetch;
  /** Cancels this string ModelSource fetch when supported by the host fetch implementation. */
  readonly signal?: AbortSignal;
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
  /** Scene-ready root. Usually add only this object to the scene. */
  readonly root: THREE.Group;
  /**
   * @deprecated Use root instead. This alias will be removed in the next
   * breaking release.
   */
  readonly object: THREE.Group;
  /** Base MMD SkinnedMesh for advanced access and runtime binding. */
  readonly mesh: THREE.SkinnedMesh;
  /** Generated outline proxy meshes. Empty when outline is false. */
  readonly outlineMeshes: readonly THREE.SkinnedMesh[];
  /** Generated render-order proxy meshes. Empty when materialRenderOrder is false. */
  readonly renderOrderMeshes: readonly THREE.SkinnedMesh[];
  /** Runtime bound to this model. */
  readonly runtime: MmdRuntime;
  readonly source: ThreeMmdModelSourceDescriptor;
  /** Structured diagnostics grouped by subsystem. */
  readonly diagnostics: {
    readonly core: ThreeMmdCoreDiagnostic;
    readonly source: ModelSourceDiagnostic;
    readonly textures: readonly TextureLoadDiagnostic[];
    readonly materials: readonly MaterialTransparencyDiagnostic[];
    readonly performance: readonly LoaderPerformanceMeasure[];
  };
  /**
   * @deprecated Use diagnostics.textures instead. This alias will be removed in
   * the next breaking release.
   */
  readonly textureDiagnostics: readonly TextureLoadDiagnostic[];
  /** Binds a VMD/VPD animation to this model's mesh. */
  setAnimation(animation: MmdAnimation | ThreeMmdAnimation): void;
  /**
   * Evaluates the bound animation and syncs this model's root for rendering.
   *
   * The returned state is volatile and may be reused by later updates to keep
   * per-frame evaluation allocation-free. Use runtime.frameState() when you
   * need to retain a stable snapshot.
   */
  update(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState;
}

export type ThreeMmdCoreDiagnostic =
  | {
      readonly kind: "provided";
    }
  | {
      readonly kind: "wasm";
    }
  | {
      readonly kind: "fallback";
      readonly operation: ThreeMmdCoreFallbackEvent["operation"];
      readonly reason: string;
    };

export interface ThreeMmdAnimation {
  readonly source: ModelSource;
  readonly name?: string;
  readonly animation: MmdAnimation;
}

export interface ThreeMmdPose {
  readonly source: ModelSource;
  readonly pose: MmdPose;
}

export class ThreeMmdLoader {
  private readonly textureCache = new Map<string, Promise<THREE.Texture | undefined>>();
  private corePromise: Promise<MmdCore> | undefined;
  private fallbackCore: FallbackCore | undefined;
  private readonly useExplicitCore: boolean;
  private coreDiagnostic: ThreeMmdCoreDiagnostic;

  constructor(readonly options: ThreeMmdLoaderOptions = {}) {
    validateLoaderOptions(options);
    this.useExplicitCore = options.core !== undefined;
    this.coreDiagnostic = this.useExplicitCore ? { kind: "provided" } : { kind: "wasm" };
    if (options.core) {
      this.corePromise = Promise.resolve(options.core);
    }
  }

  async loadModel(
    source: ModelSource,
    options: ThreeMmdLoadModelOptions = {}
  ): Promise<ThreeMmdModel> {
    validateModelSource(source, "loadModel");
    validateLoadModelOptions(options);
    const profile = createLoaderPerformanceProfile(
      describeModelSourceForPerformance(source),
      normalizeLoaderPerformanceOptions(this.options.performance)
    );
    profile?.mark("start");
    try {
      const { bytes, diagnostic: sourceDiagnostic } = await readModelSource(source, {
        fetch: options.fetch ?? this.options.fetch,
        signal: options.signal
      });
      profile?.mark("bytes");
      const core = await this.getCore();
      const { model: parsedModel, coreDiagnostic } = this.loadCoreModel(core, bytes);
      const modelData = createLoaderMmdModelDataFromModel(parsedModel);
      let parsedModelDisposed = false;
      try {
        profile?.mark("parsed");
        const mesh = createThreeMmdMesh(modelData);
        parsedModel.dispose?.();
        parsedModelDisposed = true;
        profile?.mark("mesh");
        const materials = normalizeMeshMaterials(mesh.material);
        warnDeprecatedLoadModelOptions(options);
        const effectiveOutlines = options.outline ?? options.outlines ?? true;
        const materialDiagnostics: MaterialTransparencyDiagnostic[] = [];
        const textureDiagnostics = await applyThreeMmdMaterialTextures(materials, modelData.materials, {
          textureResolver: this.options.textureResolver,
          textureMap: this.options.textureMap,
          textureLoader: this.options.textureLoader,
          ddsLoader: this.options.ddsLoader,
          modelUrl: typeof source === "string" ? source : undefined,
          geometry: mesh.geometry,
          morphs: modelData.morphs,
          geometryAwareAlpha: this.options.geometryAwareAlpha || effectiveOutlines,
          materialDiagnostics,
          textureCache: this.textureCache
        });
        profile?.mark("textures");
        const renderOrder = computeMmdMaterialRenderOrder(
          materials.map((material, materialIndex) => ({
            materialIndex,
            transparencyMode: material.userData.mmdMaterial?.transparencyMode ?? "opaque"
          }))
        );
        mesh.userData.mmdMaterialRenderOrder = renderOrder;
        syncMmdModelShadowFlags(mesh, modelData.materials);
        if (options.frustumCulled !== undefined) {
          mesh.frustumCulled = options.frustumCulled;
        }
        profile?.mark("materials");
        const sourceDescriptor = createModelSourceDescriptor(source, bytes.byteLength);
        const model = createThreeMmdModel({
          mesh,
          runtime: this.createRuntime({
            modelBytes: bytes,
            mesh,
            source: sourceDescriptor
          }),
          source: sourceDescriptor,
          sourceDiagnostic,
          coreDiagnostic,
          textureDiagnostics,
          materialDiagnostics,
          performanceDiagnostics: profile?.measures ?? [],
          materials: modelData.materials,
          outlines: effectiveOutlines,
          renderOrderProxies: options.materialRenderOrder ?? options.renderOrderProxies ?? true
        });
        profile?.mark("assembled");
        profile?.measure("read-bytes", "start", "bytes");
        profile?.measure("parse-model", "bytes", "parsed");
        profile?.measure("create-mesh", "parsed", "mesh");
        profile?.measure("load-textures", "mesh", "textures");
        profile?.measure("material-metadata", "textures", "materials");
        profile?.measure("assemble-model", "materials", "assembled");
        profile?.measure("total", "start", "assembled");
        return model;
      } finally {
        if (!parsedModelDisposed) {
          parsedModel.dispose?.();
        }
      }
    } finally {
      profile?.clear();
    }
  }

  private createRuntime(context: ThreeMmdRuntimeFactoryContext): MmdRuntime {
    return this.options.runtimeFactory?.(context) ?? new DefaultMmdRuntime(this.options.runtime);
  }

  private getCore(): Promise<MmdCore> {
    this.corePromise ??= this.initCoreWithObservableFallback();
    return this.corePromise;
  }

  private async initCoreWithObservableFallback(): Promise<MmdCore> {
    try {
      const core = await initCore();
      if (core instanceof FallbackCore) {
        this.fallbackCore = core;
        this.coreDiagnostic = {
          kind: "fallback",
          operation: "initCore",
          reason: "WASM core disabled; using TypeScript fallback parser."
        };
      } else {
        this.coreDiagnostic = { kind: "wasm" };
      }
      return core;
    } catch (error) {
      this.options.onCoreFallback?.({ operation: "initCore", error });
      this.coreDiagnostic = {
        kind: "fallback",
        operation: "initCore",
        reason: formatDiagnosticReason(error)
      };
      this.fallbackCore ??= new FallbackCore();
      return this.fallbackCore;
    }
  }

  private loadCoreModel(
    core: MmdCore,
    bytes: Uint8Array
  ): { readonly model: ReturnType<MmdCore["loadModel"]>; readonly coreDiagnostic: ThreeMmdCoreDiagnostic } {
    try {
      const model = core.loadModel(bytes);
      return {
        model,
        coreDiagnostic: this.createSuccessfulCoreDiagnostic(core)
      };
    } catch (error) {
      if (this.useExplicitCore) {
        throw error;
      }
      this.options.onCoreFallback?.({ operation: "loadModel", error });
      const coreDiagnostic: ThreeMmdCoreDiagnostic = {
        kind: "fallback",
        operation: "loadModel",
        reason: formatDiagnosticReason(error)
      };
      this.fallbackCore ??= new FallbackCore();
      return {
        model: this.fallbackCore.loadModel(bytes),
        coreDiagnostic
      };
    }
  }

  private loadCoreVmd(core: MmdCore, bytes: Uint8Array): MmdAnimation {
    try {
      const animation = core.loadVmd(bytes);
      this.recordSuccessfulCoreUse(core);
      return animation;
    } catch (error) {
      if (this.useExplicitCore) {
        throw error;
      }
      this.options.onCoreFallback?.({ operation: "loadVmd", error });
      this.coreDiagnostic = {
        kind: "fallback",
        operation: "loadVmd",
        reason: formatDiagnosticReason(error)
      };
      this.fallbackCore ??= new FallbackCore();
      return this.fallbackCore.loadVmd(bytes);
    }
  }

  private recordSuccessfulCoreUse(core: MmdCore): void {
    this.coreDiagnostic = this.createSuccessfulCoreDiagnostic(core);
  }

  private createSuccessfulCoreDiagnostic(core: MmdCore): ThreeMmdCoreDiagnostic {
    if (this.useExplicitCore) {
      return { kind: "provided" };
    }
    if (core !== this.fallbackCore) {
      return { kind: "wasm" };
    }
    return this.coreDiagnostic;
  }

  async loadAnimation(source: ModelSource): Promise<ThreeMmdAnimation> {
    validateModelSource(source, "loadAnimation");
    const bytes = await readModelSourceBytes(source, { fetch: this.options.fetch });
    if (bytes.byteLength === 0) {
      throw createEmptySourceError("loadAnimation");
    }
    const core = await this.getCore();
    const animation = this.loadCoreVmd(core, bytes);
    return {
      source,
      name: animation.metadata.modelName,
      animation
    };
  }

  async loadPose(source: ModelSource): Promise<ThreeMmdPose> {
    validateModelSource(source, "loadPose");
    const bytes = await readModelSourceBytes(source, { fetch: this.options.fetch });
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
    name = "pose"
  ): Promise<ThreeMmdAnimation> {
    validateModelSource(source, "loadPoseAnimation");
    const bytes = await readModelSourceBytes(source, { fetch: this.options.fetch });
    if (bytes.byteLength === 0) {
      throw createEmptySourceError("loadPoseAnimation");
    }
    const pose = parseVpd(bytes);
    const animation = createMmdAnimationFromPose(pose, name);
    return {
      source,
      name,
      animation
    };
  }
}

function createThreeMmdModel(options: {
  readonly mesh: THREE.SkinnedMesh;
  readonly runtime: MmdRuntime;
  readonly source: ThreeMmdModelSourceDescriptor;
  readonly sourceDiagnostic: ModelSourceDiagnostic;
  readonly coreDiagnostic: ThreeMmdCoreDiagnostic;
  readonly textureDiagnostics: readonly TextureLoadDiagnostic[];
  readonly materialDiagnostics: readonly MaterialTransparencyDiagnostic[];
  readonly performanceDiagnostics: readonly LoaderPerformanceMeasure[];
  readonly materials: readonly LoaderMmdModelData["materials"][number][];
  readonly outlines: boolean;
  readonly renderOrderProxies: boolean;
}): ThreeMmdModel {
  const outlineMeshes = options.outlines
    ? createMmdOutlineMeshes({
        mesh: options.mesh,
        materials: options.materials
      })
    : [];
  if (options.materials.some((material) => mmdMaterialCastsSelfShadow(material.flags))) {
    options.mesh.layers.enable(MMD_SELF_SHADOW_LAYER);
  }
  outlineMeshes.forEach((outline) => {
    syncMmdModelShadowFlags(outline, options.materials);
    outline.frustumCulled = options.mesh.frustumCulled;
  });
  // MMD-compatible material order and per-material shadow flags need body
  // proxies; outline proxies then interleave with the same material order.
  const renderOrderMeshes = options.renderOrderProxies
    ? createMmdMaterialRenderOrderMeshes({
        mesh: options.mesh,
        materials: options.materials
      }, {
        shadowOnly: !options.outlines
      })
    : [];
  if (options.outlines && renderOrderMeshes.length > 0) {
    options.mesh.geometry.setDrawRange(0, 0);
  }
  if (renderOrderMeshes.length > 0) {
    options.mesh.castShadow = false;
  }
  const object = new THREE.Group();
  object.name = options.mesh.name;
  object.add(options.mesh, ...renderOrderMeshes, ...outlineMeshes);
  const runtimeTickOptions: MutableMmdRuntimeTickOptions = { mesh: object };
  return {
    root: object,
    get object() {
      warnDeprecatedApi("ThreeMmdModel.object", "ThreeMmdModel.root");
      return object;
    },
    mesh: options.mesh,
    outlineMeshes,
    renderOrderMeshes,
    runtime: options.runtime,
    source: options.source,
    diagnostics: {
      core: options.coreDiagnostic,
      source: options.sourceDiagnostic,
      textures: options.textureDiagnostics,
      materials: options.materialDiagnostics,
      performance: options.performanceDiagnostics
    },
    get textureDiagnostics() {
      warnDeprecatedApi(
        "ThreeMmdModel.textureDiagnostics",
        "ThreeMmdModel.diagnostics.textures"
      );
      return options.textureDiagnostics;
    },
    setAnimation(animation) {
      options.runtime.setAnimation(unwrapThreeMmdAnimation(animation), options.mesh);
    },
    update(seconds, updateOptions) {
      runtimeTickOptions.physics = updateOptions?.physics;
      runtimeTickOptions.ik = updateOptions?.ik;
      return options.runtime.tick(seconds, runtimeTickOptions);
    }
  };
}

type MutableMmdRuntimeTickOptions = {
  -readonly [K in keyof MmdRuntimeTickOptions]: MmdRuntimeTickOptions[K];
};

function unwrapThreeMmdAnimation(animation: MmdAnimation | ThreeMmdAnimation): MmdAnimation {
  return "animation" in animation ? animation.animation : animation;
}

const deprecatedApiWarnings = new Set<string>();

function warnDeprecatedLoadModelOptions(options: ThreeMmdLoadModelOptions): void {
  if (options.outlines !== undefined) {
    warnDeprecatedApi("ThreeMmdLoadModelOptions.outlines", "outline");
  }
  if (options.renderOrderProxies !== undefined) {
    warnDeprecatedApi("ThreeMmdLoadModelOptions.renderOrderProxies", "materialRenderOrder");
  }
}

function validateLoadModelOptions(options: ThreeMmdLoadModelOptions): void {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("ThreeMmdLoader.loadModel options must be an object");
  }
  if (options.fetch !== undefined && typeof options.fetch !== "function") {
    throw new TypeError("ThreeMmdLoader.loadModel fetch must be a function");
  }
}

function warnDeprecatedApi(name: string, replacement: string): void {
  if (deprecatedApiWarnings.has(name)) {
    return;
  }
  deprecatedApiWarnings.add(name);
  globalThis.console?.warn?.(
    `[three-mmd-loader] ${name} is deprecated and will be removed in the next breaking release. Use ${replacement} instead.`
  );
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

function describeModelSourceForPerformance(source: ModelSource): string {
  if (typeof source === "string") {
    return `url:${source.split(/[\\/]/).at(-1) ?? "model"}`;
  }
  if (typeof File !== "undefined" && source instanceof File) {
    return `file:${source.name || "model"}`;
  }
  if (source instanceof Uint8Array) {
    return `bytes:${source.byteLength}`;
  }
  if (source instanceof ArrayBuffer) {
    return `array-buffer:${source.byteLength}`;
  }
  return "model";
}

function createEmptySourceError(method: string): Error {
  return new Error(`ThreeMmdLoader.${method} source must not be empty`);
}

function normalizeLoaderPerformanceOptions(
  performanceOptions: ThreeMmdLoaderOptions["performance"]
): LoaderPerformanceOptions {
  if (performanceOptions === true) {
    return { enabled: true };
  }
  if (performanceOptions && typeof performanceOptions === "object") {
    return performanceOptions;
  }
  return {};
}

function formatDiagnosticReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createThreeMmdMesh(modelData: LoaderMmdModelData): THREE.SkinnedMesh {
  const geometry = createThreeBufferGeometry(
    modelData.geometry,
    modelData.materials,
    modelData.morphs
  );
  const materials = createThreeMmdMaterials(modelData.materials);
  if (geometry.userData.mmdSdef || geometry.userData.mmdQdef) {
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
    comment: modelData.metadata.comment,
    englishComment: modelData.metadata.englishComment,
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
      if (boneData.ikStateName !== undefined) {
        bone.userData.mmdIkStateName = boneData.ikStateName;
      }
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
          fixedAxis: createRuntimeIkLinkFixedAxis(modelData, boneIndex, link.boneIndex),
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

function createRuntimeIkLinkFixedAxis(
  modelData: LoaderMmdModelData,
  chainBoneIndex: number,
  boneIndex: number
): [number, number, number] | undefined {
  const chainBone = modelData.skeleton.bones[chainBoneIndex];
  const bone = modelData.skeleton.bones[boneIndex];
  const fixedAxis = bone?.fixedAxis;
  if (!isHandTwistIkChain(chainBone) || !bone?.flags?.hasFixedAxis || !fixedAxis) {
    return undefined;
  }
  return [normalizeSignedZero(-fixedAxis[0]), normalizeSignedZero(-fixedAxis[1]), normalizeSignedZero(fixedAxis[2])];
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function isHandTwistIkChain(bone: LoaderMmdModelData["skeleton"]["bones"][number] | undefined): boolean {
  return (
    bone?.name.includes("手捩IK") === true ||
    bone?.englishName.includes("lwr-arm-twistIK") === true
  );
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
  const boneTracks: MmdAnimation["boneTracks"] = {};
  for (const [boneName, bonePose] of Object.entries(pose.bones)) {
    boneTracks[boneName] = {
      packed: "bone",
      frames: new Uint32Array([0]),
      translations: new Float32Array(bonePose.translation),
      rotations: new Float32Array(bonePose.rotation),
      interpolations: new Float32Array(16),
      physicsToggles: new Int8Array([-1])
    } satisfies VmdBoneTrack;
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

  if (options.ddsLoader !== undefined) {
    if (typeof options.ddsLoader !== "object" || options.ddsLoader === null) {
      throw new TypeError("ThreeMmdLoader ddsLoader must be an object");
    }
    if (typeof options.ddsLoader.load !== "function") {
      throw new TypeError("ThreeMmdLoader ddsLoader.load must be a function");
    }
  }

  if (
    options.runtime !== undefined &&
    (typeof options.runtime !== "object" || options.runtime === null)
  ) {
    throw new TypeError("ThreeMmdLoader runtime options must be an object");
  }

  if (
    options.core !== undefined &&
    (typeof options.core !== "object" || options.core === null || Array.isArray(options.core))
  ) {
    throw new TypeError("ThreeMmdLoader core must be an object or Promise-like object");
  }

  if (options.onCoreFallback !== undefined && typeof options.onCoreFallback !== "function") {
    throw new TypeError("ThreeMmdLoader onCoreFallback must be a function");
  }

  if (options.runtimeFactory !== undefined && typeof options.runtimeFactory !== "function") {
    throw new TypeError("ThreeMmdLoader runtimeFactory must be a function");
  }

  if (options.fetch !== undefined && typeof options.fetch !== "function") {
    throw new TypeError("ThreeMmdLoader fetch must be a function");
  }

  if (
    options.performance !== undefined &&
    typeof options.performance !== "boolean" &&
    (typeof options.performance !== "object" ||
      options.performance === null ||
      Array.isArray(options.performance))
  ) {
    throw new TypeError("ThreeMmdLoader performance must be a boolean or options object");
  }

  if (
    typeof options.performance === "object" &&
    options.performance !== null &&
    options.performance.onMeasure !== undefined &&
    typeof options.performance.onMeasure !== "function"
  ) {
    throw new TypeError("ThreeMmdLoader performance.onMeasure must be a function");
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
