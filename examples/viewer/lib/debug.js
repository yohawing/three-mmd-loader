import * as THREE from "three";

import { dom } from "./dom.js";
import { normalizeMaterials } from "./dispose.js";
import { evaluateRuntime } from "./playback.js";
import { state } from "./state.js";

export function createViewerDebugApi() {
  return {
    showNormals() {
      setDebugMaterialMode("normals");
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
      setDebugMaterialMode("toonOff");
      return "MeshLambertMaterial debug override enabled";
    },
    outlineOff() {
      setOutlineHidden(true);
      return "outline hidden";
    },
    showColliders() {
      showColliderHelpers();
      state.renderer.render(state.scene, state.camera);
      refreshDebugPanelState();
      return "collider helpers enabled";
    },
    hideColliders() {
      hideColliderHelpers();
      state.renderer.render(state.scene, state.camera);
      refreshDebugPanelState();
      return "collider helpers hidden";
    },
    evaluateAt(seconds, options = {}) {
      state.elapsedSeconds = Number(seconds);
      if (dom.timeline && state.elapsedSeconds > Number(dom.timeline.max)) {
        dom.timeline.max = state.elapsedSeconds;
      }
      evaluateRuntime(options);
      state.controls.update();
      updateColliderHelpers();
      state.renderer.render(state.scene, state.camera);
      return this.state();
    },
    state() {
      return createSmokeState();
    },
    dumpContacts(limit = 20) {
      const contacts = currentPhysicsContacts(limit);
      window.console?.table(contacts);
      return contacts;
    },
    dumpRigidBodies(indices) {
      const rows = currentRigidBodyRows(indices);
      window.console?.table(rows);
      return rows;
    },
    dumpCollisionPair(indexA, indexB) {
      const pair = currentCollisionPair(indexA, indexB);
      window.console?.table(pair ? [pair] : []);
      return pair;
    },
    setPhysicsMaxSubSteps,
    setDynamicWithBoneRotationFeedbackScale,
    setCollisionMargin,
    setSolverIterations,
    setSplitImpulse,
    setSplitImpulsePenetrationThreshold,
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

function currentPhysicsContacts(limit = 20) {
  const runtime = state.currentModel?.runtime;
  const backend = runtime?.physicsBackend;
  if (typeof backend?.debugPhysicsContacts !== "function") {
    return [];
  }
  const rigidBodies = state.currentModel?.mesh.userData.mmdPhysics?.rigidBodies ?? [];
  return backend.debugPhysicsContacts().slice(0, Math.max(0, Number(limit) || 0)).map((contact) => {
    const bodyA = rigidBodies[contact.rigidBodyIndexA];
    const bodyB = rigidBodies[contact.rigidBodyIndexB];
    return {
      rigidBodyIndexA: contact.rigidBodyIndexA,
      bodyNameA: contact.bodyNameA ?? bodyA?.name ?? "",
      groupA: bodyA?.group ?? contact.groupA,
      rigidBodyIndexB: contact.rigidBodyIndexB,
      bodyNameB: contact.bodyNameB ?? bodyB?.name ?? "",
      groupB: bodyB?.group ?? contact.groupB,
      distance: contact.distance ?? contact.minDistance ?? 0
    };
  });
}

function currentRigidBodies() {
  return state.currentModel?.mesh.userData.mmdPhysics?.rigidBodies ?? [];
}

function currentRigidBodyRows(indices) {
  const rigidBodies = currentRigidBodies();
  const selectedIndices = Array.isArray(indices)
    ? indices
    : Array.from({ length: rigidBodies.length }, (_, index) => index);
  return selectedIndices
    .map((index) => rigidBodyDebugRow(rigidBodies, Number(index)))
    .filter(Boolean);
}

function currentCollisionPair(indexA, indexB) {
  const rigidBodies = currentRigidBodies();
  const bodyA = rigidBodies[Number(indexA)];
  const bodyB = rigidBodies[Number(indexB)];
  if (!bodyA || !bodyB) {
    return null;
  }
  const groupA = rigidBodyCollisionGroup(bodyA);
  const groupB = rigidBodyCollisionGroup(bodyB);
  const groupMaskA = collisionGroupMask(groupA);
  const groupMaskB = collisionGroupMask(groupB);
  const maskA = rigidBodyCollisionMask(bodyA);
  const maskB = rigidBodyCollisionMask(bodyB);
  return {
    rigidBodyIndexA: Number(indexA),
    bodyNameA: bodyA.name ?? "",
    groupA,
    maskA,
    maskHexA: maskHex(maskA),
    bitAForGroupB: maskA & groupMaskB ? 1 : 0,
    rigidBodyIndexB: Number(indexB),
    bodyNameB: bodyB.name ?? "",
    groupB,
    maskB,
    maskHexB: maskHex(maskB),
    bitBForGroupA: maskB & groupMaskA ? 1 : 0,
    bulletAllowsCollision: !!((maskA & groupMaskB) && (maskB & groupMaskA))
  };
}

function rigidBodyDebugRow(rigidBodies, index) {
  const body = rigidBodies[index];
  if (!body) {
    return null;
  }
  const group = rigidBodyCollisionGroup(body);
  const mask = rigidBodyCollisionMask(body);
  return {
    rigidBodyIndex: index,
    name: body.name ?? "",
    englishName: body.englishName ?? "",
    boneIndex: body.boneIndex ?? null,
    group,
    groupMask: collisionGroupMask(group),
    mask,
    maskHex: maskHex(mask),
    shape: body.shape ?? "",
    mode: body.mode ?? "",
    sizeX: body.size?.[0] ?? null,
    sizeY: body.size?.[1] ?? null,
    sizeZ: body.size?.[2] ?? null,
    positionX: body.position?.[0] ?? null,
    positionY: body.position?.[1] ?? null,
    positionZ: body.position?.[2] ?? null,
    rotationX: body.rotation?.[0] ?? null,
    rotationY: body.rotation?.[1] ?? null,
    rotationZ: body.rotation?.[2] ?? null
  };
}

export function showColliderHelpers() {
  hideColliderHelpers();
  const rigidBodies = currentRigidBodies();
  const group = new THREE.Group();
  group.name = "MMD Physics Colliders";
  const materialsByGroup = new Map();
  for (const body of rigidBodies) {
    const collisionGroup = rigidBodyCollisionGroup(body);
    const helper = new THREE.Mesh(createColliderGeometry(body), colliderMaterialForGroup(collisionGroup, materialsByGroup));
    helper.name = `collider:${body.name ?? ""}`;
    helper.matrixAutoUpdate = false;
    helper.userData.mmdRigidBodyGroup = collisionGroup;
    helper.userData.mmdRigidBodyRestMatrix = createRigidBodyRestMatrix(body);
    setHelperMatrixFromMmdMatrix(helper, helper.userData.mmdRigidBodyRestMatrix);
    group.add(helper);
  }
  state.scene.add(group);
  state.debugColliderGroup = group;
  state.debugCollidersVisible = true;
  updateColliderHelpers();
}

export function hideColliderHelpers() {
  const group = state.debugColliderGroup;
  if (!group) {
    return;
  }
  state.scene.remove(group);
  const disposedMaterials = new Set();
  for (const child of group.children) {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => disposeColliderMaterial(material, disposedMaterials));
    } else if (child.material) {
      disposeColliderMaterial(child.material, disposedMaterials);
    }
  }
  state.debugColliderGroup = undefined;
  state.debugCollidersVisible = false;
}

