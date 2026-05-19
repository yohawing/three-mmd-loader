import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  createAmmoMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend
} from "../../dist/physics/index.js";
import { parseVmd } from "../../dist/parser/index.js";
import { ThreeMmdLoader, syncMmdSpecularDirection } from "../../dist/three/index.js";

const debugEnabled = new window.URLSearchParams(location.search).has("debug");
const ammoScriptUrl = "/node_modules/ammo.js/ammo.js";

const canvas = document.querySelector("#viewer-canvas");
const stage = document.querySelector(".stage");
const topBar = document.querySelector(".top-bar");
const transportBar = document.querySelector(".transport");
const viewerShell = document.querySelector(".viewer-shell");
const statusText = document.querySelector("#status");
const physicsErrorBanner = document.querySelector("#physics-error");
const modelSwitcher = document.querySelector("#model-switcher");
const motionSwitcher = document.querySelector("#motion-switcher");
const audioNameText = document.querySelector("#audio-name");
const frameValueText = document.querySelector("#frame-value");
const timeline = document.querySelector("#timeline");
const playToggle = document.querySelector("#play-toggle");
const playToggleIcon = playToggle?.querySelector(".material-symbols-rounded");
const loadMenu = document.querySelector("#load-menu");
const modelFileInput = document.querySelector("#model-file");
const modelFolderInput = document.querySelector("#model-folder");
const motionFileInput = document.querySelector("#motion-file");
const poseFileInput = document.querySelector("#pose-file");
const audioFileInput = document.querySelector("#audio-file");
const bgmAudio = document.querySelector("#bgm-audio");
const restPoseAnimation = {
  kind: "vmd",
  metadata: {
    format: "vmd",
    modelName: "",
    counts: {
      bones: 0,
      morphs: 0,
      cameras: 0,
      lights: 0,
      selfShadows: 0,
      properties: 0
    },
    maxFrame: 0
  },
  boneTracks: {},
  morphTracks: {},
  cameraFrames: [],
  lightFrames: [],
  selfShadowFrames: [],
  propertyFrames: []
};

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Viewer canvas is missing");
}

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xffffff, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 1000);
camera.position.set(0, 1.1, 9);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.9, 0);

const grid = new THREE.GridHelper(40, 40, 0x888888, 0xcccccc);
scene.add(grid);
const axes = new THREE.AxesHelper(10);
scene.add(axes);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

let activePhysicsBackend;
let ammoNamespace;
let ammoScriptLoadPromise;
const animationLoader = new ThreeMmdLoader({ runtime: { frameRate: 30 } });
const clock = new THREE.Clock();
let currentModel;
let currentMotion;
let currentFolderTextureMap;
let currentFolderPmxFiles = [];
let currentMotionVmdFiles = [];
let pendingMotionSource;
let pendingMotionLabel;
let elapsedSeconds = 0;
let isPlaying = false;
let isSeeking = false;
let audioObjectUrl;
let isSyncingAudioState = false;
let viewerDisposed = false;
const debugMaterialState = new Map();

const viewerApi = {
  camera,
  controls,
  renderer,
  scene,
  loadModelUrl: loadModelFromUrl,
  loadMotionUrl: loadMotionFromUrl,
  get currentModel() {
    return currentModel;
  },
  get currentMotion() {
    return currentMotion;
  }
};
if (debugEnabled) {
  viewerApi.debug = createViewerDebugApi();
}
window.mmdViewer = viewerApi;

bindControls();
resize();
clock.getDelta();
renderer.setAnimationLoop(render);

