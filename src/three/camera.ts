import * as THREE from "three";

import type { CameraState } from "../parser/model/modelTypes.js";

export interface ApplyMmdCameraStateOptions {
  readonly target?: THREE.Vector3;
  readonly offset?: THREE.Vector3;
  readonly euler?: THREE.Euler;
  readonly quaternion?: THREE.Quaternion;
  readonly up?: THREE.Vector3;
  readonly minFov?: number;
  readonly minOrthographicHeight?: number;
  readonly aspect?: number;
  readonly orthographicCamera?: THREE.OrthographicCamera;
}

const defaultTargetScratch = new THREE.Vector3();
const defaultOffsetScratch = new THREE.Vector3();
const defaultEulerScratch = new THREE.Euler();
const defaultQuaternionScratch = new THREE.Quaternion();
const defaultUpScratch = new THREE.Vector3();

export function applyMmdCameraStateToThreeCamera(
  camera: THREE.PerspectiveCamera,
  state: CameraState,
  options?: ApplyMmdCameraStateOptions
): THREE.PerspectiveCamera | THREE.OrthographicCamera {
  const activeCamera =
    state.perspective || !options?.orthographicCamera ? camera : options.orthographicCamera;
  const target = options?.target ?? defaultTargetScratch;
  const offset = options?.offset ?? defaultOffsetScratch;
  const euler = options?.euler ?? defaultEulerScratch;
  const quaternion = options?.quaternion ?? defaultQuaternionScratch;
  const up = options?.up ?? defaultUpScratch;
  target.set(state.position[0], state.position[1], -state.position[2]);
  euler.set(-state.rotation[0], -state.rotation[1], state.rotation[2], "YXZ");
  quaternion.setFromEuler(euler).invert();
  offset.set(0, 0, -state.distance).applyQuaternion(quaternion);
  activeCamera.position.copy(target).add(offset);
  activeCamera.up.copy(up.set(0, 1, 0).applyQuaternion(quaternion));
  activeCamera.lookAt(target);
  activeCamera.userData.mmdCameraPerspective = state.perspective;
  if (activeCamera instanceof THREE.PerspectiveCamera) {
    activeCamera.fov = Math.max(state.fov, options?.minFov ?? 1);
  } else if (activeCamera instanceof THREE.OrthographicCamera) {
    const fov = Math.max(state.fov, options?.minFov ?? 1);
    const height = Math.max(
      2 * Math.abs(state.distance) * Math.tan(THREE.MathUtils.degToRad(fov) / 2),
      options?.minOrthographicHeight ?? 1e-3
    );
    const halfHeight = height / 2;
    const halfWidth = halfHeight * (options?.aspect ?? 1);
    activeCamera.left = -halfWidth;
    activeCamera.right = halfWidth;
    activeCamera.top = halfHeight;
    activeCamera.bottom = -halfHeight;
    activeCamera.near = camera.near;
    activeCamera.far = camera.far;
  }
  activeCamera.updateProjectionMatrix();
  return activeCamera;
}