export function toggleColliderHelpers() {
  if (state.debugColliderGroup) {
    hideColliderHelpers();
  } else {
    showColliderHelpers();
  }
  state.showDebugColliders = state.debugCollidersVisible;
  state.renderer.render(state.scene, state.camera);
  return state.debugCollidersVisible;
}

export function setDebugMaterialMode(mode) {
  const nextMode = mode === "normals" || mode === "toonOff" ? mode : "default";
  restoreDebugMaterials();
  state.debugMaterialMode = nextMode;
  if (nextMode === "normals") {
    const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    for (const mesh of currentDebugMeshes()) {
      rememberDebugMaterial(mesh);
      mesh.material = normalMaterial;
    }
  } else if (nextMode === "toonOff") {
    applyToonOffMaterial();
  }
  state.renderer.render(state.scene, state.camera);
  refreshDebugPanelState();
  return state.debugMaterialMode;
}

export function setOutlineHidden(hidden) {
  state.debugOutlineHidden = !!hidden;
  state.currentModel?.outlineMeshes?.forEach((outline) => {
    outline.visible = !state.debugOutlineHidden;
  });
  state.renderer.render(state.scene, state.camera);
  refreshDebugPanelState();
  return state.debugOutlineHidden;
}

export function setPhysicsMaxSubSteps(value) {
  const nextValue = Math.max(0, Math.trunc(Number(value)));
  if (!Number.isFinite(nextValue)) {
    return state.physicsTuningOptions.maxSubSteps;
  }
  state.physicsTuningOptions.maxSubSteps = nextValue;
  refreshDebugPanelState();
  return state.physicsTuningOptions.maxSubSteps;
}

