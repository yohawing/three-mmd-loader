import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox
} from "../../../dist/three/index.js";

import { dom, updateChromeHeights } from "./dom.js";
import { state } from "./state.js";

const viewerSelfShadowQuality = {
  mapSize: 4096,
  shadowIntensity: 1.0,
  bias: -0.00035,
  normalBias: 0.006
};

export function setupScene() {
  if (!(dom.canvas instanceof HTMLCanvasElement)) throw new Error("Viewer canvas is missing");
  state.renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: dom.canvas,
    logarithmicDepthBuffer: true
  });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.setClearColor(0xffffff, 1);
  state.renderer.shadowMap.enabled = state.debugSelfShadowEnabled;
  state.renderer.shadowMap.type = THREE.PCFShadowMap;
  state.scene = new THREE.Scene();
  state.perspectiveCamera = new THREE.PerspectiveCamera(22, 1, 0.01, 1000);
  state.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  state.camera = state.perspectiveCamera;
  state.camera.position.set(0, 1.1, 9);
  state.controls = new OrbitControls(state.camera, dom.canvas);
  state.controls.enableDamping = true;
  state.controls.target.set(0, 0.9, 0);
  state.scene.add(new THREE.GridHelper(40, 40, 0x888888, 0xcccccc));
  state.scene.add(new THREE.AxesHelper(10));
  state.keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  state.keyLight.position.set(3, 4, 5);
  state.keyLight.castShadow = state.debugSelfShadowEnabled;
  configureMmdSelfShadowDirectionalLight(state.keyLight, viewerSelfShadowQuality);
  state.keyLight.target.position.set(0, 0.9, 0);
  state.scene.add(state.keyLight.target);
  state.scene.add(state.keyLight);
  state.scene.add(new THREE.AmbientLight(0xffffff, 0.15));
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
  state.perspectiveCamera.near = Math.max(radius / 100, 0.01);
  state.perspectiveCamera.far = Math.max(radius * 40, 100);
  state.perspectiveCamera.updateProjectionMatrix();
  fitShadowCameraToObject(object);
  state.controls.update();
}

export function setDefaultCameraView() {
  state.controls.target.set(0, 0.9, 0);
  state.camera = state.perspectiveCamera;
  state.controls.object = state.camera;
  state.perspectiveCamera.position.set(0, 1.1, 9);
  state.perspectiveCamera.near = 0.01;
  state.perspectiveCamera.far = 1000;
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
  state.selfShadowBoundsScratch.setFromObject(object);
  if (state.selfShadowBoundsScratch.isEmpty()) {
    return;
  }
  fitShadowCameraToBounds(state.selfShadowBoundsScratch);
}

function fitShadowCameraToBounds(bounds) {
  if (!state.keyLight) {
    return;
  }
  fitMmdSelfShadowDirectionalLightToBox(state.keyLight, bounds, {
    marginScale: 0.06,
    minNear: 0.02,
    minFarSpan: 2,
    maxFar: 80
  });
  state.keyLight.target.updateMatrixWorld();
}