function bindControls() {
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", disposeViewerResources, { once: true });
  window.addEventListener("beforeunload", disposeViewerResources, { once: true });
  document.addEventListener("click", (event) => {
    if (loadMenu && !loadMenu.contains(event.target)) {
      closeLoadMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && loadMenu) {
      closeLoadMenu();
      loadMenu.querySelector("summary")?.focus();
    }
  });
  loadMenu?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      closeLoadMenu();
    });
  });
  document.querySelector("#choose-model-file")?.addEventListener("click", () => {
    modelFileInput?.click();
  });
  document.querySelector("#choose-model-folder")?.addEventListener("click", () => {
    modelFolderInput?.click();
  });
  document.querySelector("#choose-motion")?.addEventListener("click", () => {
    motionFileInput?.click();
  });
  document.querySelector("#choose-pose")?.addEventListener("click", () => {
    poseFileInput?.click();
  });
  document.querySelector("#choose-audio")?.addEventListener("click", () => {
    audioFileInput?.click();
  });
  modelFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      void loadModel(file);
    }
  });
  modelFolderInput?.addEventListener("change", (event) => {
    const files = event.target instanceof HTMLInputElement ? event.target.files : undefined;
    if (files && files.length > 0) {
      void loadModelFolder(Array.from(files));
    }
  });
  modelSwitcher?.addEventListener("change", () => {
    if (!(modelSwitcher instanceof window.HTMLSelectElement)) {
      return;
    }
    const selectedFile = currentFolderPmxFiles.find(
      (file) => modelFileKey(file) === modelSwitcher.value
    );
    if (selectedFile) {
      void switchFolderModel(selectedFile);
    }
  });
  motionSwitcher?.addEventListener("change", () => {
    if (!(motionSwitcher instanceof window.HTMLSelectElement)) {
      return;
    }
    const selectedFile = currentMotionVmdFiles.find((file) => file.name === motionSwitcher.value);
    if (selectedFile) {
      void switchMotion(selectedFile);
    }
  });
  motionFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      currentMotionVmdFiles = [file];
      updateMotionSwitcher(file);
      void loadMotion(file);
    }
  });
  poseFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      void loadPose(file);
    }
  });
  audioFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      loadAudioFile(file);
    }
  });
  playToggle?.addEventListener("click", () => {
    void setPlaybackPlaying(!isPlaying);
  });
  timeline?.addEventListener("input", () => {
    isSeeking = true;
    elapsedSeconds = Number.parseFloat(timeline.value);
    evaluateRuntime({ physics: false });
    syncAudioToMotionTime();
  });
  timeline?.addEventListener("change", () => {
    isSeeking = false;
  });
  if (isAudioElement(bgmAudio)) {
    bgmAudio.addEventListener("play", () => {
      if (!isSyncingAudioState && hasCurrentMotion()) {
        setPlaybackState(true);
      }
    });
    bgmAudio.addEventListener("pause", () => {
      if (!isSyncingAudioState && hasCurrentMotion()) {
        setPlaybackState(false);
      }
    });
    bgmAudio.addEventListener("seeking", syncMotionToAudioTime);
    bgmAudio.addEventListener("seeked", syncMotionToAudioTime);
    bgmAudio.addEventListener("timeupdate", () => {
      if (!isPlaying || !hasCurrentMotion()) {
        return;
      }
      syncMotionToAudioTime({ evaluate: false });
    });
    bgmAudio.addEventListener("ended", () => {
      if (!bgmAudio.loop) {
        setPlaybackState(false);
      }
    });
    bgmAudio.addEventListener("loadedmetadata", () => {
      setStatus("", "ready");
    });
    bgmAudio.addEventListener("error", () => {
      const message = "Failed to load audio source.";
      window.console?.warn("[viewer]", message, bgmAudio.error);
      setStatus(message, "error");
    });
  }
  bindDropTarget();
  updatePlaybackDisplay();
  updateStageState();
}

async function loadModelFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    await loadModel(bytes, url.split("/").at(-1) ?? url, () => createUrlTextureLoader(url));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function loadMotionFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    await loadMotion(bytes, url.split("/").at(-1) ?? url);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function readAnimationSourceBytes(source) {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  if (typeof source === "string") {
    return fetchBytes(source);
  }
  if (source && typeof source.arrayBuffer === "function") {
    return new Uint8Array(await source.arrayBuffer());
  }
  throw new TypeError("Animation source must be a string, File, ArrayBuffer, or Uint8Array");
}

function loadAudioFile(file) {
  if (!isAudioFile(file)) {
    setStatus("Select a WAV, MP3, or OGG audio file.", "error");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  setAudioSource(objectUrl, { objectUrl });
  setDisplayedText(audioNameText, file.name);
  setStatus("", "ready");
}

function setAudioSource(src, options = {}) {
  if (!isAudioElement(bgmAudio)) {
    return;
  }
  clearAudioSource();
  bgmAudio.src = src;
  bgmAudio.loop = hasCurrentMotion();
  bgmAudio.load();
  if (options.objectUrl) {
    audioObjectUrl = options.objectUrl;
  }
}

function clearAudioSource() {
  if (isAudioElement(bgmAudio)) {
    bgmAudio.pause();
    bgmAudio.removeAttribute("src");
    bgmAudio.load();
  }
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = undefined;
  }
  setDisplayedText(audioNameText, "");
}

async function loadModel(source, label = source.name ?? "model", modelLoader) {
  try {
    setStatus(`Loading model: ${label}`, "loading");
    resetFolderModelState();
    const preservedMotion = currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    const resolvedModelLoader =
      typeof modelLoader === "function"
        ? await modelLoader()
        : await (modelLoader ?? createModelLoader());
    currentModel = await resolvedModelLoader.loadModel(source, { frustumCulled: false });
    syncMmdSpecularDirection(currentModel.mesh.material, keyLight);
    addModelToScene(currentModel);
    currentFolderPmxFiles = [createModelSwitcherEntry(source, label)];
    updateModelSwitcher(currentFolderPmxFiles[0]);
    elapsedSeconds = 0;
    timeline.max = "0.001";
    timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(currentModel.mesh);
    if (pendingMotionSource && !preservedMotion) {
      await loadMotion(pendingMotionSource, pendingMotionLabel);
    } else if (hasCurrentMotion()) {
      currentModel.runtime?.setAnimation(currentMotion.animation, currentModel.mesh);
      timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001));
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      currentModel.runtime?.setAnimation(restPoseAnimation, currentModel.mesh);
    }
    setStatus("", "ready");
    reportTextureDiagnostics(currentModel);
    updateStageState();
    renderStillFrame();
  } catch (error) {
    resetFolderModelState();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  }
}

