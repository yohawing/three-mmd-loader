import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyMmdCameraStateToThreeCamera } from "../../../src/three/index.js";
import type { CameraState } from "../../../src/parser/model/modelTypes.js";

describe("Three.js MMD camera helpers", () => {
  it("applies MMD camera state with the loader coordinate conversion", () => {
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const target = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3();

    applyMmdCameraStateToThreeCamera(camera, createCameraState(), {
      target,
      offset,
      euler,
      quaternion,
      up
    });

    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.y).toBeCloseTo(2);
    expect(camera.position.z).toBeCloseTo(42);
    expect(camera.fov).toBe(35);
    expect(camera.userData.mmdCameraPerspective).toBe(true);
    expect(target.toArray()).toEqual([1, 2, -3]);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });

  it("clamps the perspective camera fov to a positive minimum", () => {
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const activeCamera = applyMmdCameraStateToThreeCamera(camera, {
      ...createCameraState(),
      fov: 0,
      perspective: false
    });

    expect(activeCamera).toBe(camera);
    expect(camera.fov).toBe(1);
    expect(camera.userData.mmdCameraPerspective).toBe(false);
  });

  it("switches to an orthographic camera when provided for non-perspective frames", () => {
    const camera = new THREE.PerspectiveCamera(30, 2, 0.01, 1000);
    const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);

    const activeCamera = applyMmdCameraStateToThreeCamera(
      camera,
      {
        ...createCameraState(),
        distance: -10,
        fov: 60,
        perspective: false
      },
      {
        aspect: 2,
        orthographicCamera
      }
    );

    expect(activeCamera).toBe(orthographicCamera);
    expect(orthographicCamera.top).toBeCloseTo(5.7735027);
    expect(orthographicCamera.bottom).toBeCloseTo(-5.7735027);
    expect(orthographicCamera.right).toBeCloseTo(11.5470054);
    expect(orthographicCamera.left).toBeCloseTo(-11.5470054);
    expect(orthographicCamera.userData.mmdCameraPerspective).toBe(false);
  });

  it("preserves VMD camera roll after aiming at the target", () => {
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    applyMmdCameraStateToThreeCamera(camera, {
      ...createCameraState(),
      rotation: [0, 0, Math.PI / 4]
    });

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(up.x).toBeCloseTo(Math.SQRT1_2);
    expect(up.y).toBeCloseTo(Math.SQRT1_2);
    expect(up.z).toBeCloseTo(0);
  });

  it("applies MMD camera Y rotation without mirroring the orbit direction", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    applyMmdCameraStateToThreeCamera(camera, {
      ...createCameraState(),
      distance: -10,
      position: [0, 0, 0],
      rotation: [0, 0.5, 0]
    });

    expect(camera.position.x).toBeGreaterThan(0);
    expect(camera.position.x).toBeCloseTo(4.794255386);
    expect(camera.position.z).toBeCloseTo(8.775825619);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    expect(direction.x).toBeLessThan(0);
    expect(direction.x).toBeCloseTo(-0.479425539);
    expect(direction.z).toBeCloseTo(-0.877582562);
  });

  it("matches screen-space projection goldens for inverse MMD camera rotations", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    applyMmdCameraStateToThreeCamera(camera, {
      distance: -10,
      position: [1, 2, 3],
      rotation: [0.35, 0.45, 0.25],
      fov: 38,
      perspective: true
    });
    camera.updateMatrixWorld(true);

    expect(projectMmdPoint(camera, [0, 0, 0])).toMatchCloseVector([
      -0.821613359,
      -0.425233888,
      0.997160353
    ]);
    expect(projectMmdPoint(camera, [1, 0, 0])).toMatchCloseVector([
      -0.467049299,
      -0.345788556,
      0.997011946
    ]);
    expect(projectMmdPoint(camera, [0, 1, 0])).toMatchCloseVector([
      -0.807165836,
      -0.044689532,
      0.997317531
    ]);
    expect(projectMmdPoint(camera, [0, 0, 1])).toMatchCloseVector([
      -0.581605594,
      -0.506379023,
      0.997468887
    ]);
  });
});

function createCameraState(): CameraState {
  return {
    distance: -45,
    position: [1, 2, 3],
    rotation: [0, 0, 0],
    fov: 35,
    perspective: true
  };
}

function projectMmdPoint(
  camera: THREE.Camera,
  point: readonly [number, number, number]
): readonly number[] {
  const projected = new THREE.Vector3(point[0], point[1], -point[2]).project(camera);
  return [projected.x, projected.y, projected.z];
}

expect.extend({
  toMatchCloseVector(actual: readonly number[], expected: readonly number[]) {
    const epsilon = 1e-6;
    const pass =
      actual.length === expected.length &&
      actual.every((value, index) => Math.abs(value - (expected[index] ?? Number.NaN)) <= epsilon);
    return {
      pass,
      message: () =>
        `expected ${JSON.stringify(actual)} to match ${JSON.stringify(expected)} within ${epsilon}`
    };
  }
});

declare module "vitest" {
  interface Assertion<T = unknown> {
    toMatchCloseVector(expected: readonly number[]): T;
  }
}
