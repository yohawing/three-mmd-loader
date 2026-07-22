import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox
} from "../../../dist/three/index.js";

import { dom, updateChromeHeights } from "./dom.js";
import { persistViewportSettings, state } from "./state.js";
import { updateViewerPipelineStatus } from "./viewer-pipeline.js";

const viewerBaselineSelfShadowQuality = {
  mapSize: 4096,
  shadowIntensity: 1.0,
  bias: -0.00035,
  normalBias: 0.006
};
const viewerTslSelfShadowQuality = {
  ...viewerBaselineSelfShadowQuality,
  mapSize: 2048
};
const viewerTslShadowBoundsRefreshFrames = 6;
// Unity's 0.02 m default is roughly 1% of a two-meter character. The three.js
// loader keeps PMX coordinates unscaled, so retain that ratio across model scales.
const viewerTslSelfShadowWorldDepthBiasScale = 0.01;
let viewerTslSelfShadowWorldDepthBias = 0;

// Supersampling (SSAA): render at a higher internal resolution then downsample.
// MSAA (antialias: true) alone leaves the hard inverted-hull edge aliased on fine
// MMD geometry (hair/fingers), so the black outline looks thin/broken vs real MMD's
// smooth anti-aliased line. SSAA renders the edge at sub-pixel detail so the
// downsample reproduces MMD's soft continuous edge. Cost scales with the square of
// this factor; the cap bounds the drawing buffer on hi-DPI displays. Tunable.
const viewerBaselineSupersample = 2;
const viewerTslSupersample = 1;
const viewerMaxPixelRatio = 3;
// Keep the near plane fixed and very close.  Stage PMX files frequently extend
// underneath a camera VMD, so deriving near from their world bounds clips the
// floor at close camera cuts.
const viewerDefaultCameraNear = 0.001;
const viewerDefaultCameraFar = 2000;
// TSL's WebGL backend has a few depth-only helper passes that do not share the
// color material's logarithmic-depth write. Preserve log depth for the color
// pass, but also cap this backend's perspective depth ratio so those passes
// cannot Z-fight when a background expands camera.far.
const viewerForceWebglCameraDepthRangeMaxRatio = 20000;

function viewerPerspectiveCameraNearForFar(far) {
  if (state.viewerPipeline !== "tsl-forcewebgl") {
    return viewerDefaultCameraNear;
  }
  return Math.max(viewerDefaultCameraNear, far / viewerForceWebglCameraDepthRangeMaxRatio);
}

export async function setupScene() {
  if (!(dom.canvas instanceof HTMLCanvasElement)) throw new Error("Viewer canvas is missing");
  state.rendererStatus = "initializing";
  updateViewerPipelineStatus();
  if (state.viewerPipeline === "baseline-webgl") {
    state.renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas: dom.canvas,
      logarithmicDepthBuffer: true
    });
  } else {
    const { WebGPURenderer } = await import("three/webgpu");
    state.renderer = new WebGPURenderer({
      antialias: true,
      canvas: dom.canvas,
      forceWebGL: state.viewerPipeline === "tsl-forcewebgl",
      // The TSL WebGL fallback has regular forward depth, unlike native
      // WebGPU's reversed-Z path. Keep logarithmic depth enabled here just as
      // in the baseline WebGL renderer so a close near plane and large stage
      // bounds do not exhaust the depth buffer.
      logarithmicDepthBuffer: state.viewerPipeline === "tsl-forcewebgl",
      // Reversed-Z only makes sense on the native WebGPU backend (T070-18).
      // TSL forceWebGL still renders through WebGL's non-reversed [0,1]/[-1,1]
      // depth convention, so leave it (and baseline WebGL above) unchanged.
      reversedDepthBuffer: state.viewerPipeline === "tsl-webgpu"
    });
  }
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.NoToneMapping;
  const viewerSupersample = state.viewerPipeline === "baseline-webgl"
    ? viewerBaselineSupersample
    : viewerTslSupersample;
  state.renderer.setPixelRatio(
    Math.min(Math.min(window.devicePixelRatio, 2) * viewerSupersample, viewerMaxPixelRatio)
  );
  state.renderer.setClearColor(0xffffff, 1);
  state.renderer.shadowMap.enabled = state.debugSelfShadowEnabled;
  state.renderer.shadowMap.type = THREE.BasicShadowMap;
  if (state.viewerPipeline !== "baseline-webgl") {
    // The TSL viewer uses a depth-only shadow proxy. Avoid the color attachment
    // required by transmitted/colored shadows; toon tint remains receiver-side.
    state.renderer.shadowMap.transmitted = false;
  }
  if (typeof state.renderer.init === "function") {
    await state.renderer.init();
  }
  state.rendererStatus = "ready";
  updateViewerPipelineStatus();
  state.scene = new THREE.Scene();
  state.perspectiveCamera = new THREE.PerspectiveCamera(
    22,
    1,
    viewerPerspectiveCameraNearForFar(viewerDefaultCameraFar),
    viewerDefaultCameraFar
  );
  state.orthographicCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    viewerDefaultCameraNear,
    viewerDefaultCameraFar
  );
  state.camera = state.perspectiveCamera;
  state.camera.position.set(0, 1.1, 9);
  state.controls = new OrbitControls(state.camera, dom.canvas);
  state.controls.enableDamping = true;
  state.controls.target.set(0, 0.9, 0);
  state.gridHelper = new THREE.GridHelper(40, 40, 0x888888, 0xcccccc);
  state.gridHelper.visible = state.viewportGridVisible;
  state.scene.add(state.gridHelper);
  state.axesHelper = new THREE.AxesHelper(10);
  state.axesHelper.visible = state.viewportAxesVisible;
  state.scene.add(state.axesHelper);
  state.keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  state.keyLight.position.set(3, 4, 5);
  state.keyLight.castShadow = state.debugSelfShadowEnabled;
  configureMmdSelfShadowDirectionalLight(
    state.keyLight,
    state.viewerPipeline === "baseline-webgl"
      ? viewerBaselineSelfShadowQuality
      : viewerTslSelfShadowQuality
  );
  state.keyLight.target.position.set(0, 0.9, 0);
  state.scene.add(state.keyLight.target);
  state.scene.add(state.keyLight);
  state.scene.add(new THREE.AmbientLight(0xffffff, 0.15));
}

