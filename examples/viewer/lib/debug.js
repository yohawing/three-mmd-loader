import * as THREE from "three";

import { dom } from "./dom.js";
import { normalizeMaterials } from "./dispose.js";
import { evaluateRuntime } from "./playback.js";
import { debugEnabled, state } from "./state.js";
import {
  setCurrentModelTslOutlineHidden,
  getMmdTslDedicatedShadowState,
  setMmdTslDedicatedRawVisibilityDebug,
  syncMmdTslDedicatedShadowVisibility,
  syncMmdTslDedicatedRawVisibilityDebug,
  submitViewerRender
} from "./viewer-pipeline.js";

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
    outlineOff() {
      setOutlineHidden(true);
      return "outline hidden";
    },
    selfShadow(enabled = true) {
      return `selfShadow=${setSelfShadowEnabled(enabled)}`;
    },
    dedicatedRawVisibility(enabled = true) {
      return `dedicatedRawVisibility=${setMmdTslDedicatedRawVisibilityDebug(enabled)}`;
    },
    selfShadowDiagnostics: createSelfShadowDiagnostics,
    showColliders() {
      showColliderHelpers();
      submitViewerRender();
      refreshDebugPanelState();
      return "collider helpers enabled";
    },
    hideColliders() {
      hideColliderHelpers();
      submitViewerRender();
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
      submitViewerRender();
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
    const helper = new THREE.LineSegments(
      createColliderLineGeometry(body),
      colliderMaterialForGroup(collisionGroup, materialsByGroup)
    );
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
  submitViewerRender();
  return state.debugCollidersVisible;
}

export function setDebugMaterialMode(mode) {
  const nextMode = mode === "normals" ? mode : "default";
  restoreDebugMaterials();
  state.debugMaterialMode = nextMode;
  if (nextMode === "normals") {
    const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    for (const mesh of currentDebugMeshes()) {
      rememberDebugMaterial(mesh);
      mesh.material = normalMaterial;
    }
  }
  submitViewerRender();
  refreshDebugPanelState();
  return state.debugMaterialMode;
}

export function setOutlineHidden(hidden) {
  state.debugOutlineHidden = !!hidden;
  state.currentModel?.outlineMeshes?.forEach((outline) => {
    outline.visible = !state.debugOutlineHidden;
  });
  setCurrentModelTslOutlineHidden(state.debugOutlineHidden);
  submitViewerRender();
  refreshDebugPanelState();
  return state.debugOutlineHidden;
}

