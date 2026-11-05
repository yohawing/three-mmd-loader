import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../examples/viewer/lib/dom.js", () => ({ dom: {}, updateChromeHeights() {} }));
vi.mock("../../../examples/viewer/lib/performance.js", () => ({ viewerPerformanceEnabled: false }));
vi.mock("../../../examples/viewer/lib/viewer-pipeline.js", () => ({ updateViewerPipelineStatus() {} }));
vi.mock("../../../examples/viewer/lib/state.js", () => ({ state: {}, persistViewportSettings() {} }));

import { state } from "../../../examples/viewer/lib/state.js";
import { adaptCameraDepthRange, fitCameraToObject, fitShadowCameraToObject, updateShadowCameraForFrame } from "../../../examples/viewer/lib/scene-setup.js";

describe("viewer camera depth range", () => {
  it.each([0, -30000])("uses full character bounds including a vertex at y=%s", (remoteY) => {
    const positions = [];
    for (let i = 0; i < 300; i++) positions.push(i % 3 - 1, i % 21, i % 5 - 2);
    positions.push(0, remoteY, 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(301 * 4), 4));
    const weights = new Float32Array(301 * 4);
    for (let i = 0; i < 301; i++) weights[i * 4] = 1;
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.skeleton.update();
    mesh.position.set(5, 10, 0);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 2000);
    camera.position.set(0, 18.7, 9);
    camera.lookAt(0, 18.7, 0);
    camera.updateMatrixWorld(true);
    const originalPosition = camera.position.clone();
    const originalRotation = camera.quaternion.clone();
    Object.assign(state, { camera, perspectiveCamera: camera, controls: { target: new THREE.Vector3(), update() {} }, keyLight: new THREE.DirectionalLight(), selfShadowBoundsScratch: new THREE.Box3(), selfShadowModelBoundsScratch: new THREE.Box3(), characterModels: [{ mesh }], currentBackground: undefined, currentCameraMotion: undefined });
    adaptCameraDepthRange();
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    expect(camera.far).toBeGreaterThanOrEqual(sphere.radius * 80);
    expect(camera.near).toBeCloseTo(sphere.radius / 100);
    expect(camera.position).toEqual(originalPosition);
    expect(camera.quaternion.equals(originalRotation)).toBe(true);
    fitCameraToObject(mesh);
    expect(state.controls.target).toEqual(sphere.center);
    expect(camera.position.distanceTo(sphere.center)).toBeCloseTo(sphere.radius * Math.hypot(0.15, 5.2));
    expect(state.selfShadowBoundsScratch).toEqual(bounds);
    expect(bounds.min.y).toBe(remoteY + 10);
    // Refreshing the ordinary mesh box must flow through camera and shadow fitting.
    bone.position.y = 7;
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    mesh.computeBoundingBox();
    const movedBounds = new THREE.Box3().setFromObject(mesh);
    fitShadowCameraToObject(mesh);
    expect(state.selfShadowBoundsScratch).toEqual(movedBounds);
    state.selfShadowBoundsRefreshCountdown = 0;
    updateShadowCameraForFrame(mesh);
    expect(state.selfShadowBoundsScratch).toEqual(movedBounds);
    fitCameraToObject(mesh);
    expect(state.controls.target.y).toBeCloseTo(sphere.center.y + 7);
    mesh.skeleton.dispose();
    geometry.dispose();
  });
});
