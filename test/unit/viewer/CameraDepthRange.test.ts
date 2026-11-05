import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../examples/viewer/lib/dom.js", () => ({ dom: {}, updateChromeHeights() {} }));
vi.mock("../../../examples/viewer/lib/performance.js", () => ({ viewerPerformanceEnabled: false }));
vi.mock("../../../examples/viewer/lib/viewer-pipeline.js", () => ({ updateViewerPipelineStatus() {} }));
vi.mock("../../../examples/viewer/lib/state.js", () => ({ state: {}, persistViewportSettings() {} }));

import { state } from "../../../examples/viewer/lib/state.js";
import { characterFramingBounds } from "../../../examples/viewer/lib/character-framing.js";
import { adaptCameraDepthRange } from "../../../examples/viewer/lib/scene-setup.js";

describe("viewer camera depth range", () => {
  it("keeps a close-up visible after depth refitting a character with remote hidden vertices", () => {
    const positions = [];
    for (let i = 0; i < 300; i++) positions.push(i % 3 - 1, i % 21, i % 5 - 2);
    positions.push(0, -30000, 0);
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
    characterFramingBounds(mesh);
    const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 2000);
    camera.position.set(0, 18.7, 9);
    camera.lookAt(0, 18.7, 0);
    camera.updateMatrixWorld(true);
    const originalPosition = camera.position.clone();
    const originalRotation = camera.quaternion.clone();
    Object.assign(state, { camera, perspectiveCamera: camera, controls: {}, characterModels: [{ mesh }], currentBackground: undefined, currentCameraMotion: undefined });
    adaptCameraDepthRange();
    expect(camera.near).toBeLessThan(0.2);
    expect(camera.far).toBeLessThan(2000);
    expect(camera.position).toEqual(originalPosition);
    expect(camera.quaternion.equals(originalRotation)).toBe(true);
    const face = new THREE.Vector3(0, 18.7, 0).project(camera);
    expect(face.z).toBeGreaterThan(-1);
    expect(face.z).toBeLessThan(1);
    mesh.skeleton.dispose();
    geometry.dispose();
  });
});
