import * as THREE from "three";

import { dom, setStatus } from "./dom.js";
import { state } from "./state.js";

const lightPositionScratch = new THREE.Vector3();
const lightTargetScratch = new THREE.Vector3();
const lightDirectionScratch = new THREE.Vector3();
const syncedLightToonCoordinateOffset = 0.5;
let webgpuPipelineModulePromise;
let replaceMmdModelMaterialsWithTsl;
let createMmdTslShadowCaster;
let disposeMmdTslShadowCaster;
let syncMmdTslMaterialState;
let computeMmdTslSparsePositionMorphs;
let disposeMmdTslSparsePositionMorphs;
let enableMmdTslSparsePositionMorphs;
let createMmdTslSelfShadowPass;
let mmdTslSelfShadowPass;
let mmdTslSelfShadowPassRenderer;
let mmdTslDedicatedRawVisibilityDebugActive = false;
const mmdTslSelfShadowModelRoots = new Set();
const mmdTslDedicatedShadowUniforms = new Set();
const mmdTslDedicatedShadowUniformsByRoot = new WeakMap();

export function isTslViewerPipeline() {
  return state.viewerPipeline !== "baseline-webgl";
}

export function createViewerModelLoadOptions() {
  return isTslViewerPipeline()
    ? {
        frustumCulled: false,
        morphSplit: false,
        morphAttributes: state.renderer?.backend?.isWebGPUBackend === true ? false : true,
        outline: false,
        materialRenderOrder: false
      }
    : { frustumCulled: false };
}

export function createViewerBackgroundLoadOptions() {
  return isTslViewerPipeline()
    ? {
        frustumCulled: false,
        morphSplit: false,
        // Backgrounds never enter the viewer's sparse-morph compute pass.
        morphAttributes: true,
        outline: false,
        materialRenderOrder: false
      }
    : { frustumCulled: false };
}

export async function applyViewerPipelineToModel(model, label, { role = "character", shouldCommit } = {}) {
  const tslPipeline = isTslViewerPipeline();
  if (tslPipeline) {
    await loadWebgpuPipelineModule();
  }
  if (shouldCommit && !shouldCommit()) {
    return false;
  }
  if (role === "character") {
    state.pipelineModelName = label || model.mesh.name || "model";
  }
  if (tslPipeline) {
    if (role === "character" && state.renderer?.backend?.isWebGPUBackend === true) {
      // Sparse morph output lives in GPU storage, so keep the CPU base-pose
      // bounds before replacing position attributes. Shadow fitting uses
      // Box3.setFromObject() and must not see the zero-initialized output buffer.
      model.mesh.computeBoundingBox();
      model.mesh.userData.mmdTslSparsePositionMorphs = enableMmdTslSparsePositionMorphs(model.mesh);
    }
    ensureMmdTslSelfShadowPass();
    try {
      replaceMmdModelMaterialsWithTsl(model.mesh, {
        appendOutlineGroups: true,
        respectMaterialShadowFlags: true,
        dedicatedShadowVisibilityNode: mmdTslSelfShadowPass?.visibilityNode,
        reversedDepth: state.renderer?.reversedDepthBuffer === true
      });
      createMmdTslShadowCaster(model.mesh, { alphaTest: false });
      model.root.userData.mmdTslSelfShadowRole = role;
      mmdTslSelfShadowModelRoots.add(model.root);
      registerTslDedicatedShadowUniforms(model.root, model.mesh, true);
      syncTslDedicatedShadowVisibility(
        model.root,
        state.debugSelfShadowEnabled === true && state.keyLight?.castShadow === true
      );
      syncTslMaterialStates(model.mesh.material);
      syncTslMaterialLight(model.mesh.material);
    } catch (error) {
      mmdTslSelfShadowModelRoots.delete(model.root);
      unregisterTslDedicatedShadowUniforms(model.root);
      disposeMmdTslSelfShadowPassIfUnused();
      throw error;
    }
  }
  updateViewerPipelineStatus();
  return true;
}

export function clearViewerPipelineModel() {
  mmdTslDedicatedRawVisibilityDebugActive = false;
  disposeMmdTslSelfShadowPassIfUnused();
  state.pipelineModelName = "(none)";
  updateViewerPipelineStatus();
}