async function loadModelFolder(files) {
  resetFolderModelState();
  resetMotionSwitcherState();
  const modelFiles = findModelFiles(files);
  const modelFile = modelFiles[0];
  if (!modelFile) {
    setStatus("No PMX or PMD model found in the selected folder.", "error");
    return;
  }

  const textureMap = createFolderTextureMap(files, modelFile);
  const folderName =
    normalizeRelativePath(modelFile.webkitRelativePath || modelFile.name).split("/")[0] || "folder";
  currentFolderTextureMap = textureMap;
  currentFolderPmxFiles = modelFiles;
  updateModelSwitcher(modelFile);

  try {
    setStatus(`Loading model folder: ${folderName}`, "loading");
    const preservedMotion = currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    const folderLoader = await createModelLoader({ textureMap });
    currentModel = await folderLoader.loadModel(modelFile, { frustumCulled: false });
    syncMmdSpecularDirection(currentModel.mesh.material, keyLight);
    addModelToScene(currentModel);
    elapsedSeconds = 0;
    timeline.max = "0.001";
    timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(currentModel.mesh);
    if (pendingMotionSource && !preservedMotion) {
      await loadMotion(pendingMotionSource, pendingMotionLabel);
    } else if (hasCurrentMotion()) {
      currentModel.runtime?.setAnimation(currentMotion.animation, currentModel.mesh);
      timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001));
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      currentModel.runtime?.setAnimation(restPoseAnimation, currentModel.mesh);
    }
    setStatus("", "ready");
    reportTextureDiagnostics(currentModel);
    updateStageState();
    renderStillFrame();
  } catch (error) {
    resetFolderModelState();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  }
}

async function switchFolderModel(modelFile) {
  if (!currentFolderTextureMap) {
    return;
  }

  try {
    setStatus(`Switching to ${modelFile.name}`, "loading");
    const preservedMotion = currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    const folderLoader = await createModelLoader({ textureMap: currentFolderTextureMap });
    currentModel = await folderLoader.loadModel(modelFile, { frustumCulled: false });
    syncMmdSpecularDirection(currentModel.mesh.material, keyLight);
    addModelToScene(currentModel);
    updateModelSwitcher(modelFile);
    elapsedSeconds = 0;
    timeline.max = "0.001";
    timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(currentModel.mesh);
    if (hasCurrentMotion()) {
      currentModel.runtime?.setAnimation(currentMotion.animation, currentModel.mesh);
      timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001));
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      currentModel.runtime?.setAnimation(restPoseAnimation, currentModel.mesh);
    }
    setStatus("", "ready");
    reportTextureDiagnostics(currentModel);
    updateStageState();
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  }
}

