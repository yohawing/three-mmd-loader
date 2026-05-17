import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { ThreeMmdLoader } from "../../dist/three/index.js";

const sampleModelUrl = "../../test/fixtures/test_1bone_cube.pmx";
const sampleMotionUrl = "../../test/fixtures/test_1bone_cube_motion.vmd";

const canvas = document.querySelector("#viewer-canvas");
const stage = document.querySelector(".stage");
const topBar = document.querySelector(".top-bar");
const transportBar = document.querySelector(".transport");
const viewerShell = document.querySelector(".viewer-shell");
const statusText = document.querySelector("#status");
const modelNameText = document.querySelector("#model-name");
const motionNameText = document.querySelector("#motion-name");
const frameValueText = document.querySelector("#frame-value");
const boneCountText = document.querySelector("#bone-count");
const timeline = document.querySelector("#timeline");
const speedInput = document.querySelector("#speed");
const speedValueText = document.querySelector("#speed-value");
const playToggle = document.querySelector("#play-toggle");
const showGridInput = document.querySelector("#show-grid");
const showSkeletonInput = document.querySelector("#show-skeleton");
const wireframeInput = document.querySelector("#wireframe");
const loadMenu = document.querySelector("#load-menu");
const modelFileInput = document.querySelector("#model-file");
const modelFolderInput = document.querySelector("#model-folder");
const motionFileInput = document.querySelector("#motion-file");
const poseFileInput = document.querySelector("#pose-file");
const modelFileName = document.querySelector("#model-file-name");
const motionFileName = document.querySelector("#motion-file-name");
const poseFileName = document.querySelector("#pose-file-name");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Viewer canvas is missing");
}

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x171a1d, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 1000);
camera.position.set(0, 1.1, 9);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.9, 0);

const grid = new THREE.GridHelper(40, 40, 0x5d6a72, 0x30383d);
scene.add(grid);
const axes = new THREE.AxesHelper(4);
scene.add(axes);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
const fillLight = new THREE.HemisphereLight(0xeaf0f6, 0x2a2f33, 0.55);
scene.add(fillLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

const loader = new ThreeMmdLoader({ runtime: { frameRate: 30 } });
const clock = new THREE.Clock();
let currentModel;
let currentMotion;
let pendingMotionSource;
let pendingMotionLabel;
let skeletonHelper;
let elapsedSeconds = 0;
let isPlaying = false;
let isSeeking = false;

window.mmdViewer = {
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

bindControls();
resize();
await loadSampleScene();
clock.getDelta();
renderer.setAnimationLoop(render);

function bindControls() {
  window.addEventListener("resize", resize);
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
  document.querySelector("#load-sample-model")?.addEventListener("click", () => {
    void loadModelFromUrl(sampleModelUrl);
  });
  document.querySelector("#load-sample-motion")?.addEventListener("click", () => {
    void loadMotionFromUrl(sampleMotionUrl);
  });
  document.querySelector("#load-sample-scene")?.addEventListener("click", () => {
    void loadSampleScene();
  });
  document.querySelector("#choose-model")?.addEventListener("click", () => {
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
  modelFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      modelFileName.textContent = file.name;
      void loadModel(file);
    }
  });
  modelFolderInput?.addEventListener("change", (event) => {
    const files = event.target instanceof HTMLInputElement ? event.target.files : undefined;
    if (files && files.length > 0) {
      void loadModelFolder(Array.from(files));
    }
  });
  motionFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      motionFileName.textContent = file.name;
      void loadMotion(file);
    }
  });
  poseFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      poseFileName.textContent = file.name;
      void loadPose(file);
    }
  });
  playToggle?.addEventListener("click", () => {
    isPlaying = !isPlaying;
    playToggle.textContent = isPlaying ? "Pause" : "Play";
  });
  document.querySelector("#reset-view")?.addEventListener("click", resetView);
  timeline?.addEventListener("input", () => {
    isSeeking = true;
    elapsedSeconds = Number.parseFloat(timeline.value);
    evaluateRuntime();
  });
  timeline?.addEventListener("change", () => {
    isSeeking = false;
  });
  showGridInput?.addEventListener("change", () => {
    grid.visible = showGridInput.checked;
    axes.visible = showGridInput.checked;
  });
  showSkeletonInput?.addEventListener("change", () => {
    if (skeletonHelper) {
      skeletonHelper.visible = showSkeletonInput.checked;
    }
  });
  wireframeInput?.addEventListener("change", () => {
    setWireframe(wireframeInput.checked);
  });
  speedInput?.addEventListener("input", updateSpeedDisplay);
  bindDropTarget();
  updateSpeedDisplay();
  updatePlaybackDisplay();
  updateStageState();
}

