import * as THREE from "three";
import type { BoneData, JointData, MmdAnimation, ModelMetadata, RigidBodyData } from "../parser/model/modelTypes.js";
import type {
  MmdFrameState,
  MmdRuntime,
  MmdRuntimeAsyncEvaluateOptions,
  MmdRuntimeEvaluateOptions,
  MmdRuntimeTickOptions
} from "../runtime/index.js";
import type { LoaderMmdModelData } from "./internalModelData.js";
import type { MaterialTransparencyDiagnostic, TextureLoadDiagnostic } from "./materials.js";
import type { LoaderPerformanceMeasure } from "./performance.js";
import { MMD_SELF_SHADOW_LAYER } from "./shadow.js";
import { createMaterialMorphAlphaSync } from "./material/material-morph-alpha.js";
import type { ModelSource, ModelSourceDiagnostic } from "./modelSource.js";
import {
  mmdMaterialCastsSelfShadow,
  syncMmdModelShadowFlags,
  mmdMaterialCastsShadow as mmdMaterialCastsShadowInternal,
  type MmdMaterialRenderOrderEntry as MmdMaterialRenderOrderEntryInternal
} from "./material/material-metadata.js";
import {
  createMmdMaterialRenderOrderMeshes as createMmdMaterialRenderOrderMeshesInternal,
  createMmdOutlineMeshes as createMmdOutlineMeshesInternal
} from "./outline.js";
import { type ThreeMmdCoreDiagnostic, warnDeprecatedApi } from "./loader-options.js";
import { type ThreeMmdAnimation, unwrapThreeMmdAnimation } from "./loader-animation.js";

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
   * @deprecated Use root instead. This alias will be removed in 1.0.0.
   */
  readonly object: THREE.Group;
  /** Base MMD SkinnedMesh for advanced access and runtime binding. */
  readonly mesh: THREE.SkinnedMesh;
  readonly metadata: Readonly<ModelMetadata>;
  readonly bones: readonly BoneData[];
  readonly rigidBodies: readonly RigidBodyData[];
  readonly joints: readonly JointData[];
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
   * @deprecated Use diagnostics.textures instead. This alias will be removed in 1.0.0.
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
  /** Evaluates and applies an exact frame before resolving. */
  updateAsync(seconds: number, options?: MmdRuntimeAsyncEvaluateOptions): Promise<MmdFrameState>;
}

export function createThreeMmdModel({ morphs, ...options }: {
  readonly mesh: THREE.SkinnedMesh;
  readonly runtime: MmdRuntime;
  readonly source: ThreeMmdModelSourceDescriptor;
  readonly sourceDiagnostic: ModelSourceDiagnostic;
  readonly coreDiagnostic: ThreeMmdCoreDiagnostic;
  readonly textureDiagnostics: readonly TextureLoadDiagnostic[];
  readonly materialDiagnostics: readonly MaterialTransparencyDiagnostic[];
  readonly performanceDiagnostics: readonly LoaderPerformanceMeasure[];
  readonly materials: readonly LoaderMmdModelData["materials"][number][];
  readonly morphs: LoaderMmdModelData["morphs"];
  readonly outlines: boolean;
  readonly renderOrderProxies: boolean;
} & Pick<ThreeMmdModel, "metadata" | "bones" | "rigidBodies" | "joints">): ThreeMmdModel {
  const bodyMeshes = readMorphSplitBodyMeshes(options.mesh);
  const outlineSources = bodyMeshes.length > 0 ? bodyMeshes : [options.mesh];
  const outlineMeshes = options.outlines
    ? outlineSources.flatMap((mesh) =>
        createMmdOutlineMeshesInternal({
          mesh,
          materials: options.materials
        })
      )
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
  const renderOrderMeshes = options.renderOrderProxies && bodyMeshes.length === 0
    ? createMmdMaterialRenderOrderMeshesInternal({
        mesh: options.mesh,
        materials: options.materials
      }, {
        shadowOnly: !options.outlines
      })
    : [];
  if (renderOrderMeshes.length > 0 || bodyMeshes.length > 0) {
    options.mesh.geometry.setDrawRange(0, 0);
  }
  if (renderOrderMeshes.length > 0) {
    options.mesh.castShadow = false;
  }
  const object = new THREE.Group();
  object.name = options.mesh.name;
  object.add(options.mesh, ...bodyMeshes, ...renderOrderMeshes, ...outlineMeshes);
  const runtimeTickOptions: MutableMmdRuntimeTickOptions = { mesh: object };
  const syncAlpha = createMaterialMorphAlphaSync(options.mesh, options.materials, morphs, renderOrderMeshes, outlineMeshes);
  return {
    root: object,
    get object() {
      warnDeprecatedApi("ThreeMmdModel.object", "ThreeMmdModel.root");
      return object;
    },
    mesh: options.mesh,
    metadata: options.metadata,
    bones: options.bones,
    rigidBodies: options.rigidBodies,
    joints: options.joints,
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
      runtimeTickOptions.morphOverrides = updateOptions?.morphOverrides;
      const state = options.runtime.tick(seconds, runtimeTickOptions);
      syncAlpha?.();
      return state;
    },
    updateAsync(seconds, updateOptions) {
      runtimeTickOptions.physics = updateOptions?.physics;
      runtimeTickOptions.ik = updateOptions?.ik;
      runtimeTickOptions.morphOverrides = updateOptions?.morphOverrides;
      const tickAsync = options.runtime.tickAsync;
      if (tickAsync) {
        const pending = tickAsync.call(options.runtime, seconds, {
          ...runtimeTickOptions,
          signal: updateOptions?.signal
        });
        return syncAlpha ? pending.then(state => { syncAlpha(); return state; }) : pending;
      }
      const state = options.runtime.tick(seconds, runtimeTickOptions);
      syncAlpha?.();
      return Promise.resolve({
        seconds: state.seconds,
        frame: state.frame,
        frameRate: state.frameRate
      });
    }
  };
}