export function updateViewerPipelineStatus() {
  if (dom.pipelineBackendSwitcher && dom.pipelineBackendSwitcher.value !== state.rendererBackend) {
    dom.pipelineBackendSwitcher.value = state.rendererBackend;
    dom.pipelineBackendSwitcher.setAttribute("value", state.rendererBackend);
  }
}

export function syncViewerTslLight() {
  if (!isTslViewerPipeline()) {
    return;
  }
  if (state.currentModel?.mesh?.material) {
    syncTslMaterialLight(state.currentModel.mesh.material);
  }
  if (state.currentBackground?.mesh?.material) {
    syncTslMaterialLight(state.currentBackground.mesh.material);
  }
}

export function syncCurrentModelTslMaterialStates() {
  if (!isTslViewerPipeline() || !state.currentModel?.mesh?.material) {
    return;
  }
  syncTslMaterialStates(state.currentModel.mesh.material);
}

export function computeCurrentModelTslSparsePositionMorphs() {
  if (
    !isTslViewerPipeline() ||
    state.renderer?.backend?.isWebGPUBackend !== true ||
    !state.currentModel?.mesh ||
    !computeMmdTslSparsePositionMorphs
  ) {
    return false;
  }
  return computeMmdTslSparsePositionMorphs(state.renderer, state.currentModel.mesh);
}

export function submitViewerRender() {
  computeCurrentModelTslSparsePositionMorphs();
  if (!state.renderer || !state.scene || !state.camera) {
    return false;
  }
  syncMmdTslDedicatedShadowVisibility();
  const dedicatedShadowPassActive =
    isTslViewerPipeline() &&
    state.renderer.isWebGPURenderer === true &&
    state.debugSelfShadowEnabled === true &&
    state.keyLight?.castShadow === true &&
    Boolean(state.keyLight && createMmdTslSelfShadowPass && mmdTslSelfShadowModelRoots.size > 0);
  if (dedicatedShadowPassActive) {
    ensureMmdTslSelfShadowPass();
  }
  if (dedicatedShadowPassActive && mmdTslSelfShadowPass && state.keyLight) {
    const previousShadowMapEnabled = state.renderer.shadowMap.enabled;
    state.renderer.shadowMap.enabled = false;
    try {
      mmdTslSelfShadowPass.render(state.renderer, state.scene, state.keyLight);
      state.renderer.render(state.scene, state.camera);
    } finally {
      state.renderer.shadowMap.enabled = previousShadowMapEnabled;
    }
  } else {
    state.renderer.render(state.scene, state.camera);
  }
  return true;
}

let viewerRenderToken = 0;

// Debug-panel view toggles (selfShadow, normals) flip a renderer/material
// parameter that changes every currently-visible material's compiled shader
// permutation. A plain submitViewerRender() then recompiles every distinct
// program synchronously inside renderer.render(), which is the multi-second
// main-thread freeze measured in T070-19 on heavy real models. Precompiling
// with WebGLRenderer/WebGPURenderer's compileAsync() first keeps that cost
// off the synchronous path; the final render (once compiled) is fast.
export async function submitViewerRenderAsync() {
  const token = ++viewerRenderToken;
  const canCompileAsync =
    typeof state.renderer?.compileAsync === "function" &&
    Boolean(state.scene) &&
    Boolean(state.camera);
  if (!canCompileAsync) {
    return submitViewerRender();
  }
  const showCompilingHint = !dom.statusText?.classList.contains("is-loading");
  if (showCompilingHint) {
    setStatus("Compiling shaders…", "loading");
  }
  try {
    await state.renderer.compileAsync(state.scene, state.camera);
  } catch (error) {
    window.console?.warn?.(
      "[mmd-viewer] async shader precompile failed, falling back to a synchronous render",
      error
    );
  } finally {
    if (showCompilingHint && token === viewerRenderToken) {
      setStatus("", "ready");
    }
  }
  if (token !== viewerRenderToken) {
    // A newer toggle/render call superseded this one while we were compiling;
    // only the latest state's render is allowed to reach the canvas.
    return false;
  }
  return submitViewerRender();
}

export function disposeViewerPipelineModel(model) {
  if (!model?.mesh) {
    return false;
  }
  mmdTslSelfShadowModelRoots.delete(model.root);
  unregisterTslDedicatedShadowUniforms(model.root);
  const disposedCaster = disposeMmdTslShadowCaster?.(model.mesh) ?? false;
  const disposedSparseMorphs = disposeMmdTslSparsePositionMorphs?.(model.mesh) ?? false;
  disposeMmdTslSelfShadowPassIfUnused();
  return disposedCaster || disposedSparseMorphs;
}