async function loadSampleScene() {
  await loadModelFromUrl(sampleModelUrl);
  await loadMotionFromUrl(sampleMotionUrl);
  if (currentModel) {
    elapsedSeconds = 0;
    timeline.value = "0";
    updatePlaybackDisplay();
    setStatus(`Loaded model: ${sampleModelUrl.split("/").at(-1)}`, "ready");
  }
}

async function loadModelFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    modelFileName.textContent = url.split("/").at(-1) ?? url;
    await loadModel(bytes, url.split("/").at(-1) ?? url, createUrlTextureLoader(url));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function loadMotionFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    motionFileName.textContent = url.split("/").at(-1) ?? url;
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

async function loadModel(source, label = source.name ?? "model", modelLoader = loader) {
  try {
    setStatus(`Loading model: ${label}`, "loading");
    clearModel();
    currentModel = await modelLoader.loadModel(source);
    currentModel.mesh.frustumCulled = false;
    scene.add(currentModel.mesh);
    skeletonHelper = new THREE.SkeletonHelper(currentModel.mesh);
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.color.set(0x9bdcff);
    skeletonHelper.visible = showSkeletonInput?.checked ?? true;
    scene.add(skeletonHelper);
    modelNameText.textContent = currentModel.mesh.name || label;
    boneCountText.textContent = String(currentModel.mesh.skeleton.bones.length);
    elapsedSeconds = 0;
    timeline.max = "0.001";
    timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(currentModel.mesh);
    setWireframe(wireframeInput?.checked ?? false);
    if (pendingMotionSource) {
      await loadMotion(pendingMotionSource, pendingMotionLabel);
    } else if (currentMotion?.clip) {
      currentModel.runtime?.setAnimation(currentMotion.clip, currentModel.mesh);
    }
    setStatus(`Loaded model: ${label}`, "ready");
    updateStageState();
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  }
}