async function loadMotion(source, label = source.name ?? "motion") {
  try {
    if (!currentModel) {
      pendingMotionSource = source;
      pendingMotionLabel = label;
      updateMotionSwitcherSelection(source);
      setStatus("Motion queued", "ready");
      return;
    }
    setStatus(`Loading motion: ${label}`, "loading");
    pendingMotionSource = source;
    pendingMotionLabel = label;
    const bytes = await readAnimationSourceBytes(source);
    const animation = parseVmd(bytes);
    currentMotion = {
      source,
      name: animation.metadata.modelName,
      animation,
      durationSeconds: animationDurationSeconds(animation)
    };
    currentModel.runtime?.setAnimation(animation, currentModel.mesh);
    timeline.max = String(Math.max(animationDurationSeconds(animation), 0.001));
    elapsedSeconds = 0;
    timeline.value = "0";
    syncAudioToMotionTime();
    updateMotionSwitcherSelection(source);
    updatePlaybackDisplay();
    updateTransportState();
    syncPlaybackToCurrentAudioState();
    setStatus("", "ready");
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function loadPose(source, label = source.name ?? "pose") {
  try {
    if (!currentModel) {
      setStatus("Load a model before loading a pose.", "error");
      return;
    }
    setStatus(`Loading pose: ${label}`, "loading");
    const poseAnimation = await animationLoader.loadPoseAnimation(source, label);
    currentMotion = {
      ...poseAnimation,
      durationSeconds: 1
    };
    currentModel.runtime?.setAnimation(poseAnimation.animation, currentModel.mesh);
    elapsedSeconds = 0;
    timeline.max = "1";
    timeline.value = "0";
    resetMotionSwitcherState();
    updatePlaybackDisplay();
    updateTransportState();
    setStatus("", "ready");
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

function render() {
  const delta = clock.getDelta();
  if (isPlaying && !isSeeking && hasActiveAudioSource()) {
    syncMotionToAudioTime({ evaluate: false });
  } else if (isPlaying && !isSeeking) {
    elapsedSeconds += delta;
  }
  evaluateRuntime();
  controls.update();
  renderer.render(scene, camera);
}

function renderStillFrame() {
  evaluateRuntime();
  controls.update();
  renderer.render(scene, camera);
}

function evaluateRuntime(options = {}) {
  if (!currentModel?.runtime) {
    return;
  }
  const maxTime = Number.parseFloat(timeline?.max ?? "10");
  if (elapsedSeconds > maxTime && maxTime > 0) {
    elapsedSeconds %= maxTime;
    syncAudioToMotionTime();
  }
  currentModel.runtime.tick(elapsedSeconds, {
    mesh: currentModel.mesh,
    ik: options.ik ?? hasCurrentMotion(),
    physics: options.physics ?? (!isSeeking && elapsedSeconds > 0)
  });
  timeline.value = String(elapsedSeconds);
  updatePlaybackDisplay();
}

function clearModel(options = {}) {
  restoreDebugMaterials();
  if (currentModel) {
    scene.remove(currentModel.mesh);
    disposeModelResources(currentModel);
  }
  currentModel = undefined;
  disposeActivePhysicsBackend();
  if (!options.preserveMotion) {
    currentMotion = undefined;
  }
  if (!options.preserveModelSwitcher) {
    resetFolderModelState();
  }
  if (!options.preserveMotion) {
    resetMotionSwitcherState();
  }
  elapsedSeconds = 0;
  if (timeline) {
    timeline.max = "0.001";
    timeline.value = "0";
  }
  updatePlaybackDisplay();
  updateStageState();
  updateTransportState();
}

function addModelToScene(model) {
  scene.add(
    model.mesh,
    ...(model.outlineMeshes ?? []),
    ...(model.renderOrderMeshes ?? [])
  );
}

function disposeModelResources(model) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedTextures = new Set();
  const meshes = [
    model.mesh,
    ...(model.outlineMeshes ?? []),
    ...(model.renderOrderMeshes ?? [])
  ];
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    disposeSkeletonResources(mesh.skeleton, disposedTextures);
    if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
      mesh.geometry.dispose();
      disposedGeometries.add(mesh.geometry);
    }
    for (const material of normalizeMaterials(mesh.material)) {
      disposeMaterialResources(material, disposedMaterials, disposedTextures);
    }
  }
}

function disposeMaterialResources(material, disposedMaterials, disposedTextures) {
  for (const texture of collectMaterialTextures(material)) {
    disposeTexture(texture, disposedTextures);
  }
  if (!disposedMaterials.has(material)) {
    material.dispose();
    disposedMaterials.add(material);
  }
}

function collectMaterialTextures(material) {
  const textures = [];
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }
  for (const value of Object.values(material.userData ?? {})) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }
  for (const value of Object.values(material.userData ?? {})) {
    const uniforms = value?.uniforms;
    if (uniforms && typeof uniforms === "object") {
      for (const uniform of Object.values(uniforms)) {
        if (uniform?.value instanceof THREE.Texture) {
          textures.push(uniform.value);
        }
      }
    }
  }
  return textures;
}

function disposeTexture(texture, disposedTextures) {
  if (!texture || disposedTextures.has(texture)) {
    return;
  }
  texture.dispose();
  disposedTextures.add(texture);
}

function disposeSkeletonResources(skeleton, disposedTextures) {
  if (!skeleton) {
    return;
  }
  disposeTexture(skeleton.boneTexture, disposedTextures);
  skeleton.dispose?.();
}

function fitCameraToObject(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    setDefaultCameraView();
    return;
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.75);
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new THREE.Vector3(0, radius * 0.15, radius * 5.2));
  camera.near = Math.max(radius / 100, 0.01);
  camera.far = Math.max(radius * 40, 100);
  camera.updateProjectionMatrix();
  controls.update();
}

function setDefaultCameraView() {
  controls.target.set(0, 0.9, 0);
  camera.position.set(0, 1.1, 9);
  camera.near = 0.01;
  camera.far = 1000;
  camera.updateProjectionMatrix();
  controls.update();
}

function normalizeMaterials(material) {
  return Array.isArray(material) ? material : [material];
}

function createViewerDebugApi() {
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
        if (!Array.isArray(debugMaterialState.get(mesh)?.material) && mesh.material.length === 1) {
          mesh.material = mesh.material[0];
        }
      }
      return "MeshLambertMaterial debug override enabled";
    },
    outlineOff() {
      currentModel?.outlineMeshes?.forEach((outline) => {
        outline.visible = false;
      });
      return "outline hidden";
    },
    evaluateAt(seconds, options = {}) {
      elapsedSeconds = Number(seconds);
      if (timeline && elapsedSeconds > Number.parseFloat(timeline.max)) {
        timeline.max = String(elapsedSeconds);
      }
      evaluateRuntime(options);
      controls.update();
      renderer.render(scene, camera);
      return this.state();
    },
    state() {
      return createSmokeState();
    },
    dumpFaceNormals() {
      const mesh = currentModel?.mesh;
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
  if (!currentModel) {
    return [];
  }
  return [currentModel.mesh, ...(currentModel.outlineMeshes ?? [])];
}

function currentDebugMaterials() {
  return currentDebugMeshes().flatMap((mesh) => normalizeMaterials(mesh.material));
}

