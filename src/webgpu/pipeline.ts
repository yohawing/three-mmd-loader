import * as THREE from "three/webgpu";

import type { MaterialRuntimeState } from "../parser/model/modelTypes.js";
import {
  replaceMmdModelMaterialsWithTsl,
  type MmdTslMaterialAssemblyOptions
} from "./material-assembly.js";
import {
  syncMmdTslMaterialState,
  type MmdTslMaterialUniforms
} from "./material-core.js";
import {
  createMmdTslSelfShadowPass,
  type MmdTslSelfShadowPass
} from "./self-shadow-pass.js";
import {
  computeMmdTslSparsePositionMorphs,
  disposeMmdTslSparsePositionMorphs,
  enableMmdTslSparsePositionMorphs
} from "./sparse-morph-runtime.js";
import {
  createMmdTslShadowCaster,
  disposeMmdTslShadowCaster
} from "./shadow-caster.js";

/** The smallest model shape accepted by the TSL facade. */
export interface MmdTslPipelineModel {
  readonly root: THREE.Object3D;
  readonly mesh: THREE.SkinnedMesh;
}

/** Structured load options shared by TSL model callers. */
export interface MmdTslModelLoadOptions {
  readonly frustumCulled: false;
  readonly morphSplit: false;
  readonly morphAttributes: boolean;
  readonly outline: false;
  readonly materialRenderOrder: false;
  readonly [key: string]: unknown;
}

export interface MmdTslPipelineAttachOptions {
  readonly light?: THREE.DirectionalLight;
  /** Backgrounds can opt out of the sparse position-morph compute path. */
  readonly sparseMorphs?: boolean;
  readonly selfShadowEnabled?: boolean;
  /** Alias for selfShadowEnabled for callers that use the feature name. */
  readonly selfShadow?: boolean;
}

export interface MmdTslPipelineOptions {
  readonly light?: THREE.DirectionalLight;
  readonly selfShadowEnabled?: boolean;
  readonly selfShadowMode?: 0 | 1 | 2;
  /** Optional application-specific MMD toon-ramp coordinate offset. */
  readonly toonCoordinateOffset?: number;
  readonly appendOutlineGroups?: boolean;
  readonly respectMaterialShadowFlags?: boolean;
}

export interface MmdTslPipeline {
  readonly renderer: THREE.WebGPURenderer;
  readonly light: THREE.DirectionalLight | undefined;
  createModelLoadOptions(
    overrides?: Partial<MmdTslModelLoadOptions>
  ): MmdTslModelLoadOptions;
  attach(model: MmdTslPipelineModel, options?: MmdTslPipelineAttachOptions): boolean;
  detach(model: MmdTslPipelineModel): boolean;
  prepareRender(scene: THREE.Scene): boolean;
  render(scene: THREE.Scene, camera: THREE.Camera): boolean;
  setSelfShadowEnabled(enabled: boolean): boolean;
  setSelfShadowMode(mode: 0 | 1 | 2): boolean;
  /** Viewer/debug integration without exposing the private self-shadow pass. */
  setReceiverVisibilityDebug(
    model: MmdTslPipelineModel,
    enabled: boolean,
    sampleTarget?: boolean
  ): boolean;
  getSelfShadowDebugState(): MmdTslSelfShadowDebugState;
  dispose(): void;
}

/** Lightweight diagnostics for tools that need to show the pipeline state. */
export interface MmdTslSelfShadowDebugState {
  readonly passReady: boolean;
  readonly attachedModelCount: number;
  readonly receiverUniformCount: number;
  readonly enabledReceiverUniformCount: number;
}

interface MmdTslAttachedModel {
  readonly model: MmdTslPipelineModel;
  readonly materials: THREE.Material[];
  readonly uniforms: MmdTslMaterialUniforms[];
  readonly receiverUniforms: MmdTslMaterialUniforms["dedicatedShadowEnabled"][];
  readonly sparseMorphs: boolean;
}