async function loadModelFolder(files) {
  const modelFile = findModelFile(files);
  if (!modelFile) {
    setStatus("No PMX or PMD model found in the selected folder.", "error");
    return;
  }

  const textureMap = createFolderTextureMap(files, modelFile);
  const folderLoader = new ThreeMmdLoader({
    runtime: { frameRate: 30 },
    textureMap
  });
  const folderName = modelFile.webkitRelativePath.split("/")[0] || "folder";
  modelFileName.textContent = `${folderName}/${modelFile.name}`;

  try {
    setStatus(`Loading model folder: ${folderName}`, "loading");
    clearModel();
    currentModel = await folderLoader.loadModel(modelFile);
    currentModel.mesh.frustumCulled = false;
    scene.add(currentModel.mesh);
    skeletonHelper = new THREE.SkeletonHelper(currentModel.mesh);
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.color.set(0x9bdcff);
    skeletonHelper.visible = showSkeletonInput?.checked ?? true;
    scene.add(skeletonHelper);
    modelNameText.textContent = currentModel.mesh.name || modelFile.name;
    boneCountText.textContent = String(currentModel.mesh.skeleton.bones.length);
    elapsedSeconds = 0;
    timeline.max = "0.001";
    timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(currentModel.mesh);
    setWireframe(wireframeInput?.checked ?? false);
    if (pendingMotionSource) {
      await loadMotion(pendingMotionSource, pendingMotionLabel);
    }
    setStatus(
      `Loaded model folder: ${folderName} (${Object.keys(textureMap).length} texture paths indexed)`,
      "ready"
    );
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
      motionNameText.textContent = label;
      setStatus(`Queued VMD motion: ${label}. Load a model to apply it.`, "ready");
      return;
    }
    setStatus(`Loading motion: ${label}`, "loading");
    pendingMotionSource = source;
    pendingMotionLabel = label;
    currentMotion = await loader.loadAnimation(source, currentModel);
    if (currentMotion.clip) {
      currentModel.runtime?.setAnimation(currentMotion.clip, currentModel.mesh);
      timeline.max = String(Math.max(currentMotion.clip.duration, 0.001));
      elapsedSeconds = 0;
      timeline.value = "0";
    }
    motionNameText.textContent = currentMotion.name || label;
    updatePlaybackDisplay();
    setStatus(`Loaded motion: ${label}`, "ready");
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
    const poseAnimation = await loader.loadPoseAnimation(source, label, currentModel);
    if (poseAnimation.clip) {
      currentMotion = poseAnimation;
      currentModel.runtime?.setAnimation(poseAnimation.clip, currentModel.mesh);
      elapsedSeconds = 0;
      timeline.max = "1";
      timeline.value = "0";
      motionNameText.textContent = poseAnimation.name ?? label;
    }
    updatePlaybackDisplay();
    setStatus(`Loaded pose: ${label}`, "ready");
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

function render() {
  const delta = clock.getDelta();
  if (isPlaying && !isSeeking) {
    elapsedSeconds += delta * Number.parseFloat(speedInput?.value ?? "1");
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

function evaluateRuntime() {
  if (!currentModel?.runtime) {
    return;
  }
  const maxTime = Number.parseFloat(timeline?.max ?? "10");
  if (elapsedSeconds > maxTime && maxTime > 0) {
    elapsedSeconds %= maxTime;
  }
  currentModel.runtime.evaluate(elapsedSeconds);
  if (skeletonHelper) {
    skeletonHelper.updateMatrixWorld(true);
  }
  timeline.value = String(elapsedSeconds);
  updatePlaybackDisplay();
}

function clearModel() {
  if (currentModel) {
    scene.remove(currentModel.mesh);
    currentModel.mesh.geometry.dispose();
    for (const material of normalizeMaterials(currentModel.mesh.material)) {
      material.dispose();
    }
  }
  if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper.dispose();
    skeletonHelper = undefined;
  }
  currentModel = undefined;
  currentMotion = undefined;
  modelNameText.textContent = "none";
  motionNameText.textContent = "none";
  boneCountText.textContent = "0";
  elapsedSeconds = 0;
  if (timeline) {
    timeline.max = "0.001";
    timeline.value = "0";
  }
  updatePlaybackDisplay();
  updateStageState();
}

function fitCameraToObject(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    resetView();
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

function resetView() {
  if (currentModel) {
    fitCameraToObject(currentModel.mesh);
    return;
  }
  controls.target.set(0, 0.9, 0);
  camera.position.set(0, 1.1, 9);
  camera.near = 0.01;
  camera.far = 1000;
  camera.updateProjectionMatrix();
  controls.update();
}

function setWireframe(enabled) {
  if (!currentModel) {
    return;
  }
  for (const material of normalizeMaterials(currentModel.mesh.material)) {
    material.wireframe = enabled;
  }
}

function normalizeMaterials(material) {
  return Array.isArray(material) ? material : [material];
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
    for (const file of event.dataTransfer?.files ?? []) {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd")) {
        modelFileName.textContent = file.name;
        void loadModel(file);
      } else if (lowerName.endsWith(".vmd")) {
        motionFileName.textContent = file.name;
        void loadMotion(file);
      } else if (lowerName.endsWith(".vpd")) {
        poseFileName.textContent = file.name;
        void loadPose(file);
      }
    }
  });
}

function setStatus(message, state = "ready") {
  statusText.textContent = message;
  statusText.classList.toggle("is-loading", state === "loading");
  topBar?.classList.toggle("is-error", state === "error");
}

function closeLoadMenu() {
  loadMenu?.removeAttribute("open");
}

function updatePlaybackDisplay() {
  const duration = currentMotion?.clip?.duration ?? 0;
  const currentTime = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  frameValueText.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

function updateSpeedDisplay() {
  const speed = Number.parseFloat(speedInput?.value ?? "1");
  speedValueText.textContent = `${(Number.isFinite(speed) ? speed : 1).toFixed(1)}x`;
}

function updateStageState() {
  stage?.classList.toggle("is-empty", !currentModel);
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
  return files.find((file) => {
    const lowerName = file.name.toLowerCase();
    return lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd");
  });
}

function createFolderTextureMap(files, modelFile) {
  const textureMap = {};
  const modelDirectory = directoryName(normalizeRelativePath(modelFile.webkitRelativePath));

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

function createUrlTextureLoader(modelUrl) {
  return new ThreeMmdLoader({
    runtime: { frameRate: 30 },
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
