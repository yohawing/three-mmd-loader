import * as THREE from "three";

import { dom } from "./dom.js";
import { normalizeMaterials } from "./dispose.js";
import { evaluateRuntime } from "./playback.js";
import { state } from "./state.js";

export function createViewerDebugApi() {
  return {
    showNormals() {
      const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
      for (const mesh of currentDebugMeshes()) {
        rememberDebugMaterial(mesh);
        mesh.material = normalMaterial;
      }
      return "normal material enabled";
    },
    restoreMaterials: restoreDebugMaterials,
    flatShading(enabled) {
      for (const material of currentDebugMaterials()) {
        if ("flatShading" in material) {
          material.flatShading = !!enabled;
          material.needsUpdate = true;
        }
      }
      return `flatShading=${!!enabled}`;
    },
    toonOff() {
      for (const mesh of currentDebugMeshes()) {
        rememberDebugMaterial(mesh);
        mesh.material = normalizeMaterials(mesh.material).map((material) => {
          const lambert = new THREE.MeshLambertMaterial({
            color: material.color instanceof THREE.Color ? material.color : 0xffffff,
            map: "map" in material ? material.map : null,
            alphaMap: "alphaMap" in material ? material.alphaMap : null,
            transparent: material.transparent,
            opacity: material.opacity,
            alphaTest: material.alphaTest,
            side: material.side,
            depthWrite: material.depthWrite,
            wireframe: material.wireframe
          });
          lambert.name = `${material.name || "material"} debug lambert`;
          return lambert;
        });
        if (!Array.isArray(state.debugMaterialState.get(mesh)?.material) && mesh.material.length === 1) {
          mesh.material = mesh.material[0];
        }
      }
      return "MeshLambertMaterial debug override enabled";
    },
    outlineOff() {
      state.currentModel?.outlineMeshes?.forEach((outline) => {
        outline.visible = false;
      });
      return "outline hidden";
    },
    evaluateAt(seconds, options = {}) {
      state.elapsedSeconds = Number(seconds);
      if (dom.timeline && state.elapsedSeconds > Number.parseFloat(dom.timeline.max)) {
        dom.timeline.max = String(state.elapsedSeconds);
      }
      evaluateRuntime(options);
      state.controls.update();
      state.renderer.render(state.scene, state.camera);
      return this.state();
    },
    state() {
      return createSmokeState();
    },
    dumpFaceNormals() {
      const mesh = state.currentModel?.mesh;
      if (!mesh) {
        return [];
      }
      const samples = sampleFaceNormals(mesh);
      window.console?.table(samples);
      return samples;
    }
  };
}

function currentDebugMeshes() {
  if (!state.currentModel) {
    return [];
  }
  return [state.currentModel.mesh, ...(state.currentModel.outlineMeshes ?? [])];
}

function currentDebugMaterials() {
  return currentDebugMeshes().flatMap((mesh) => normalizeMaterials(mesh.material));
}

function rememberDebugMaterial(mesh) {
  if (!state.debugMaterialState.has(mesh)) {
    state.debugMaterialState.set(mesh, { material: mesh.material });
  }
}

export function restoreDebugMaterials() {
  for (const [mesh, debugState] of state.debugMaterialState) {
    mesh.material = debugState.material;
  }
  state.debugMaterialState.clear();
  return "materials restored";
}

function createSmokeState() {
  const model = state.currentModel;
  const runtime = model?.runtime;
  const debugState = runtime?.debugState();
  const rigidBodyTransforms = runtime?.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
  const ikStage = debugState?.stages.ik;
  const physicsStage = debugState?.stages.physics;
  return {
    ready: !!model,
    timeSeconds: state.elapsedSeconds,
    modelName: model?.mesh.name ?? null,
    rigidBodyCount: model?.mesh.userData.mmdModel?.rigidBodyCount ?? 0,
    jointCount: model?.mesh.userData.mmdModel?.jointCount ?? 0,
    rigidBodyTransformCount: rigidBodyTransforms.length,
    rigidBodyBounds: matrixTranslationBounds(rigidBodyTransforms),
    matricesFinite: finiteArray(physicsStage?.worldMatricesColumnMajor ?? []),
    morphWeightsFinite: finiteArray(physicsStage?.morphWeights ?? []),
    physicsMaxBonePositionDelta: maxStageTranslationDelta(ikStage, physicsStage),
    diagnostics: state.activePhysicsBackend?.diagnostics?.() ?? []
  };
}

function finiteArray(values) {
  return Array.from(values).every(Number.isFinite);
}

function matrixTranslationBounds(matrices) {
  const translations = matrices
    .filter((matrix) => matrix.length >= 16)
    .map((matrix) => [matrix[12], matrix[13], matrix[14]]);
  if (translations.length === 0 || !translations.flat().every(Number.isFinite)) {
    return null;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const translation of translations) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], translation[axis]);
      max[axis] = Math.max(max[axis], translation[axis]);
    }
  }
  const center = [(min[0] + max[0]) * 0.5, (min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5];
  const radius = Math.max(
    ...translations.map((translation) =>
      Math.hypot(
        translation[0] - center[0],
        translation[1] - center[1],
        translation[2] - center[2]
      )
    )
  );
  return { min, max, radius };
}

function maxStageTranslationDelta(before, after) {
  const beforeMatrices = before?.worldMatricesColumnMajor ?? [];
  const afterMatrices = after?.worldMatricesColumnMajor ?? [];
  const count = Math.floor(Math.min(beforeMatrices.length, afterMatrices.length) / 16);
  let maxDelta = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 16;
    const delta = Math.hypot(
      afterMatrices[offset + 12] - beforeMatrices[offset + 12],
      afterMatrices[offset + 13] - beforeMatrices[offset + 13],
      afterMatrices[offset + 14] - beforeMatrices[offset + 14]
    );
    if (Number.isFinite(delta)) {
      maxDelta = Math.max(maxDelta, delta);
    }
  }
  return maxDelta;
}

function sampleFaceNormals(mesh) {
  const geometry = mesh.geometry;
  const normal = geometry.getAttribute("normal");
  const position = geometry.getAttribute("position");
  const index = geometry.index?.array;
  if (!normal || !position || !index) {
    return [];
  }
  const materials = normalizeMaterials(mesh.material);
  const faceMaterialIndex = materials.findIndex((material) => {
    const metadata = material.userData?.mmdMaterial;
    return /face00|face|顔/i.test(`${metadata?.name ?? ""} ${material.name ?? ""}`);
  });
  const materialIndex = faceMaterialIndex >= 0 ? faceMaterialIndex : 0;
  const group =
    geometry.groups.find((item) => item.materialIndex === materialIndex) ?? geometry.groups[0];
  if (!group) {
    return [];
  }
  const samples = [];
  const seen = new Set();
  for (let offset = group.start; offset < group.start + group.count; offset += 1) {
    const vertexIndex = Number(index[offset]);
    if (seen.has(vertexIndex) || position.getY(vertexIndex) <= 1.5) {
      continue;
    }
    seen.add(vertexIndex);
    samples.push({
      vertexIndex,
      materialIndex,
      x: position.getX(vertexIndex),
      y: position.getY(vertexIndex),
      z: position.getZ(vertexIndex),
      nx: normal.getX(vertexIndex),
      ny: normal.getY(vertexIndex),
      nz: normal.getZ(vertexIndex)
    });
    if (samples.length >= 10) {
      break;
    }
  }
  return samples;
}