function rememberDebugMaterial(mesh) {
  if (!debugMaterialState.has(mesh)) {
    debugMaterialState.set(mesh, { material: mesh.material });
  }
}

function restoreDebugMaterials() {
  for (const [mesh, state] of debugMaterialState) {
    mesh.material = state.material;
  }
  debugMaterialState.clear();
  return "materials restored";
}

function createSmokeState() {
  const model = currentModel;
  const runtime = model?.runtime;
  const debugState = runtime?.debugState();
  const rigidBodyTransforms = runtime?.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
  const ikStage = debugState?.stages.ik;
  const physicsStage = debugState?.stages.physics;
  return {
    ready: !!model,
    timeSeconds: elapsedSeconds,
    modelName: model?.mesh.name ?? null,
    rigidBodyCount: model?.mesh.userData.mmdModel?.rigidBodyCount ?? 0,
    jointCount: model?.mesh.userData.mmdModel?.jointCount ?? 0,
    rigidBodyTransformCount: rigidBodyTransforms.length,
    rigidBodyBounds: matrixTranslationBounds(rigidBodyTransforms),
    matricesFinite: finiteArray(physicsStage?.worldMatricesColumnMajor ?? []),
    morphWeightsFinite: finiteArray(physicsStage?.morphWeights ?? []),
    physicsMaxBonePositionDelta: maxStageTranslationDelta(ikStage, physicsStage),
    diagnostics: activePhysicsBackend?.diagnostics?.() ?? []
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

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  updateChromeHeights();
}

function bindDropTarget() {
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    stage?.classList.add("is-dragging");
  });
  window.addEventListener("dragleave", () => {
    stage?.classList.remove("is-dragging");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    stage?.classList.remove("is-dragging");
    void handleDroppedFiles(event.dataTransfer);
  });
}

async function handleDroppedFiles(dataTransfer) {
  const files = await collectDroppedFiles(dataTransfer);
  const modelFile = findModelFile(files);
  const vmdFiles = findVmdFiles(files);
  const shouldLoadModelFolder =
    modelFile && files.some((file) => file.webkitRelativePath?.includes("/"));
  if (vmdFiles.length > 0) {
    currentMotionVmdFiles = vmdFiles;
    updateMotionSwitcher(vmdFiles[0]);
    pendingMotionSource = undefined;
    pendingMotionLabel = undefined;
  } else {
    resetMotionSwitcherState();
  }
  if (shouldLoadModelFolder) {
    await loadModelFolder(files);
  } else if (modelFile) {
    await loadModel(modelFile);
  }
  if (vmdFiles.length > 0) {
    currentMotionVmdFiles = vmdFiles;
    updateMotionSwitcher(vmdFiles[0]);
    await loadMotion(vmdFiles[0]);
  }
  for (const file of files) {
    if (file === modelFile || vmdFiles.includes(file)) {
      continue;
    }
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd")) {
      if (!shouldLoadModelFolder) {
        await loadModel(file);
      }
    } else if (lowerName.endsWith(".vpd")) {
      await loadPose(file);
    } else if (isAudioFile(file)) {
      loadAudioFile(file);
    }
  }
}

async function collectDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer?.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length === 0) {
    return Array.from(dataTransfer?.files ?? []);
  }
  const files = [];
  for (const entry of entries) {
    await collectEntryFiles(entry, "", files);
  }
  return files;
}

async function collectEntryFiles(entry, directory, files) {
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    const relativePath = `${directory}${file.name}`;
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: relativePath
    });
    files.push(file);
    return;
  }
  if (!entry.isDirectory) {
    return;
  }
  const reader = entry.createReader();
  const childDirectory = `${directory}${entry.name}/`;
  while (true) {
    const entries = await readDirectoryEntries(reader);
    if (entries.length === 0) {
      break;
    }
    for (const child of entries) {
      await collectEntryFiles(child, childDirectory, files);
    }
  }
}

function readFileEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

function setStatus(message, state = "ready") {
  statusText.textContent = message;
  statusText.classList.toggle("is-loading", state === "loading");
  topBar?.classList.toggle("is-error", state === "error");
  topBar?.classList.toggle("is-warning", state === "warning");
}

function reportTextureDiagnostics(model) {
  const diagnostics = model.textureDiagnostics ?? [];
  if (diagnostics.length === 0) {
    return;
  }

  const summaryRows = diagnostics.map((diagnostic) => ({
    level: diagnostic.level,
    code: diagnostic.code,
    materialIndex: diagnostic.materialIndex,
    textureKind: diagnostic.textureKind,
    path: diagnostic.path
  }));

  const readableRows = summaryRows.map(
    (diagnostic) =>
      `${diagnostic.level} ${diagnostic.code} material=${diagnostic.materialIndex} kind=${diagnostic.textureKind} path=${diagnostic.path}`
  );

  globalThis.console.warn("[mmd-viewer] texture diagnostics:", summaryRows, readableRows);
  setStatus(
    `Loaded with ${diagnostics.length} texture ${diagnostics.length === 1 ? "warning" : "warnings"} (see console)`,
    "warning"
  );
}