export function setDynamicWithBoneRotationFeedbackScale(value) {
  const nextValue = Math.max(0, Math.min(Number(value), 1));
  if (!Number.isFinite(nextValue)) {
    return state.physicsTuningOptions.dynamicWithBoneRotationFeedbackScale;
  }
  state.physicsTuningOptions.dynamicWithBoneRotationFeedbackScale = nextValue;
  refreshDebugPanelState();
  return state.physicsTuningOptions.dynamicWithBoneRotationFeedbackScale;
}

export function setCollisionMargin(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return state.physicsTuningOptions.collisionMargin;
  }
  state.physicsTuningOptions.collisionMargin = parsed >= 0 ? parsed : -1;
  refreshDebugPanelState();
  return state.physicsTuningOptions.collisionMargin;
}

export function setSolverIterations(value) {
  const nextValue = Math.max(1, Math.trunc(Number(value)));
  if (!Number.isFinite(nextValue)) {
    return state.physicsTuningOptions.solverIterations;
  }
  state.physicsTuningOptions.solverIterations = nextValue;
  refreshDebugPanelState();
  return state.physicsTuningOptions.solverIterations;
}

export function setSplitImpulse(enabled) {
  state.physicsTuningOptions.splitImpulse = !!enabled;
  refreshDebugPanelState();
  return state.physicsTuningOptions.splitImpulse;
}

export function setSplitImpulsePenetrationThreshold(value) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return state.physicsTuningOptions.splitImpulsePenetrationThreshold;
  }
  state.physicsTuningOptions.splitImpulsePenetrationThreshold = nextValue;
  refreshDebugPanelState();
  return state.physicsTuningOptions.splitImpulsePenetrationThreshold;
}

export function refreshDebugPanelState() {
  if (dom.debugCollidersToggle) {
    dom.debugCollidersToggle.checked = state.debugCollidersVisible;
    dom.debugCollidersToggle.setAttribute("aria-checked", String(state.debugCollidersVisible));
  }
  if (dom.debugNormalsToggle) {
    dom.debugNormalsToggle.checked = state.debugMaterialMode === "normals";
  }
  if (dom.debugToonOffToggle) {
    dom.debugToonOffToggle.checked = state.debugMaterialMode === "toonOff";
  }
  if (dom.debugOutlineOffToggle) {
    dom.debugOutlineOffToggle.checked = state.debugOutlineHidden;
  }
  if (dom.debugMaxSubStepsInput) {
    dom.debugMaxSubStepsInput.value = String(state.physicsTuningOptions.maxSubSteps);
  }
  if (dom.debugDynamicWithBoneFeedbackInput) {
    dom.debugDynamicWithBoneFeedbackInput.value = String(
      state.physicsTuningOptions.dynamicWithBoneRotationFeedbackScale
    );
  }
  if (dom.debugCollisionMarginInput) {
    dom.debugCollisionMarginInput.value = String(state.physicsTuningOptions.collisionMargin);
  }
  if (dom.debugSolverIterationsInput) {
    dom.debugSolverIterationsInput.value = String(state.physicsTuningOptions.solverIterations);
  }
  if (dom.debugSplitImpulseToggle) {
    dom.debugSplitImpulseToggle.checked = state.physicsTuningOptions.splitImpulse;
    dom.debugSplitImpulseToggle.setAttribute(
      "aria-checked",
      String(state.physicsTuningOptions.splitImpulse)
    );
  }
  if (dom.debugSplitImpulsePenetrationThresholdInput) {
    dom.debugSplitImpulsePenetrationThresholdInput.value = String(
      state.physicsTuningOptions.splitImpulsePenetrationThreshold
    );
  }
  if (dom.debugStateOutput) {
    dom.debugStateOutput.textContent = JSON.stringify(createSmokeState(), null, 2);
  }
}

function applyToonOffMaterial() {
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
}

