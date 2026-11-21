import type * as THREE from "three";
import * as mmdAnimWasm from "../parser/wasm/generated/mmd_anim_wasm.js";
import { FallbackCore, initCore } from "../parser/wasm/index.js";
import { parseVpd } from "../parser/index.js";
import type { MmdAnimation, MmdCore } from "../parser/model/modelTypes.js";
import {
  MmdAnimRuntime,
  DefaultMmdRuntime,
  createMmdAnimWasmCameraTrack,
  createMmdAnimWasmLightTrack,
  type MmdAnimRuntimeWasmModule,
  type MmdAnimRuntimeWasmCameraTrack,
  type MmdAnimRuntimeWasmLightTrack,
  type DefaultMmdRuntimeOptions,
  type MmdRuntime
} from "../runtime/index.js";
import { createLoaderMmdModelDataFromModel } from "./modelAssembly.js";
import { applyThreeMmdMaterialTextures, type MaterialTransparencyDiagnostic } from "./materials.js";
import {
  readModelSource,
  readModelSourceBytes,
  type ModelSource,
  describeModelSourceForPerformance,
  createEmptySourceError,
  validateModelSource
} from "./modelSource.js";
import { createLoaderPerformanceProfile } from "./performance.js";
import {
  syncMmdModelShadowFlags,
  computeMmdMaterialRenderOrder as computeMmdMaterialRenderOrderInternal
} from "./material/material-metadata.js";
import {
  type ThreeMmdLoaderOptions,
  type ThreeMmdRuntimeFactoryContext,
  type ThreeMmdLoadModelOptions,
  type ThreeMmdCoreDiagnostic,
  warnDeprecatedLoadModelOptions,
  validateLoadModelOptions,
  normalizeLoaderPerformanceOptions,
  validateLoaderOptions
} from "./loader-options.js";
import {
  type ThreeMmdModel,
  createThreeMmdModel,
  syncMorphSplitBodyMeshRenderState,
  createModelSourceDescriptor
} from "./loaded-model.js";
import {
  type ThreeMmdAnimation,
  type ThreeMmdPose,
  unwrapThreeMmdAnimation,
  createMmdAnimationFromPose
} from "./loader-animation.js";
import { createThreeMmdMesh, normalizeMeshMaterials } from "./model-mesh.js";

