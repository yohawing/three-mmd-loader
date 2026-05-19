import * as THREE from "three";
import { OrbitControls } from "three/addons/state.controls/OrbitControls.js";

import { dom, updateChromeHeights } from "./dom.js";
import { state } from "./state.js";

export function setupScene() {
  if (!(dom.canvas instanceof HTMLCanvasElement)) throw new Error("Viewer canvas is missing");
  state.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: dom.canvas });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.setClearColor(0xffffff, 1);
  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(22, 1, 0.01, 1000);
  state.camera.position.set(0, 1.1, 9);
  state.controls = new OrbitControls(state.camera, dom.canvas);
  state.controls.enableDamping = true;
  state.controls.target.set(0, 0.9, 0);
  state.scene.add(new THREE.GridHelper(40, 40, 0x888888, 0xcccccc));
  state.scene.add(new THREE.AxesHelper(10));
  state.keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  state.keyLight.position.set(3, 4, 5);
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
  state.camera.position.copy(sphere.center).add(new THREE.Vector3(0, radius * 0.15, radius * 5.2));
  state.camera.near = Math.max(radius / 100, 0.01);
  state.camera.far = Math.max(radius * 40, 100);
  state.camera.updateProjectionMatrix();
  state.controls.update();
}

export function setDefaultCameraView() {
  state.controls.target.set(0, 0.9, 0);
  state.camera.position.set(0, 1.1, 9);
  state.camera.near = 0.01;
  state.camera.far = 1000;
  state.camera.updateProjectionMatrix();
  state.controls.update();
}

export function resize() {
  const width = dom.canvas.clientWidth;
  const height = dom.canvas.clientHeight;
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / Math.max(height, 1);
  state.camera.updateProjectionMatrix();
  updateChromeHeights();
}