export function setSelfShadowEnabled(enabled) {
  state.debugSelfShadowEnabled = !!enabled;
  if (state.renderer?.shadowMap) {
    state.renderer.shadowMap.enabled = state.debugSelfShadowEnabled;
    state.renderer.shadowMap.needsUpdate = true;
  }
  if (state.keyLight) {
    state.keyLight.castShadow = state.debugSelfShadowEnabled;
  }
  if (state.debugSelfShadowEnabled) {
    state.runtimePhysicsDisabledOptionsScratch.physics = false;
    evaluateRuntime(state.runtimePhysicsDisabledOptionsScratch);
  }
  syncMmdTslDedicatedShadowVisibility();
  syncMmdTslDedicatedRawVisibilityDebug();
  submitViewerRender();
  refreshDebugPanelState();
  return state.debugSelfShadowEnabled;
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

export function captureCanvas() {
  if (!state.renderer || !state.scene || !state.camera) {
    return;
  }
  submitViewerRender();
  const dataUrl = state.renderer.domElement.toDataURL("image/png");
  const frame = Math.round(state.elapsedSeconds * (state.mmdFrameRate ?? 30));
  const modelName = state.currentModel?.mesh.name ?? "capture";
  const safeName = modelName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "capture";
  const link = document.createElement("a");
  link.download = `${safeName}_f${frame}.png`;
  link.href = dataUrl;
  link.click();
}

export function markBeforeCapture() {
  if (!state.renderer || !state.scene || !state.camera) {
    return;
  }
  submitViewerRender();
  state.debugBeforeCapture = state.renderer.domElement.toDataURL("image/png");
  refreshDebugPanelState();
}

export function captureAfterAndCompare() {
  if (!state.renderer || !state.scene || !state.camera || !state.debugBeforeCapture) {
    return;
  }
  submitViewerRender();
  const afterDataUrl = state.renderer.domElement.toDataURL("image/png");
  showComparisonOverlay(state.debugBeforeCapture, afterDataUrl);
}

function showComparisonOverlay(beforeUrl, afterUrl) {
  let overlay = document.querySelector("#debug-compare-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "debug-compare-overlay";
    overlay.className = "debug-compare-overlay";
    overlay.innerHTML = `
      <div class="debug-compare-content">
        <div class="debug-compare-header">
          <span>Before / After</span>
          <button class="debug-compare-close" type="button" aria-label="Close comparison">
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="debug-compare-images">
          <div class="debug-compare-panel">
            <span class="debug-compare-label">Before</span>
            <img class="debug-compare-img" id="debug-compare-before" alt="Before capture" />
          </div>
          <div class="debug-compare-panel">
            <span class="debug-compare-label">After</span>
            <img class="debug-compare-img" id="debug-compare-after" alt="After capture" />
          </div>
        </div>
      </div>
    `;
    overlay.querySelector(".debug-compare-close").addEventListener("click", () => {
      overlay.hidden = true;
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
    document.body.appendChild(overlay);
  }
  overlay.querySelector("#debug-compare-before").src = beforeUrl;
  overlay.querySelector("#debug-compare-after").src = afterUrl;
  overlay.hidden = false;
}

export function refreshDebugPanelState() {
  if (dom.debugCollidersToggle) {
    dom.debugCollidersToggle.checked = state.debugCollidersVisible;
    dom.debugCollidersToggle.setAttribute("aria-checked", String(state.debugCollidersVisible));
  }
  if (dom.debugNormalsToggle) {
    dom.debugNormalsToggle.checked = state.debugMaterialMode === "normals";
  }
  if (dom.debugOutlineOffToggle) {
    dom.debugOutlineOffToggle.checked = state.debugOutlineHidden;
  }
  if (dom.debugSelfShadowToggle) {
    dom.debugSelfShadowToggle.checked = state.debugSelfShadowEnabled;
    dom.debugSelfShadowToggle.setAttribute(
      "aria-checked",
      String(state.debugSelfShadowEnabled)
    );
  }
  if (dom.debugCompareAfterButton) {
    dom.debugCompareAfterButton.disabled = !state.debugBeforeCapture;
  }
}

export function updateDebugFps(deltaSeconds) {
  if (!debugEnabled || !dom.debugFpsValue || deltaSeconds <= 0) {
    return;
  }
  state.debugFpsSampleSeconds += deltaSeconds;
  state.debugFpsSampleFrames += 1;
  state.debugFrameTimeSampleMs += deltaSeconds * 1000;
  if (state.debugFpsSampleSeconds < 0.5) {
    return;
  }
  const fps = state.debugFpsSampleFrames / state.debugFpsSampleSeconds;
  dom.debugFpsValue.textContent = fps.toFixed(1);
  if (dom.debugFrameTimeValue) {
    const frameTimeMs = state.debugFrameTimeSampleMs / state.debugFpsSampleFrames;
    dom.debugFrameTimeValue.textContent = `${frameTimeMs.toFixed(1)} ms`;
  }
  if (dom.debugMemoryValue) {
    dom.debugMemoryValue.textContent = formatDebugMemory();
  }
  state.debugFpsSampleSeconds = 0;
  state.debugFpsSampleFrames = 0;
  state.debugFrameTimeSampleMs = 0;
}

function formatDebugMemory() {
  const memory = window.performance?.memory;
  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
    return "--";
  }
  const usedMb = memory.usedJSHeapSize / 1048576;
  const limitMb = Number.isFinite(memory.jsHeapSizeLimit)
    ? memory.jsHeapSizeLimit / 1048576
    : undefined;
  return limitMb === undefined
    ? `${usedMb.toFixed(1)} MB`
    : `${usedMb.toFixed(1)} / ${limitMb.toFixed(0)} MB`;
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

function createColliderLineGeometry(body) {
  const size = body.size ?? [0.1, 0.1, 0.1];
  if (body.shape === "box") {
    return createColliderBoxLineGeometry(size);
  }
  if (body.shape === "capsule") {
    return createColliderCapsuleLineGeometry(
      Math.max(size[0], 0.001),
      Math.max(size[1], 0.001)
    );
  }
  return createColliderSphereLineGeometry(Math.max(size[0], 0.001));
}

function createColliderBoxLineGeometry(size) {
  const x = Math.max(size[0] ?? 0.1, 0.001);
  const y = Math.max(size[1] ?? 0.1, 0.001);
  const z = Math.max(size[2] ?? 0.1, 0.001);
  return createLineGeometry([
    -x, -y, -z, x, -y, -z,
    x, -y, -z, x, y, -z,
    x, y, -z, -x, y, -z,
    -x, y, -z, -x, -y, -z,
    -x, -y, z, x, -y, z,
    x, -y, z, x, y, z,
    x, y, z, -x, y, z,
    -x, y, z, -x, -y, z,
    -x, -y, -z, -x, -y, z,
    x, -y, -z, x, -y, z,
    x, y, -z, x, y, z,
    -x, y, -z, -x, y, z
  ]);
}

function createColliderSphereLineGeometry(radius) {
  const positions = [];
  appendEllipseSegments(positions, "xy", radius, radius);
  appendEllipseSegments(positions, "xz", radius, radius);
  appendEllipseSegments(positions, "yz", radius, radius);
  return createLineGeometry(positions);
}

function createColliderCapsuleLineGeometry(radius, height) {
  const positions = [];
  const halfHeight = height * 0.5;
  appendEllipseSegments(positions, "xz", radius, radius, 0, halfHeight, 0);
  appendEllipseSegments(positions, "xz", radius, radius, 0, -halfHeight, 0);
  appendLineSegment(positions, radius, -halfHeight, 0, radius, halfHeight, 0);
  appendLineSegment(positions, -radius, -halfHeight, 0, -radius, halfHeight, 0);
  appendLineSegment(positions, 0, -halfHeight, radius, 0, halfHeight, radius);
  appendLineSegment(positions, 0, -halfHeight, -radius, 0, halfHeight, -radius);
  appendEllipseSegments(positions, "xy", radius, radius, 0, halfHeight, 0, 0, Math.PI);
  appendEllipseSegments(positions, "xy", radius, radius, 0, -halfHeight, 0, Math.PI, Math.PI * 2);
  appendEllipseSegments(positions, "yz", radius, radius, 0, halfHeight, 0, 0, Math.PI);
  appendEllipseSegments(positions, "yz", radius, radius, 0, -halfHeight, 0, Math.PI, Math.PI * 2);
  return createLineGeometry(positions);
}

function createLineGeometry(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function appendEllipseSegments(
  positions,
  plane,
  radiusA,
  radiusB,
  centerX = 0,
  centerY = 0,
  centerZ = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
  segments = 32
) {
  for (let index = 0; index < segments; index += 1) {
    const angleA = startAngle + ((endAngle - startAngle) * index) / segments;
    const angleB = startAngle + ((endAngle - startAngle) * (index + 1)) / segments;
    appendEllipsePoint(positions, plane, radiusA, radiusB, centerX, centerY, centerZ, angleA);
    appendEllipsePoint(positions, plane, radiusA, radiusB, centerX, centerY, centerZ, angleB);
  }
}

function appendEllipsePoint(positions, plane, radiusA, radiusB, centerX, centerY, centerZ, angle) {
  const a = Math.cos(angle) * radiusA;
  const b = Math.sin(angle) * radiusB;
  if (plane === "xy") {
    positions.push(centerX + a, centerY + b, centerZ);
  } else if (plane === "xz") {
    positions.push(centerX + a, centerY, centerZ + b);
  } else {
    positions.push(centerX, centerY + b, centerZ + a);
  }
}

function appendLineSegment(positions, startX, startY, startZ, endX, endY, endZ) {
  positions.push(startX, startY, startZ, endX, endY, endZ);
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
    material = new THREE.LineBasicMaterial({
      color: colliderGroupColors[collisionGroup] ?? colliderGroupColors[0],
      depthTest: false,
      depthWrite: false,
      opacity: 0.78,
      transparent: true
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
  return [
    state.currentModel.mesh,
    ...(state.currentModel.renderOrderMeshes ?? []),
    ...(state.currentModel.outlineMeshes ?? [])
  ];
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
    physicsEnabled: state.physicsEnabled,
    physicsMaxSubSteps: state.physicsTuningOptions.maxSubSteps,
    dynamicWithBoneRotationFeedbackScale:
      state.physicsTuningOptions.dynamicWithBoneRotationFeedbackScale,
    collisionMargin: state.physicsTuningOptions.collisionMargin,
    solverIterations: state.physicsTuningOptions.solverIterations,
    splitImpulse: state.physicsTuningOptions.splitImpulse,
    splitImpulsePenetrationThreshold: state.physicsTuningOptions.splitImpulsePenetrationThreshold,
    runtime: {
      mode: state.currentModel?.runtime?.constructor?.name ?? null,
      frameRate: state.mmdFrameRate,
      ikTolerance: state.ikTolerance ?? null,
      ikMaxIterationsCap: state.ikMaxIterationsCap ?? null
    },
    selfShadowEnabled: state.debugSelfShadowEnabled,
    keyLightCastShadow: state.keyLight?.castShadow ?? null,
    rendererShadowMapEnabled: state.renderer?.shadowMap?.enabled ?? null,
    selfShadow: createSelfShadowDiagnostics(),
    rigidBodyBounds: matrixTranslationBounds(rigidBodyTransforms),
    matricesFinite: finiteArray(physicsStage?.worldMatricesColumnMajor ?? []),
    morphWeightsFinite: finiteArray(physicsStage?.morphWeights ?? []),
    physicsMaxBonePositionDelta: maxStageTranslationDelta(ikStage, physicsStage),
    diagnostics: state.activePhysicsBackend?.diagnostics?.() ?? []
  };
}

function createSelfShadowDiagnostics() {
  const mesh = state.currentModel?.mesh;
  const light = state.keyLight;
  const shadowCamera = light?.shadow?.camera;
  if (light) {
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
  }
  shadowCamera?.updateMatrixWorld();
  const shadowCameraLayerMask = shadowCamera?.layers?.mask ?? null;
  const materials = mesh ? normalizeMaterials(mesh.material) : [];
  const materialDiagnostics = materials.map((material, materialIndex) => {
    const metadata = material.userData?.mmdMaterial;
    const flags = metadata?.flags ?? {};
    return {
      materialIndex,
      name: material.name || metadata?.name || null,
      flags: {
        groundShadow: flags.groundShadow === true,
        selfShadowMap: flags.selfShadowMap === true,
        selfShadow: flags.selfShadow === true,
        edge: flags.edge === true
      },
      receiveShadow: flags.selfShadow === true,
      dedicatedShadowEnabled: material.userData?.mmdTslMaterialUniforms?.dedicatedShadowEnabled?.value ?? null,
      materialClass: material.constructor?.name ?? null,
      receivedShadowPositionNode: Boolean(material.receivedShadowPositionNode),
      normalNode: Boolean(material.normalNode),
      positionNode: Boolean(material.positionNode),
      // TSL exposes normalNode as the material normal input. The diagnostic
      // deliberately reports presence instead of pretending to read a GPU-only value.
      viewSpaceNormalPath: material.normalNode ? "material.normalNode" : null,
      transparent: material.transparent === true,
      depthWrite: material.depthWrite !== false,
      visible: material.visible !== false,
      side: material.side
    };
  });
  const casters = [];
  state.currentModel?.root?.traverse?.((object) => {
    const caster = object.userData?.mmdTslShadowCaster;
    if (!caster) {
      return;
    }
    casters.push({
      name: object.name || null,
      layerMask: object.layers.mask,
      layerMatchesShadowCamera: shadowCameraLayerMask === null
        ? null
        : (object.layers.mask & shadowCameraLayerMask) !== 0,
      indexCount: object.geometry?.index?.count ?? 0,
      groupCount: object.geometry?.groups?.length ?? 0,
      opaqueDraws: caster.opaqueDraws ?? 0,
      alphaTestDraws: caster.alphaTestDraws ?? 0,
      sourceGroupCount: caster.sourceGroupCount ?? 0
    });
  });
  const selfShadowFrames = state.currentMotion?.animation?.selfShadowFrames ?? [];
  return {
    modelPresent: Boolean(mesh),
    sparsePositionMorphsEnabled: mesh?.userData?.mmdTslSparsePositionMorphs === true,
    storedBoundingBox: mesh?.boundingBox
      ? { min: vectorToArray(mesh.boundingBox.min), max: vectorToArray(mesh.boundingBox.max) }
      : null,
    visibleMeshLayerMask: mesh?.layers?.mask ?? null,
    visibleMeshCastShadow: mesh?.castShadow === true,
    visibleMeshReceiveShadow: mesh?.receiveShadow === true,
    casterCount: casters.length,
    casterIndexCount: casters.reduce((sum, caster) => sum + caster.indexCount, 0),
    casterGroupCount: casters.reduce((sum, caster) => sum + caster.groupCount, 0),
    casters,
    receiverMaterialCount: materialDiagnostics.filter(material => material.receiveShadow).length,
    materials: materialDiagnostics,
    layerAgreement: {
      shadowCameraLayerMask,
      casterMatchesShadowCamera: casters.length > 0 && casters.every(caster => caster.layerMatchesShadowCamera === true)
    },
    light: light
      ? {
          castShadow: light.castShadow === true,
          worldPosition: vectorToArray(light.getWorldPosition(new THREE.Vector3())),
          targetWorldPosition: vectorToArray(light.target.getWorldPosition(new THREE.Vector3())),
          shadowBias: light.shadow.bias,
          shadowNormalBias: light.shadow.normalBias,
          shadowMapSize: [light.shadow.mapSize.x, light.shadow.mapSize.y],
          shadowCamera: shadowCamera
            ? {
                near: shadowCamera.near,
                far: shadowCamera.far,
                left: shadowCamera.left,
                right: shadowCamera.right,
                top: shadowCamera.top,
                bottom: shadowCamera.bottom,
                layerMask: shadowCamera.layers.mask,
                worldMatrix: Array.from(shadowCamera.matrixWorld.elements)
              }
            : null
        }
      : null,
    vmdSelfShadow: {
      frameCount: selfShadowFrames.length,
      sampledFrameIndex: state.selfShadowFrameHint.index,
      mode: state.selfShadowStateScratch.mode,
      distance: state.selfShadowStateScratch.distance
    },
    dedicatedPass: getMmdTslDedicatedShadowState()
  };
}

function vectorToArray(vector) {
  return [vector.x, vector.y, vector.z];
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