function setDisplayedText(element, text) {
  if (element) {
    element.textContent = text;
    element.hidden = text.length === 0;
  }
}

function updatePlayToggle() {
  if (playToggleIcon) {
    playToggleIcon.textContent = isPlaying ? "pause" : "play_arrow";
  }
  playToggle?.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

async function setPlaybackPlaying(playing) {
  setPlaybackState(playing);
  if (!isAudioElement(bgmAudio) || !hasActiveAudioSource()) {
    return;
  }
  isSyncingAudioState = true;
  try {
    if (playing) {
      syncAudioToMotionTime();
      await bgmAudio.play();
    } else {
      bgmAudio.pause();
    }
  } catch (error) {
    setPlaybackState(false);
    const message = error instanceof Error ? error.message : String(error);
    window.console?.warn("[viewer] Failed to update audio playback:", error);
    setStatus(message, "error");
  } finally {
    isSyncingAudioState = false;
  }
}

function setPlaybackState(playing) {
  isPlaying = playing;
  updatePlayToggle();
}

function syncPlaybackToCurrentAudioState() {
  if (!isAudioElement(bgmAudio) || !hasCurrentMotion() || bgmAudio.paused) {
    return;
  }
  setPlaybackState(true);
  syncMotionToAudioTime({ evaluate: false });
}

function hasActiveAudioSource() {
  return isAudioElement(bgmAudio) && bgmAudio.currentSrc.length > 0;
}

function syncMotionToAudioTime(options = {}) {
  if (!isAudioElement(bgmAudio) || !hasCurrentMotion()) {
    return;
  }
  const audioTime = Number.isFinite(bgmAudio.currentTime) ? bgmAudio.currentTime : 0;
  elapsedSeconds = audioTime;
  if (options.evaluate !== false) {
    evaluateRuntime({ physics: options.physics ?? false });
  }
}

function syncAudioToMotionTime() {
  if (!isAudioElement(bgmAudio) || !hasActiveAudioSource()) {
    return;
  }
  const duration = Number.isFinite(bgmAudio.duration) ? bgmAudio.duration : undefined;
  const targetTime = duration ? Math.min(elapsedSeconds, Math.max(duration - 0.001, 0)) : elapsedSeconds;
  try {
    bgmAudio.currentTime = Math.max(targetTime, 0);
  } catch (error) {
    window.console?.warn("[viewer] Failed to seek audio:", error);
  }
}

function closeLoadMenu() {
  loadMenu?.removeAttribute("open");
}

function updatePlaybackDisplay() {
  const duration = currentMotionDurationSeconds();
  const currentTime = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  frameValueText.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

function hasCurrentMotion() {
  return currentMotion?.animation !== undefined;
}

function currentMotionDurationSeconds() {
  return (
    currentMotion?.durationSeconds ??
    (currentMotion ? animationDurationSeconds(currentMotion.animation) : 0)
  );
}

function animationDurationSeconds(animation) {
  return Math.max((animation.metadata?.maxFrame ?? 0) / 30, 0);
}

function updateStageState() {
  stage?.classList.toggle("is-empty", !currentModel);
}

function updateTransportState() {
  const hasMotion = hasCurrentMotion();
  if (transportBar) {
    transportBar.hidden = !hasMotion;
  }
  if (isAudioElement(bgmAudio)) {
    bgmAudio.loop = hasMotion;
  }
  viewerShell?.classList.toggle("has-motion", hasMotion);
}

function updateChromeHeights() {
  if (!viewerShell || !topBar) {
    return;
  }
  viewerShell.style.setProperty("--top-bar-height", `${topBar.offsetHeight}px`);
  if (transportBar) {
    viewerShell.style.setProperty("--transport-height", `${transportBar.offsetHeight}px`);
  }
}

function formatTime(seconds) {
  const safeSeconds = Math.max(Number.isFinite(seconds) ? seconds : 0, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function findModelFile(files) {
  return findModelFiles(files)[0];
}

function findModelFiles(files) {
  return files
    .filter((file) => {
      const lowerName = file.name.toLowerCase();
      return lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd");
    })
    .sort((a, b) => modelFileKey(a).localeCompare(modelFileKey(b), undefined, { numeric: true }));
}

function findVmdFiles(files) {
  return files
    .filter((file) => file.name.toLowerCase().endsWith(".vmd"))
    .sort((a, b) => motionFileKey(a).localeCompare(motionFileKey(b), undefined, { numeric: true }));
}

function modelFileKey(file) {
  return normalizeRelativePath(file.webkitRelativePath || file.name);
}

function motionFileKey(file) {
  return normalizeRelativePath(file.webkitRelativePath || file.name);
}

function createModelSwitcherEntry(source, label) {
  if (source instanceof window.File) {
    return source;
  }
  return { name: label };
}

async function switchMotion(file) {
  setStatus(`Switching motion to ${file.name}`, "loading");
  await loadMotion(file);
}

function updateModelSwitcher(selectedFile) {
  if (!(modelSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }

  modelSwitcher.replaceChildren(
    ...currentFolderPmxFiles.map((file) => {
      const option = document.createElement("option");
      option.value = modelFileKey(file);
      option.textContent = file.name;
      return option;
    })
  );
  modelSwitcher.value = modelFileKey(selectedFile);
  modelSwitcher.hidden = currentFolderPmxFiles.length === 0;
  updateChromeHeights();
}

function updateMotionSwitcher(selectedFile) {
  if (!(motionSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }

  motionSwitcher.replaceChildren(
    ...currentMotionVmdFiles.map((file) => {
      const option = document.createElement("option");
      option.value = file.name;
      option.textContent = file.name;
      return option;
    })
  );
  motionSwitcher.value = selectedFile?.name ?? "";
  motionSwitcher.hidden = currentMotionVmdFiles.length === 0;
  updateChromeHeights();
}

function updateMotionSwitcherSelection(source) {
  if (!(source instanceof window.File)) {
    return;
  }
  const selectedFile = currentMotionVmdFiles.find(
    (file) => file === source || file.name === source.name
  );
  if (selectedFile) {
    updateMotionSwitcher(selectedFile);
  }
}

function resetFolderModelState() {
  currentFolderTextureMap = undefined;
  currentFolderPmxFiles = [];
  if (modelSwitcher instanceof window.HTMLSelectElement) {
    modelSwitcher.replaceChildren();
    modelSwitcher.hidden = true;
  }
  updateChromeHeights();
}

function resetMotionSwitcherState() {
  currentMotionVmdFiles = [];
  if (motionSwitcher instanceof window.HTMLSelectElement) {
    motionSwitcher.replaceChildren();
    motionSwitcher.hidden = true;
  }
  updateChromeHeights();
}

function createFolderTextureMap(files, modelFile) {
  const textureMap = {};
  const modelDirectory = directoryName(
    normalizeRelativePath(modelFile.webkitRelativePath || modelFile.name)
  );

  for (const file of files) {
    if (!isTextureFile(file)) {
      continue;
    }

    const relativePath = normalizeRelativePath(file.webkitRelativePath || file.name);
    const relativeToModel = modelDirectory
      ? stripPrefix(relativePath, `${modelDirectory}/`)
      : relativePath;

    textureMap[relativePath] = file;
    textureMap[relativeToModel] = file;
    textureMap[file.name] = file;
  }

  return textureMap;
}

function isTextureFile(file) {
  return /\.(bmp|gif|jpe?g|png|tga|webp)$/i.test(file.name);
}

function isAudioFile(file) {
  return /\.(mp3|ogg|wav)$/i.test(file.name);
}

function isAudioElement(element) {
  return element instanceof window.HTMLAudioElement;
}

function normalizeRelativePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function directoryName(path) {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex === -1 ? "" : path.slice(0, slashIndex);
}

function stripPrefix(path, prefix) {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

async function createUrlTextureLoader(modelUrl) {
  return await createModelLoader({
    textureResolver: {
      async resolve(path) {
        return new URL(
          path.replaceAll("\\", "/"),
          new URL(".", new URL(modelUrl, location.href))
        ).toString();
      }
    }
  });
}

async function createModelLoader(extraOptions = {}) {
  const runtimeOptions = extraOptions.runtime ?? {};
  const physicsBackend = await createPhysicsBackend();
  return new ThreeMmdLoader({
    ...extraOptions,
    runtime: {
      ...runtimeOptions,
      frameRate: 30,
      physics: "external",
      physicsBackend
    }
  });
}

async function createPhysicsBackend() {
  disposeActivePhysicsBackend();
  if (!ammoNamespace) {
    setStatus("Loading physics engine...", "loading");
  }
  ammoNamespace ??= await initAmmoNamespaceSafely();
  if (ammoNamespace) {
    try {
      activePhysicsBackend = createAmmoMmdPhysicsBackend(ammoNamespace);
    } catch (error) {
      reportAmmoInitializationFailure("createAmmoMmdPhysicsBackend", error);
      activePhysicsBackend = createDisabledPhysicsBackend(
        "Ammo.js physics backend failed to initialize; physics simulation disabled."
      );
    }
  } else {
    activePhysicsBackend = createDisabledPhysicsBackend(
      "Ammo.js failed to load; physics simulation disabled."
    );
  }
  return activePhysicsBackend;
}

function disposeActivePhysicsBackend() {
  if (activePhysicsBackend && !activePhysicsBackend.disposed) {
    activePhysicsBackend.dispose?.();
  }
  activePhysicsBackend = undefined;
}

function disposeViewerResources() {
  if (viewerDisposed) {
    return;
  }
  viewerDisposed = true;
  renderer.setAnimationLoop(null);
  clearModel();
  resetFolderModelState();
  resetMotionSwitcherState();
  pendingMotionSource = undefined;
  pendingMotionLabel = undefined;
  clearAudioSource();
  controls.dispose();
  renderer.dispose();
  renderer.forceContextLoss?.();
}

async function initAmmoNamespace() {
  const scriptLoaded = await loadAmmoScript();
  if (!scriptLoaded) {
    return undefined;
  }
  let ammoCandidate;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      ammoCandidate = getAmmoCandidate();
    } catch (error) {
      reportAmmoInitializationFailure("Ammo global", error);
      return undefined;
    }
    if (ammoCandidate) {
      break;
    }
    if (attempt < 2) {
      await waitForAmmoGlobalRetry(attempt);
    }
  }
  if (!ammoCandidate) {
    reportAmmoInitializationFailure(
      "Ammo global",
      new Error("Ammo is not available on globalThis, window, or self.")
    );
    return undefined;
  }
  try {
    if (typeof ammoCandidate === "function") {
      const result = ammoCandidate();
      return await Promise.resolve(result);
    }
    return ammoCandidate;
  } catch (error) {
    reportAmmoInitializationFailure("Ammo()", error);
    return undefined;
  }
}

function loadAmmoScript() {
  try {
    if (getAmmoCandidate()) {
      return Promise.resolve(true);
    }
  } catch (error) {
    reportAmmoInitializationFailure("Ammo global", error);
    return Promise.resolve(false);
  }

  ammoScriptLoadPromise ??= new Promise((resolve) => {
    const script = document.createElement("script");
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settle(false, "ammo.js script load", new Error(`Timed out loading ${ammoScriptUrl}`));
    }, 10000);

    const settle = (loaded, phase, error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("error", handleWindowError, { capture: true });
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleScriptError);
      if (!loaded && error) {
        reportAmmoInitializationFailure(phase, error);
      }
      resolve(loaded);
    };

    const handleWindowError = (event) => {
      if (!isAmmoScriptErrorEvent(event)) {
        return;
      }
      event.preventDefault();
      settle(false, "ammo.js script eval", event.error ?? new Error(event.message));
    };

    const handleLoad = () => {
      const queueLoadSettlement =
        typeof window.queueMicrotask === "function"
          ? window.queueMicrotask.bind(window)
          : (callback) => window.setTimeout(callback, 0);
      queueLoadSettlement(() => settle(true));
    };

    const handleScriptError = () => {
      settle(false, "ammo.js script load", new Error(`Failed to load ${ammoScriptUrl}`));
    };

    window.addEventListener("error", handleWindowError, { capture: true });
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleScriptError);
    script.async = true;
    script.src = ammoScriptUrl;
    document.head.appendChild(script);
  });

  return ammoScriptLoadPromise;
}

function isAmmoScriptErrorEvent(event) {
  const filename = event.filename ?? "";
  const absoluteAmmoScriptUrl = new URL(ammoScriptUrl, location.href).href;
  if (filename === absoluteAmmoScriptUrl || filename.endsWith(ammoScriptUrl)) {
    return true;
  }
  const stack = typeof event.error?.stack === "string" ? event.error.stack : "";
  return stack.includes(absoluteAmmoScriptUrl) || stack.includes(ammoScriptUrl);
}

function getAmmoCandidate() {
  const globalScopes = [
    typeof globalThis !== "undefined" ? globalThis : undefined,
    typeof window !== "undefined" ? window : undefined,
    typeof globalThis !== "undefined" ? globalThis.self : undefined
  ];
  for (const scope of globalScopes) {
    if (scope?.Ammo) {
      return scope.Ammo;
    }
  }
  return undefined;
}

function waitForAmmoGlobalRetry(attempt) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, attempt === 0 ? 0 : 16);
  });
}

