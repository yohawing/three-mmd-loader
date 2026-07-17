import * as THREE from "three";

import { dom } from "./dom.js";
import { state } from "./state.js";

const lightPositionScratch = new THREE.Vector3();
const lightTargetScratch = new THREE.Vector3();
const lightDirectionScratch = new THREE.Vector3();
const syncedLightToonCoordinateOffset = 0.5;
let webgpuPipelineModulePromise;
let replaceMmdModelMaterialsWithTsl;
let syncMmdTslMaterialState;
let computeMmdTslSparsePositionMorphs;
let enableMmdTslSparsePositionMorphs;

export function isTslViewerPipeline() {
  return state.viewerPipeline !== "baseline-webgl";
}

export function createViewerModelLoadOptions() {
  return isTslViewerPipeline()
    ? {
        frustumCulled: false,
        morphSplit: false,
        outline: false,
        materialRenderOrder: false
      }
    : { frustumCulled: false };
}

export async function applyViewerPipelineToModel(model, label) {
  state.pipelineModelName = label || model.mesh.name || "model";
  if (isTslViewerPipeline()) {
    await loadWebgpuPipelineModule();
    replaceMmdModelMaterialsWithTsl(model.mesh, {
      appendOutlineGroups: true,
      respectMaterialShadowFlags: true
    });
    if (state.renderer?.backend?.isWebGPUBackend === true) {
      enableMmdTslSparsePositionMorphs(model.mesh);
    }
    syncTslMaterialStates(model.mesh.material);
    syncTslMaterialLight(model.mesh.material);
  }
  updateViewerPipelineStatus();
}

export function clearViewerPipelineModel() {
  state.pipelineModelName = "(none)";
  updateViewerPipelineStatus();
}

export function updateViewerPipelineStatus() {
  if (dom.pipelineBackendSwitcher && dom.pipelineBackendSwitcher.value !== state.rendererBackend) {
    dom.pipelineBackendSwitcher.value = state.rendererBackend;
    dom.pipelineBackendSwitcher.setAttribute("value", state.rendererBackend);
  }
}

export function syncCurrentModelTslLight() {
  if (!isTslViewerPipeline() || !state.currentModel?.mesh?.material) {
    return;
  }
  syncTslMaterialLight(state.currentModel.mesh.material);
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

export function setCurrentModelTslOutlineHidden(hidden) {
  if (!isTslViewerPipeline() || !state.currentModel?.mesh?.material) {
    return;
  }
  setTslOutlineHidden(state.currentModel.mesh.material, hidden);
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
  material.polygonOffsetFactor = 1 + 2 * outlineWidth;
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
    webgpuPipelineModulePromise = import("../../../dist/webgpu/index.js").then((module) => {
      replaceMmdModelMaterialsWithTsl = module.replaceMmdModelMaterialsWithTsl;
      syncMmdTslMaterialState = module.syncMmdTslMaterialState;
      computeMmdTslSparsePositionMorphs = module.computeMmdTslSparsePositionMorphs;
      enableMmdTslSparsePositionMorphs = module.enableMmdTslSparsePositionMorphs;
      return module;
    });
  }
  return webgpuPipelineModulePromise;
}