export function setViewportGridVisible(visible) {
  state.viewportGridVisible = !!visible;
  if (state.gridHelper) {
    state.gridHelper.visible = state.viewportGridVisible;
  }
  persistViewportSettings();
  state.renderer?.render(state.scene, state.camera);
  return state.viewportGridVisible;
}

export function setViewportAxesVisible(visible) {
  state.viewportAxesVisible = !!visible;
  if (state.axesHelper) {
    state.axesHelper.visible = state.viewportAxesVisible;
  }
  persistViewportSettings();
  state.renderer?.render(state.scene, state.camera);
  return state.viewportAxesVisible;
}

export function fitCameraToObject(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    setDefaultCameraView();
    return;
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.75);
  state.controls.target.copy(sphere.center);
  state.camera = state.perspectiveCamera;
  state.controls.object = state.camera;
  state.perspectiveCamera.position.copy(sphere.center).add(new THREE.Vector3(0, radius * 0.15, radius * 5.2));
  const far = Math.max(radius * 80, 200);
  state.perspectiveCamera.near = viewerPerspectiveCameraNearForFar(far);
  state.perspectiveCamera.far = far;
  state.perspectiveCamera.updateProjectionMatrix();
  fitShadowCameraToObject(object);
  state.controls.update();
}

// Recomputes only camera.far from current scene content bounds (model +
// background bounding spheres + camera distance). Never touches
// position/target/fov. Near remains fixed on baseline/native WebGPU; the TSL
// WebGL fallback uses a bounded perspective ratio for its non-log depth-only
// passes.
const adaptCameraDepthRangeBoundsScratch = new THREE.Box3();
const adaptCameraDepthRangeSphereScratch = new THREE.Sphere();
const shadowBackgroundCornerScratch = new THREE.Vector3();

export function adaptCameraDepthRange() {
  const camera = state.camera;
  if (!camera || !state.controls) {
    return;
  }
  if (camera !== state.perspectiveCamera && camera !== state.orthographicCamera) {
    return;
  }
  const bounds = adaptCameraDepthRangeBoundsScratch.makeEmpty();
  if (state.currentModel?.mesh) {
    const modelBounds = new THREE.Box3().setFromObject(state.currentModel.mesh);
    if (!modelBounds.isEmpty()) {
      bounds.union(modelBounds);
    }
  }
  if (state.currentBackground?.mesh) {
    const backgroundBounds = new THREE.Box3().setFromObject(state.currentBackground.mesh);
    if (!backgroundBounds.isEmpty()) {
      bounds.union(backgroundBounds);
    }
  }
  if (bounds.isEmpty()) {
    return;
  }
  const sphere = bounds.getBoundingSphere(adaptCameraDepthRangeSphereScratch);
  const radius = Math.max(sphere.radius, 0.75);
  const distanceToCenter = camera.position.distanceTo(sphere.center);
  const distanceToFarthestBound = distanceToCenter + radius;
  const far = Math.max(radius * 80, distanceToFarthestBound * 2, 200);
  camera.near = camera.isPerspectiveCamera
    ? viewerPerspectiveCameraNearForFar(far)
    : viewerDefaultCameraNear;
  camera.far = far;
  camera.updateProjectionMatrix();
}