interface TslOutlineMetadata {
  readonly sourceMaterialIndex?: number;
  readonly fallback?: boolean;
  readonly flags?: { readonly groundShadow?: boolean; readonly selfShadowMap?: boolean };
  readonly uniforms?: {
    readonly color?: THREE.Vector3;
    readonly opacity?: { value: number };
    readonly width?: { value: number };
  };
  edgeColor?: number[];
  edgeSize?: number;
  outlineWidth?: number;
  runtimeVisible?: boolean;
  polygonOffsetSign?: number;
}

/**
 * Returns the load flags required by the native WebGPU TSL path.
 * Overrides are intentionally structural so this helper can be passed to
 * ThreeMmdLoader without importing the renderer-neutral loader types here.
 */
export function createModelLoadOptions(
  overrides: Partial<MmdTslModelLoadOptions> = {}
): MmdTslModelLoadOptions {
  const defaults: MmdTslModelLoadOptions = {
    frustumCulled: false,
    morphSplit: false,
    morphAttributes: false,
    outline: false,
    materialRenderOrder: false
  };
  return {
    ...defaults,
    ...overrides
  };
}

/**
 * Creates the native WebGPU TSL facade after backend initialization.
 * The factory is async because WebGPURenderer.init() performs adapter/device
 * acquisition and may reject when WebGPU is unavailable.
 */
export async function createMmdTslPipeline(
  renderer: THREE.WebGPURenderer,
  options: MmdTslPipelineOptions = {}
): Promise<MmdTslPipeline> {
  const candidate = renderer as THREE.WebGPURenderer & {
    init?: () => Promise<unknown>;
    backend?: { readonly isWebGPUBackend?: boolean };
  };
  if (typeof candidate.init !== "function") {
    throw new Error("MMD_TSL_PIPELINE_RENDERER_INIT_UNAVAILABLE: renderer.init() is required");
  }
  try {
    await candidate.init();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`MMD_TSL_PIPELINE_WEBGPU_INIT_FAILED: ${reason}`, { cause: error });
  }
  if (
    (candidate as unknown as { readonly isWebGPURenderer?: boolean }).isWebGPURenderer !== true ||
    candidate.backend?.isWebGPUBackend !== true
  ) {
    throw new Error(
      "MMD_TSL_PIPELINE_NATIVE_WEBGPU_REQUIRED: renderer initialized with a non-WebGPU backend"
    );
  }
  return createInitializedPipeline(renderer, options);
}