export function updateColliderHelpers() {
  const group = state.debugColliderGroup;
  if (!group) {
    return;
  }
  const matrices = state.currentModel?.runtime?.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
  for (let index = 0; index < group.children.length; index += 1) {
    const helper = group.children[index];
    const matrix = matrices[index];
    if (Array.isArray(matrix) && matrix.length >= 16) {
      helper.visible = true;
      setHelperMatrixFromMmdMatrix(helper, matrix);
    } else if (helper.userData.mmdRigidBodyRestMatrix) {
      helper.visible = true;
      setHelperMatrixFromMmdMatrix(helper, helper.userData.mmdRigidBodyRestMatrix);
    } else {
      helper.visible = false;
    }
  }
}

function createColliderGeometry(body) {
  const size = body.size ?? [0.1, 0.1, 0.1];
  if (body.shape === "box") {
    return new THREE.BoxGeometry(
      Math.max(size[0] * 2, 0.001),
      Math.max(size[1] * 2, 0.001),
      Math.max(size[2] * 2, 0.001)
    );
  }
  if (body.shape === "capsule") {
    return new THREE.CapsuleGeometry(
      Math.max(size[0], 0.001),
      Math.max(size[1], 0.001),
      8,
      12
    );
  }
  return new THREE.SphereGeometry(Math.max(size[0], 0.001), 16, 8);
}

function createRigidBodyRestMatrix(body) {
  const position = body.position ?? [0, 0, 0];
  const rotation = body.rotation ?? [0, 0, 0];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, "XYZ")),
    new THREE.Vector3(1, 1, 1)
  );
}

const mmdToViewerZFlipMatrix = new THREE.Matrix4().makeScale(1, 1, -1);

function setHelperMatrixFromMmdMatrix(helper, matrix) {
  if (Array.isArray(matrix)) {
    helper.matrix.fromArray(matrix);
  } else {
    helper.matrix.copy(matrix);
  }
  helper.matrix.premultiply(mmdToViewerZFlipMatrix);
  helper.matrix.multiply(mmdToViewerZFlipMatrix);
  helper.matrixWorldNeedsUpdate = true;
}

const colliderGroupColors = [
  0xe6194b,
  0x3cb44b,
  0x4363d8,
  0xf58231,
  0x911eb4,
  0x46f0f0,
  0xf032e6,
  0xbcf60c,
  0xfabebe,
  0x008080,
  0xe6beff,
  0x9a6324,
  0xfffac8,
  0x800000,
  0xaaffc3,
  0x000075
];

function rigidBodyCollisionGroup(body) {
  const rawGroup = Number(body.group ?? body.collisionGroup ?? 0);
  return Number.isInteger(rawGroup) ? Math.min(Math.max(rawGroup, 0), colliderGroupColors.length - 1) : 0;
}

function rigidBodyCollisionMask(body) {
  const rawMask = Number(body.mask ?? body.collisionMask ?? 0xffff);
  return Number.isInteger(rawMask) ? rawMask & 0xffff : 0xffff;
}

function collisionGroupMask(group) {
  return 1 << rigidBodyCollisionGroup({ group });
}

function maskHex(mask) {
  return `0x${(mask & 0xffff).toString(16).padStart(4, "0")}`;
}

function colliderMaterialForGroup(collisionGroup, materialsByGroup) {
  let material = materialsByGroup.get(collisionGroup);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color: colliderGroupColors[collisionGroup] ?? colliderGroupColors[0],
      depthTest: false,
      opacity: 0.78,
      transparent: true,
      wireframe: true
    });
    material.name = `mmd collider group ${collisionGroup}`;
    materialsByGroup.set(collisionGroup, material);
  }
  return material;
}

function disposeColliderMaterial(material, disposedMaterials) {
  if (disposedMaterials.has(material)) {
    return;
  }
  disposedMaterials.add(material);
  material.dispose?.();
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
  state.debugMaterialMode = "default";
  refreshDebugPanelState();
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
    contactCount: typeof runtime?.physicsBackend?.debugContactCount === "function"
      ? runtime.physicsBackend.debugContactCount()
      : (typeof state.activePhysicsBackend?.debugContactCount === "function"
        ? state.activePhysicsBackend.debugContactCount()
        : null),
    physicsMaxSubSteps: state.physicsTuningOptions.maxSubSteps,
    dynamicWithBoneRotationFeedbackScale:
      state.physicsTuningOptions.dynamicWithBoneRotationFeedbackScale,
    collisionMargin: state.physicsTuningOptions.collisionMargin,
    solverIterations: state.physicsTuningOptions.solverIterations,
    splitImpulse: state.physicsTuningOptions.splitImpulse,
    splitImpulsePenetrationThreshold: state.physicsTuningOptions.splitImpulsePenetrationThreshold,
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