type MutableMmdRuntimeTickOptions = {
  -readonly [K in keyof MmdRuntimeTickOptions]: MmdRuntimeTickOptions[K];
};

function readMorphSplitBodyMeshes(mesh: THREE.SkinnedMesh): THREE.SkinnedMesh[] {
  const bodyMeshes = mesh.userData.mmdMorphSplitBodyMeshes;
  return Array.isArray(bodyMeshes)
    ? bodyMeshes.filter((candidate): candidate is THREE.SkinnedMesh => isSkinnedMesh(candidate))
    : [];
}

function isSkinnedMesh(value: unknown): value is THREE.SkinnedMesh {
  return (
    value instanceof THREE.SkinnedMesh ||
    (typeof value === "object" &&
      value !== null &&
      (value as { readonly isSkinnedMesh?: unknown }).isSkinnedMesh === true)
  );
}

export function syncMorphSplitBodyMeshRenderState(
  mesh: THREE.SkinnedMesh,
  materials: readonly LoaderMmdModelData["materials"][number][]
): void {
  const bodyMeshes = readMorphSplitBodyMeshes(mesh);
  if (bodyMeshes.length === 0) {
    return;
  }
  const renderOrder = mesh.userData.mmdMaterialRenderOrder as
    | readonly MmdMaterialRenderOrderEntryInternal[]
    | undefined;
  const renderOrderByMaterial = new Map(
    (renderOrder ?? []).map((entry) => [entry.materialIndex, entry.renderOrder])
  );
  for (const body of bodyMeshes) {
    const materialIndex = (body.userData.mmdMorphSplitBody as
      | { readonly materialIndex?: unknown }
      | undefined)?.materialIndex;
    if (typeof materialIndex !== "number") {
      continue;
    }
    body.renderOrder = (renderOrderByMaterial.get(materialIndex) ?? materialIndex) * 2;
    body.userData.mmdMaterialRenderOrder = [{
      materialIndex,
      bucket: renderOrder?.find((entry) => entry.materialIndex === materialIndex)?.bucket ?? "opaque",
      renderOrder: 0
    }];
    body.frustumCulled = mesh.frustumCulled;
    const material = materials[materialIndex];
    body.castShadow = !!material && mmdMaterialCastsShadowInternal(material.flags);
    body.receiveShadow = !!material?.flags.selfShadow;
  }
}

export function createModelSourceDescriptor(
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