function createInitializedPipeline(
  renderer: THREE.WebGPURenderer,
  options: MmdTslPipelineOptions
): MmdTslPipeline {
  const attached: MmdTslAttachedModel[] = [];
  const attachedByMesh = new WeakMap<THREE.SkinnedMesh, MmdTslAttachedModel>();
  const lightPositionScratch = new THREE.Vector3();
  const lightTargetScratch = new THREE.Vector3();
  const lightDirectionScratch = new THREE.Vector3();
  let selfShadowPass: MmdTslSelfShadowPass | undefined;
  let light = options.light;
  let selfShadowEnabled = options.selfShadowEnabled === true;
  let selfShadowMode: 0 | 1 | 2 = options.selfShadowMode ?? 1;
  let disposed = false;

  const pipeline: MmdTslPipeline = {
    renderer,
    get light() {
      return light;
    },
    createModelLoadOptions(overrides = {}) {
      return createModelLoadOptions(overrides);
    },
    attach(model, attachOptions = {}) {
      if (disposed) {
        throw new Error("MMD_TSL_PIPELINE_DISPOSED");
      }
      validateModel(model);
      const existing = attachedByMesh.get(model.mesh);
      if (existing) {
        return false;
      }
      if (attachOptions.light) {
        if (light && light !== attachOptions.light) {
          throw new Error("MMD_TSL_PIPELINE_LIGHT_MISMATCH");
        }
        light = attachOptions.light;
      }
      const requestedSelfShadow = attachOptions.selfShadowEnabled ?? attachOptions.selfShadow;
      if (requestedSelfShadow !== undefined) {
        selfShadowEnabled = requestedSelfShadow;
      }

      // Bounds must describe the dense base pose before sparse output replaces
      // the position attribute used by shadow fitting.
      model.mesh.computeBoundingBox();
      const needsSelfShadowVisibility = hasSelfShadowReceiver(model.mesh);
      if (needsSelfShadowVisibility && !light) {
        throw new Error(
          "MMD_TSL_PIPELINE_SELF_SHADOW_LIGHT_REQUIRED: provide options.light before attaching a receiver model"
        );
      }
      if (needsSelfShadowVisibility && light && !selfShadowPass) {
        selfShadowPass = createMmdTslSelfShadowPass(renderer, light);
        selfShadowPass.setMode(selfShadowMode);
      }

      const sparseMorphs = attachOptions.sparseMorphs !== false &&
        enableMmdTslSparsePositionMorphs(model.mesh);
      // Keep the established viewer diagnostic marker in sync while the
      // facade owns the underlying sparse-morph state.
      model.mesh.userData.mmdTslSparsePositionMorphs = sparseMorphs;
      const assemblyOptions: MmdTslMaterialAssemblyOptions = {
        appendOutlineGroups: options.appendOutlineGroups !== false,
        respectMaterialShadowFlags: options.respectMaterialShadowFlags !== false,
        dedicatedShadowVisibilityNode: selfShadowPass?.visibilityNode,
        reversedDepth: renderer.reversedDepthBuffer === true
      };
      try {
        replaceMmdModelMaterialsWithTsl(model.mesh, assemblyOptions);
        createMmdTslShadowCaster(model.mesh, { alphaTest: false });
      } catch (error) {
        if (sparseMorphs) {
          disposeMmdTslSparsePositionMorphs(model.mesh);
        }
        delete model.mesh.userData.mmdTslSparsePositionMorphs;
        if (selfShadowPass && attached.length === 0) {
          selfShadowPass.dispose();
          selfShadowPass = undefined;
        }
        throw error;
      }

      const materials = normalizeMaterials(model.mesh.material);
      const uniforms: MmdTslMaterialUniforms[] = [];
      const receiverUniforms: MmdTslMaterialUniforms["dedicatedShadowEnabled"][] = [];
      for (let index = 0; index < materials.length; index += 1) {
        const material = materials[index];
        const candidateUniforms = material.userData.mmdTslMaterialUniforms as
          | MmdTslMaterialUniforms
          | undefined;
        if (candidateUniforms) {
          uniforms.push(candidateUniforms);
          const metadata = material.userData.mmdMaterial as
            | { flags?: { selfShadow?: boolean } }
            | undefined;
          if (metadata?.flags?.selfShadow === true) {
            receiverUniforms.push(candidateUniforms.dedicatedShadowEnabled);
          }
        }
      }
      const state: MmdTslAttachedModel = {
        model,
        materials,
        uniforms,
        receiverUniforms,
        sparseMorphs
      };
      attached.push(state);
      attachedByMesh.set(model.mesh, state);
      syncReceiverVisibility(state);
      return true;
    },
    detach(model) {
      const state = attachedByMesh.get(model.mesh);
      if (!state) {
        return false;
      }
      attachedByMesh.delete(model.mesh);
      const stateIndex = attached.indexOf(state);
      if (stateIndex >= 0) {
        attached.splice(stateIndex, 1);
      }
      disposeMmdTslShadowCaster(model.mesh);
      if (state.sparseMorphs) {
        disposeMmdTslSparsePositionMorphs(model.mesh);
      }
      delete model.mesh.userData.mmdTslSparsePositionMorphs;
      if (attached.length === 0 && selfShadowPass) {
        selfShadowPass.dispose();
        selfShadowPass = undefined;
      }
      return true;
    },
    prepareRender(_scene) {
      if (disposed) {
        return false;
      }
      syncLightUniforms();
      for (let index = 0; index < attached.length; index += 1) {
        const state = attached[index];
        if (state.sparseMorphs) {
          computeMmdTslSparsePositionMorphs(
            renderer as unknown as {
              backend?: { readonly isWebGPUBackend?: boolean };
              compute(node: THREE.Node | THREE.Node[]): Promise<void> | undefined;
            },
            state.model.mesh
          );
        }
        syncMaterialStates(state);
        syncReceiverVisibility(state);
      }
      return true;
    },
    render(scene, camera) {
      if (disposed) {
        return false;
      }
      pipeline.prepareRender(scene);
      const selfShadowPassForRender = selfShadowPass;
      const selfShadowLight = light;
      if (
        !selfShadowPassForRender ||
        !selfShadowLight ||
        !selfShadowEnabled ||
        selfShadowLight.castShadow !== true
      ) {
        renderer.render(scene, camera);
        return true;
      }
      // The dedicated MMD pass already composes receiver visibility in the
      // TSL material. Temporarily suppress Three's standard shadow map so it
      // cannot multiply the same light a second time.
      const shadowMapEnabled = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
      try {
        selfShadowPassForRender.render(renderer, scene, selfShadowLight);
        renderer.render(scene, camera);
      } finally {
        renderer.shadowMap.enabled = shadowMapEnabled;
      }
      return true;
    },
    setSelfShadowEnabled(enabled) {
      if (disposed || selfShadowEnabled === enabled) {
        return false;
      }
      selfShadowEnabled = enabled;
      for (let index = 0; index < attached.length; index += 1) {
        syncReceiverVisibility(attached[index]);
      }
      return true;
    },
    setSelfShadowMode(mode) {
      if (disposed || (mode !== 0 && mode !== 1 && mode !== 2)) {
        return false;
      }
      const changed = selfShadowMode !== mode;
      selfShadowMode = mode;
      if (selfShadowPass) {
        selfShadowPass.setMode(mode);
      }
      return changed;
    },
    setReceiverVisibilityDebug(model, enabled, sampleTarget = true) {
      if (disposed || !selfShadowPass || !attachedByMesh.has(model.mesh)) {
        return false;
      }
      return selfShadowPass.setReceiverVisibilityDebug(model.root, enabled, sampleTarget);
    },
    getSelfShadowDebugState() {
      let receiverUniformCount = 0;
      let enabledReceiverUniformCount = 0;
      for (let modelIndex = 0; modelIndex < attached.length; modelIndex += 1) {
        const receiverUniforms = attached[modelIndex].receiverUniforms;
        receiverUniformCount += receiverUniforms.length;
        for (let uniformIndex = 0; uniformIndex < receiverUniforms.length; uniformIndex += 1) {
          if (receiverUniforms[uniformIndex].value === 1) {
            enabledReceiverUniformCount += 1;
          }
        }
      }
      return {
        passReady: selfShadowPass !== undefined,
        attachedModelCount: attached.length,
        receiverUniformCount,
        enabledReceiverUniformCount
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      while (attached.length > 0) {
        const state = attached[attached.length - 1];
        if (!state) {
          attached.pop();
          continue;
        }
        attachedByMesh.delete(state.model.mesh);
        disposeMmdTslShadowCaster(state.model.mesh);
        if (state.sparseMorphs) {
          disposeMmdTslSparsePositionMorphs(state.model.mesh);
        }
        delete state.model.mesh.userData.mmdTslSparsePositionMorphs;
        attached.pop();
      }
      if (selfShadowPass) {
        selfShadowPass.dispose();
        selfShadowPass = undefined;
      }
    }
  };

  function syncLightUniforms(): void {
    if (!light) {
      return;
    }
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    lightPositionScratch.setFromMatrixPosition(light.matrixWorld);
    lightTargetScratch.setFromMatrixPosition(light.target.matrixWorld);
    lightDirectionScratch.copy(lightPositionScratch).sub(lightTargetScratch).normalize();
    for (let modelIndex = 0; modelIndex < attached.length; modelIndex += 1) {
      const state = attached[modelIndex];
      for (let materialIndex = 0; materialIndex < state.uniforms.length; materialIndex += 1) {
        const uniforms = state.uniforms[materialIndex];
        uniforms.lightDirection.copy(lightDirectionScratch);
        if (light.visible) {
          uniforms.lightColor.set(
            light.color.r * light.intensity,
            light.color.g * light.intensity,
            light.color.b * light.intensity
          );
        } else {
          uniforms.lightColor.set(0, 0, 0);
        }
        if (options.toonCoordinateOffset !== undefined) {
          uniforms.toonCoordinateOffset.value = options.toonCoordinateOffset;
        }
      }
    }
  }

  function syncMaterialStates(state: MmdTslAttachedModel): void {
    for (let materialIndex = 0; materialIndex < state.materials.length; materialIndex += 1) {
      const material = state.materials[materialIndex];
      const outline = material.userData.mmdTslOutlineMaterial as TslOutlineMetadata | undefined;
      if (outline) {
        const sourceIndex = outline.sourceMaterialIndex;
        const sourceMaterial = typeof sourceIndex === "number" ? state.materials[sourceIndex] : undefined;
        const materialState = sourceMaterial?.userData.mmdMaterialState as MaterialRuntimeState | undefined;
        if (materialState) {
          syncOutlineMaterialState(material, materialState, outline);
        }
        continue;
      }
      const materialState = material.userData.mmdMaterialState as MaterialRuntimeState | undefined;
      if (materialState) {
        syncMmdTslMaterialState(material, materialState);
      }
    }
  }

  function syncReceiverVisibility(state: MmdTslAttachedModel): void {
    const enabled = selfShadowEnabled && light?.castShadow === true && selfShadowPass !== undefined;
    const value = enabled ? 1 : 0;
    for (let index = 0; index < state.receiverUniforms.length; index += 1) {
      state.receiverUniforms[index].value = value;
    }
  }

  return pipeline;
}

function validateModel(model: MmdTslPipelineModel): void {
  if (!model || !model.root || !model.mesh) {
    throw new TypeError("MMD_TSL_PIPELINE_MODEL_INVALID: root and mesh are required");
  }
}

function normalizeMaterials(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function hasSelfShadowReceiver(mesh: THREE.SkinnedMesh): boolean {
  const materials = normalizeMaterials(mesh.material);
  for (let index = 0; index < materials.length; index += 1) {
    const flags = materials[index].userData.mmdMaterial as
      | { flags?: { selfShadow?: boolean } }
      | undefined;
    if (flags?.flags?.selfShadow === true) {
      return true;
    }
  }
  return false;
}

function syncOutlineMaterialState(
  material: THREE.Material,
  state: MaterialRuntimeState,
  metadata: TslOutlineMetadata
): void {
  const alpha = clampColor(state.edgeColor[3]);
  const outlineWidth = Math.max(metadata.fallback && state.edgeSize <= 0 ? 0.5 : state.edgeSize, 0);
  metadata.uniforms?.color?.set(
    clampColor(state.edgeColor[0]),
    clampColor(state.edgeColor[1]),
    clampColor(state.edgeColor[2])
  );
  if (metadata.uniforms?.opacity) {
    metadata.uniforms.opacity.value = metadata.fallback ? metadata.uniforms.opacity.value : alpha;
  }
  if (metadata.uniforms?.width) {
    metadata.uniforms.width.value = outlineWidth;
  }
  material.opacity = metadata.fallback ? material.opacity : alpha;
  material.transparent = true;
  const suppressColor = alpha <= 0 &&
    (metadata.flags?.groundShadow === true || metadata.flags?.selfShadowMap === true);
  const runtimeVisible = !suppressColor &&
    (metadata.fallback === true || (state.edgeSize > 0 && alpha > 0));
  metadata.runtimeVisible = runtimeVisible;
  material.visible = runtimeVisible;
  material.depthWrite = true;
  const polygonOffsetSign = metadata.polygonOffsetSign ?? 1;
  material.polygonOffsetFactor = polygonOffsetSign * (1 + 2 * outlineWidth);
  if (metadata.edgeColor) {
    metadata.edgeColor[0] = state.edgeColor[0];
    metadata.edgeColor[1] = state.edgeColor[1];
    metadata.edgeColor[2] = state.edgeColor[2];
    metadata.edgeColor[3] = state.edgeColor[3];
  }
  metadata.edgeSize = state.edgeSize;
  metadata.outlineWidth = outlineWidth;
}

function clampColor(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}