async function initAmmoNamespaceSafely() {
  try {
    return await initAmmoNamespace();
  } catch (error) {
    reportAmmoInitializationFailure("initAmmoNamespace", error);
    return undefined;
  }
}

function createDisabledPhysicsBackend(reason) {
  return createDisabledMmdPhysicsBackend({ reason });
}

function reportAmmoInitializationFailure(phase, error) {
  const details = createAmmoInitializationErrorDetails(phase, error);
  window.console?.error("[viewer] Ammo initialization failed", details);
  showPhysicsUnavailableMessage(createPhysicsUnavailableMessage(details));
}

function createAmmoInitializationErrorDetails(phase, error) {
  const errorName = error instanceof Error && error.name ? error.name : "Error";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const details = {
    phase,
    errorName,
    errorMessage
  };
  if (error instanceof Error && error.stack) {
    details.stack = error.stack;
  }
  return details;
}

function createPhysicsUnavailableMessage(details) {
  if (isAmmoMemoryAllocationFailure(details)) {
    return "Physics unavailable: Ammo could not allocate memory. Free a tab and reload to enable physics.";
  }
  return `Physics unavailable: ${details.errorName}: ${details.errorMessage}`;
}

function isAmmoMemoryAllocationFailure(details) {
  return details.errorName === "RangeError" && /allocation/i.test(details.errorMessage);
}

function showPhysicsUnavailableMessage(message) {
  setStatus(message, "error");
  if (physicsErrorBanner) {
    physicsErrorBanner.textContent = message;
    physicsErrorBanner.hidden = false;
  }
}