export function setDefaultCameraView() {
  state.controls.target.set(0, 0.9, 0);
  state.camera = state.perspectiveCamera;
  state.controls.object = state.camera;
  state.perspectiveCamera.position.set(0, 1.1, 9);
  state.perspectiveCamera.near = viewerPerspectiveCameraNearForFar(viewerDefaultCameraFar);
  state.perspectiveCamera.far = viewerDefaultCameraFar;
  state.perspectiveCamera.updateProjectionMatrix();
  state.selfShadowBoundsScratch.set(
    new THREE.Vector3(-0.6, 0, -0.6),
    new THREE.Vector3(0.6, 1.8, 0.6)
  );
  fitShadowCameraToBounds(state.selfShadowBoundsScratch);
  state.controls.update();
}

export function resize() {
  const width = dom.canvas.clientWidth;
  const height = dom.canvas.clientHeight;
  state.renderer.setSize(width, height, false);
  state.cameraAspect = width / Math.max(height, 1);
  state.perspectiveCamera.aspect = state.cameraAspect;
  state.perspectiveCamera.updateProjectionMatrix();
  state.orthographicCamera.updateProjectionMatrix();
  updateChromeHeights();
}

export function fitShadowCameraToObject(object) {
  if (!state.keyLight) {
    return;
  }
  updateSelfShadowBounds(object);
  if (state.selfShadowBoundsScratch.isEmpty()) {
    return;
  }
  state.selfShadowBoundsRefreshCountdown = shadowBoundsRefreshFrames() - 1;
  fitShadowCameraToBounds(state.selfShadowBoundsScratch);
}

export function updateShadowCameraForFrame(object) {
  if (!state.keyLight) {
    return;
  }
  if (state.selfShadowBoundsRefreshCountdown <= 0) {
    updateSelfShadowBounds(object);
    state.selfShadowBoundsRefreshCountdown = shadowBoundsRefreshFrames() - 1;
  } else {
    state.selfShadowBoundsRefreshCountdown -= 1;
  }
  if (!state.selfShadowBoundsScratch.isEmpty()) {
    fitShadowCameraToBounds(state.selfShadowBoundsScratch);
  }
}

export function updateSelfShadowDepthBias() {
  if (!state.keyLight || state.viewerPipeline !== "tsl-webgpu") {
    return;
  }
  const shadowCamera = state.keyLight.shadow.camera;
  const depthRange = shadowCamera.far - shadowCamera.near;
  state.keyLight.shadow.bias = depthRange > 0
    ? -viewerTslSelfShadowWorldDepthBias / depthRange
    : 0;
}

function shadowBoundsRefreshFrames() {
  return state.viewerPipeline === "baseline-webgl"
    ? 1
    : viewerTslShadowBoundsRefreshFrames;
}

function fitShadowCameraToBounds(bounds) {
  if (!state.keyLight) {
    return;
  }
  fitMmdSelfShadowDirectionalLightToBox(state.keyLight, bounds, {
    marginScale: 0.06,
    minNear: 0.02,
    minFarSpan: 2
  });
  extendShadowCameraFarToBackground();
  viewerTslSelfShadowWorldDepthBias = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z
  ) * viewerTslSelfShadowWorldDepthBiasScale;
  updateSelfShadowDepthBias();
  state.keyLight.target.updateMatrixWorld();
}

function updateSelfShadowBounds(object) {
  state.selfShadowBoundsScratch.setFromObject(object);
}

function extendShadowCameraFarToBackground() {
  const bounds = state.selfShadowBackgroundBoundsScratch;
  const shadowCamera = state.keyLight?.shadow?.camera;
  if (bounds.isEmpty() || !shadowCamera) {
    return;
  }
  shadowCamera.updateMatrixWorld(true);
  shadowCamera.matrixWorldInverse.copy(shadowCamera.matrixWorld).invert();
  let far = shadowCamera.far;
  far = Math.max(
    far,
    shadowDepthAt(bounds.min.x, bounds.min.y, bounds.min.z, shadowCamera),
    shadowDepthAt(bounds.min.x, bounds.min.y, bounds.max.z, shadowCamera),
    shadowDepthAt(bounds.min.x, bounds.max.y, bounds.min.z, shadowCamera),
    shadowDepthAt(bounds.min.x, bounds.max.y, bounds.max.z, shadowCamera),
    shadowDepthAt(bounds.max.x, bounds.min.y, bounds.min.z, shadowCamera),
    shadowDepthAt(bounds.max.x, bounds.min.y, bounds.max.z, shadowCamera),
    shadowDepthAt(bounds.max.x, bounds.max.y, bounds.min.z, shadowCamera),
    shadowDepthAt(bounds.max.x, bounds.max.y, bounds.max.z, shadowCamera)
  );
  if (far > shadowCamera.far) {
    shadowCamera.far = far;
    shadowCamera.updateProjectionMatrix();
  }
}

function shadowDepthAt(x, y, z, shadowCamera) {
  shadowBackgroundCornerScratch.set(x, y, z).applyMatrix4(shadowCamera.matrixWorldInverse);
  return -shadowBackgroundCornerScratch.z;
}