export function setCurrentModelTslOutlineHidden(hidden) {
  if (!isTslViewerPipeline() || !state.currentModel?.mesh?.material) {
    return;
  }
  setTslOutlineHidden(state.currentModel.mesh.material, hidden);
}

export function setMmdTslDedicatedRawVisibilityDebug(enabled = true) {
  if (!isTslViewerPipeline() || state.renderer?.isWebGPURenderer !== true) {
    return false;
  }
  const root = state.currentModel?.root;
  if (enabled) {
    mmdTslDedicatedRawVisibilityDebugActive = false;
    if (!root) {
      return false;
    }
    ensureMmdTslSelfShadowPass();
    if (!mmdTslSelfShadowPass) {
      return false;
    }
    mmdTslDedicatedRawVisibilityDebugActive = true;
  } else {
    mmdTslDedicatedRawVisibilityDebugActive = false;
  }
  if (!root || !mmdTslSelfShadowPass) {
    return false;
  }
  const changed = mmdTslSelfShadowPass.setReceiverVisibilityDebug(
    root,
    enabled,
    state.debugSelfShadowEnabled === true
  );
  if (changed) {
    syncTslDedicatedShadowVisibility(root, enabled);
    submitViewerRender();
  }
  return changed;
}

export function syncMmdTslDedicatedRawVisibilityDebug() {
  if (!mmdTslDedicatedRawVisibilityDebugActive || !mmdTslSelfShadowPass) {
    return false;
  }
  const root = state.currentModel?.root;
  if (!root) {
    return false;
  }
  return mmdTslSelfShadowPass.setReceiverVisibilityDebug(
    root,
    true,
    state.debugSelfShadowEnabled === true
  );
}

export function syncMmdTslDedicatedShadowVisibility(root = state.currentModel?.root) {
  if (!isTslViewerPipeline()) {
    return false;
  }
  if (
    state.renderer?.isWebGPURenderer === true &&
    state.debugSelfShadowEnabled === true &&
    state.keyLight?.castShadow === true
  ) {
    ensureMmdTslSelfShadowPass();
  }
  const enabled = state.debugSelfShadowEnabled === true &&
    state.keyLight?.castShadow === true &&
    mmdTslSelfShadowPass !== undefined;
  mmdTslSelfShadowPass?.setMode(state.selfShadowStateScratch.mode);
  return syncTslDedicatedShadowVisibility(root, enabled);
}

export function getMmdTslDedicatedShadowState() {
  let enabledCount = 0;
  for (const uniform of mmdTslDedicatedShadowUniforms) {
    if (uniform.value === 1) {
      enabledCount += 1;
    }
  }
  return {
    passReady: mmdTslSelfShadowPass !== undefined,
    registeredRootCount: mmdTslSelfShadowModelRoots.size,
    uniformCount: mmdTslDedicatedShadowUniforms.size,
    enabledCount
  };
}

function syncTslDedicatedShadowVisibility(root, enabled) {
  if (root) {
    registerTslDedicatedShadowUniforms(root);
  }
  const nextValue = enabled ? 1 : 0;
  let changed = false;
  for (const uniform of mmdTslDedicatedShadowUniforms) {
    if (uniform.value !== nextValue) {
      uniform.value = nextValue;
      changed = true;
    }
  }
  return changed;
}

function registerTslDedicatedShadowUniforms(root, scanRoot = root, force = false) {
  if (force) {
    unregisterTslDedicatedShadowUniforms(root);
  } else if (mmdTslDedicatedShadowUniformsByRoot.has(root)) {
    return;
  }
  const uniforms = [];
  scanRoot.traverse((object) => {
    const materialValue = object.material;
    const materials = materialValue
      ? (Array.isArray(materialValue) ? materialValue : [materialValue])
      : [];
    for (let index = 0; index < materials.length; index += 1) {
      const uniform = materials[index]?.userData?.mmdTslMaterialUniforms?.dedicatedShadowEnabled;
      if (uniform && !mmdTslDedicatedShadowUniforms.has(uniform)) {
        uniforms.push(uniform);
        mmdTslDedicatedShadowUniforms.add(uniform);
      }
    }
  });
  mmdTslDedicatedShadowUniformsByRoot.set(root, uniforms);
}