export class ThreeMmdLoader {
  private readonly textureCache = new Map<string, Promise<THREE.Texture | undefined>>();
  private corePromise: Promise<MmdCore> | undefined;
  private fallbackCore: FallbackCore | undefined;
  private readonly useExplicitCore: boolean;
  private coreDiagnostic: ThreeMmdCoreDiagnostic;
  private implicitMmdAnimWasmReady = false;

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
      profile?.mark("core-ready");
      const { model: parsedModel, coreDiagnostic } = this.loadCoreModel(core, bytes);
      const modelData = createLoaderMmdModelDataFromModel(parsedModel);
      let parsedModelDisposed = false;
      try {
        profile?.mark("parsed");
        const mesh = createThreeMmdMesh(modelData, {
          morphSplit: options.morphSplit ?? true,
          morphAttributes: options.morphAttributes ?? true
        });
        parsedModel.dispose?.();
        parsedModelDisposed = true;
        profile?.mark("mesh");
        const materials = normalizeMeshMaterials(mesh.material);
        warnDeprecatedLoadModelOptions(options);
        const effectiveOutlines = options.outline ?? options.outlines ?? true;
        const sourceDescriptor = createModelSourceDescriptor(source, bytes.byteLength);
        const materialDiagnostics: MaterialTransparencyDiagnostic[] = [];
        const texturePromise = applyThreeMmdMaterialTextures(materials, modelData.materials, {
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
        const textureDiagnostics = await texturePromise;
        profile?.mark("textures");
        const runtime = this.createRuntime({
          modelBytes: bytes,
          mesh,
          source: sourceDescriptor
        });
        profile?.mark("runtime-ready");
        const renderOrder = computeMmdMaterialRenderOrderInternal(
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
        syncMorphSplitBodyMeshRenderState(mesh, modelData.materials);
        profile?.mark("materials");
        const model = createThreeMmdModel({
          mesh,
          runtime,
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
        profile?.measure("init-core", "bytes", "core-ready");
        profile?.measure("parse-only", "core-ready", "parsed");
        profile?.measure("init-runtime", "textures", "runtime-ready");
        profile?.measure("create-proxies", "materials", "assembled");
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
    const explicitRuntime = this.options.runtimeFactory?.(context);
    if (explicitRuntime) {
      return explicitRuntime;
    }
    if (this.canCreateImplicitMmdAnimRuntime(context)) {
      try {
        return MmdAnimRuntime.fromPmxBytes(
          mmdAnimWasm as unknown as MmdAnimRuntimeWasmModule,
          context.modelBytes,
          normalizeMmdAnimRuntimeOptions(this.options.runtime)
        );
      } catch {
        return new DefaultMmdRuntime(this.options.runtime);
      }
    }
    return new DefaultMmdRuntime(this.options.runtime);
  }

  private canCreateImplicitMmdAnimRuntime(context: ThreeMmdRuntimeFactoryContext): boolean {
    return (
      this.implicitMmdAnimWasmReady &&
      !this.useExplicitCore &&
      isPmxBytes(context.modelBytes) &&
      this.options.runtime?.physics !== "stateful-spring"
    );
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
        this.implicitMmdAnimWasmReady = false;
      } else {
        this.coreDiagnostic = { kind: "wasm" };
        this.implicitMmdAnimWasmReady = true;
      }
      return core;
    } catch (error) {
      this.options.onCoreFallback?.({ operation: "initCore", error });
      this.coreDiagnostic = {
        kind: "fallback",
        operation: "initCore",
        reason: formatDiagnosticReason(error)
      };
      this.implicitMmdAnimWasmReady = false;
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

  createCameraTrack(animation: MmdAnimation | ThreeMmdAnimation): MmdAnimRuntimeWasmCameraTrack | undefined {
    if (!this.implicitMmdAnimWasmReady || this.useExplicitCore) {
      return undefined;
    }
    const mmdAnimation = unwrapThreeMmdAnimation(animation);
    if (
      mmdAnimation.bytes.byteLength === 0 ||
      (mmdAnimation.metadata.counts.cameras === 0 && mmdAnimation.cameraFrames.length === 0)
    ) {
      return undefined;
    }
    try {
      return createMmdAnimWasmCameraTrack(
        mmdAnimWasm as unknown as Pick<MmdAnimRuntimeWasmModule, "WasmVmdCameraTrack">,
        mmdAnimation.bytes
      );
    } catch {
      return undefined;
    }
  }

  createLightTrack(animation: MmdAnimation | ThreeMmdAnimation): MmdAnimRuntimeWasmLightTrack | undefined {
    if (!this.implicitMmdAnimWasmReady || this.useExplicitCore) {
      return undefined;
    }
    const mmdAnimation = unwrapThreeMmdAnimation(animation);
    if (
      mmdAnimation.bytes.byteLength === 0 ||
      (mmdAnimation.metadata.counts.lights === 0 && mmdAnimation.lightFrames.length === 0)
    ) {
      return undefined;
    }
    try {
      return createMmdAnimWasmLightTrack(
        mmdAnimWasm as unknown as Pick<MmdAnimRuntimeWasmModule, "WasmVmdLightTrack">,
        mmdAnimation.bytes
      );
    } catch {
      return undefined;
    }
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

function formatDiagnosticReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeMmdAnimRuntimeOptions(
  options: DefaultMmdRuntimeOptions | undefined
): Parameters<typeof MmdAnimRuntime.fromPmxBytes>[2] {
  return {
    frameRate: options?.frameRate,
    initialSeconds: options?.initialSeconds,
    physics: options?.physics === "external" ? "external" : "none",
    physicsBackend: options?.physicsBackend,
    ikTolerance: options?.ikTolerance,
    ikMaxIterationsCap: options?.ikMaxIterationsCap
  };
}

function isPmxBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4d &&
    bytes[2] === 0x58 &&
    bytes[3] === 0x20
  );
}