function unregisterTslDedicatedShadowUniforms(root) {
  const uniforms = mmdTslDedicatedShadowUniformsByRoot.get(root);
  if (!uniforms) {
    return;
  }
  for (const uniform of uniforms) {
    mmdTslDedicatedShadowUniforms.delete(uniform);
  }
  mmdTslDedicatedShadowUniformsByRoot.delete(root);
}

function syncTslMaterialStates(material) {
  if (Array.isArray(material)) {
    for (let index = 0; index < material.length; index += 1) {
      syncTslMaterialState(material[index], material);
    }
    return;
  }
  syncTslMaterialState(material, undefined);
}

function syncTslMaterialState(material, materialList) {
  if (!syncMmdTslMaterialState) {
    return;
  }
  const outlineMetadata = material?.userData?.mmdTslOutlineMaterial;
  const sourceMaterialIndex = outlineMetadata?.sourceMaterialIndex;
  const materialState = material?.userData?.mmdMaterialState ??
    (typeof sourceMaterialIndex === "number"
      ? materialList?.[sourceMaterialIndex]?.userData?.mmdMaterialState
      : undefined);
  if (materialState) {
    if (outlineMetadata) {
      syncTslOutlineMaterialState(material, materialState, outlineMetadata);
    } else {
      syncMmdTslMaterialState(material, materialState);
    }
  }
}

function syncTslOutlineMaterialState(material, materialState, outlineMetadata) {
  const alpha = clampColor(materialState.edgeColor[3]);
  const outlineWidth = Math.max(
    outlineMetadata.fallback && materialState.edgeSize <= 0 ? 0.5 : materialState.edgeSize,
    0
  );
  const uniforms = outlineMetadata.uniforms;
  uniforms?.color?.set(
    clampColor(materialState.edgeColor[0]),
    clampColor(materialState.edgeColor[1]),
    clampColor(materialState.edgeColor[2])
  );
  if (uniforms?.opacity) {
    uniforms.opacity.value = outlineMetadata.fallback ? uniforms.opacity.value : alpha;
  }
  if (uniforms?.width) {
    uniforms.width.value = outlineWidth;
  }
  if (material.color instanceof THREE.Color) {
    material.color.setRGB(
      clampColor(materialState.edgeColor[0]),
      clampColor(materialState.edgeColor[1]),
      clampColor(materialState.edgeColor[2])
    );
  }
  const suppressColor = mmdMaterialSuppressesColorAtAlpha(
    materialState.diffuse[3],
    outlineMetadata.flags
  );
  material.opacity = outlineMetadata.fallback ? material.opacity : alpha;
  material.transparent = true;
  const runtimeVisible = !suppressColor && (
    outlineMetadata.fallback || (materialState.edgeSize > 0 && alpha > 0)
  );
  outlineMetadata.runtimeVisible = runtimeVisible;
  material.visible = !state.debugOutlineHidden && runtimeVisible;
  material.depthWrite = true;
  const polygonOffsetSign = outlineMetadata.polygonOffsetSign ?? 1;
  material.polygonOffsetFactor = polygonOffsetSign * (1 + 2 * outlineWidth);
  if (Array.isArray(outlineMetadata.edgeColor)) {
    outlineMetadata.edgeColor[0] = materialState.edgeColor[0];
    outlineMetadata.edgeColor[1] = materialState.edgeColor[1];
    outlineMetadata.edgeColor[2] = materialState.edgeColor[2];
    outlineMetadata.edgeColor[3] = materialState.edgeColor[3];
  }
  outlineMetadata.edgeSize = materialState.edgeSize;
  outlineMetadata.outlineWidth = outlineWidth;
}

function mmdMaterialSuppressesColorAtAlpha(alpha, flags) {
  return alpha <= 0 && (flags?.groundShadow === true || flags?.selfShadowMap === true);
}

function clampColor(value) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function setTslOutlineHidden(material, hidden) {
  if (Array.isArray(material)) {
    for (let index = 0; index < material.length; index += 1) {
      setTslOutlineMaterialHidden(material[index], hidden);
    }
    return;
  }
  setTslOutlineMaterialHidden(material, hidden);
}

function setTslOutlineMaterialHidden(material, hidden) {
  const outlineMetadata = material?.userData?.mmdTslOutlineMaterial;
  if (!outlineMetadata) {
    return;
  }
  material.visible = !hidden && outlineMetadata.runtimeVisible !== false;
}

function syncTslMaterialLight(material) {
  if (!state.keyLight) {
    return;
  }
  state.keyLight.updateMatrixWorld();
  state.keyLight.target.updateMatrixWorld();
  lightPositionScratch.setFromMatrixPosition(state.keyLight.matrixWorld);
  lightTargetScratch.setFromMatrixPosition(state.keyLight.target.matrixWorld);
  lightDirectionScratch.copy(lightPositionScratch).sub(lightTargetScratch).normalize();
  const lightColor = state.keyLight.visible
    ? state.keyLight.color
    : undefined;
  if (Array.isArray(material)) {
    for (let index = 0; index < material.length; index += 1) {
      syncTslMaterialLightUniforms(material[index], lightColor);
    }
    return;
  }
  syncTslMaterialLightUniforms(material, lightColor);
}

function syncTslMaterialLightUniforms(material, lightColor) {
  const uniforms = material?.userData?.mmdTslMaterialUniforms;
  if (!uniforms) {
    return;
  }
  uniforms.lightDirection.copy(lightDirectionScratch);
  uniforms.lightColor.set(
    lightColor ? lightColor.r * state.keyLight.intensity : 0,
    lightColor ? lightColor.g * state.keyLight.intensity : 0,
    lightColor ? lightColor.b * state.keyLight.intensity : 0
  );
  if (uniforms.toonCoordinateOffset) {
    uniforms.toonCoordinateOffset.value = syncedLightToonCoordinateOffset;
  }
}

async function loadWebgpuPipelineModule() {
  if (!webgpuPipelineModulePromise) {
    webgpuPipelineModulePromise = Promise.all([
      import("../../../dist/webgpu/index.js"),
      import("../../../dist/webgpu/self-shadow-pass.js")
    ]).then(([module, selfShadowModule]) => {
      replaceMmdModelMaterialsWithTsl = module.replaceMmdModelMaterialsWithTsl;
      createMmdTslShadowCaster = module.createMmdTslShadowCaster;
      disposeMmdTslShadowCaster = module.disposeMmdTslShadowCaster;
      syncMmdTslMaterialState = module.syncMmdTslMaterialState;
      computeMmdTslSparsePositionMorphs = module.computeMmdTslSparsePositionMorphs;
      disposeMmdTslSparsePositionMorphs = module.disposeMmdTslSparsePositionMorphs;
      enableMmdTslSparsePositionMorphs = module.enableMmdTslSparsePositionMorphs;
      createMmdTslSelfShadowPass = selfShadowModule.createMmdTslSelfShadowPass;
      return module;
    });
  }
  return webgpuPipelineModulePromise;
}

function ensureMmdTslSelfShadowPass() {
  if (
    !createMmdTslSelfShadowPass ||
    // The dedicated self-shadow pass is a pure TSL node graph (RenderTarget +
    // DepthTexture + TSL shadow-visibility node) with no WebGPU-only compute
    // dependency, so it also renders correctly through WebGPURenderer's
    // WebGLBackend (the "tsl-forcewebgl" viewer pipeline). Only gate on the
    // renderer actually being a WebGPURenderer (native or forceWebGL), not on
    // which internal backend it picked.
    state.renderer?.isWebGPURenderer !== true ||
    !state.renderer ||
    !state.keyLight
  ) {
    return;
  }
  if (mmdTslSelfShadowPass && mmdTslSelfShadowPassRenderer !== state.renderer) {
    disposeMmdTslSelfShadowPass();
  }
  if (!mmdTslSelfShadowPass) {
    mmdTslSelfShadowPass = createMmdTslSelfShadowPass(state.renderer, state.keyLight);
    mmdTslSelfShadowPassRenderer = state.renderer;
  }
}

function disposeMmdTslSelfShadowPass() {
  if (!mmdTslSelfShadowPass) {
    return;
  }
  mmdTslSelfShadowPass.dispose();
  mmdTslSelfShadowPass = undefined;
  mmdTslSelfShadowPassRenderer = undefined;
}

function disposeMmdTslSelfShadowPassIfUnused() {
  if (mmdTslSelfShadowModelRoots.size === 0) {
    disposeMmdTslSelfShadowPass();
  }
}
