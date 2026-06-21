import * as THREE from "three";

import type { LightState } from "../parser/model/modelTypes.js";

export interface ApplyMmdLightStateOptions {
  readonly target?: THREE.Vector3;
  readonly directionScratch?: THREE.Vector3;
  readonly distance?: number;
  readonly colorScale?: number;
}

const defaultLightTargetScratch = new THREE.Vector3();
const defaultLightDirectionScratch = new THREE.Vector3();

export function applyMmdLightStateToThreeDirectionalLight(
  light: THREE.DirectionalLight,
  state: LightState | undefined,
  options: ApplyMmdLightStateOptions = {}
): THREE.DirectionalLight {
  if (!state) {
    return light;
  }
  const colorScale = options.colorScale ?? 1;
  light.color.setRGB(
    state.color[0] * colorScale,
    state.color[1] * colorScale,
    state.color[2] * colorScale
  );
  const direction = options.directionScratch ?? defaultLightDirectionScratch;
  direction.set(-state.direction[0], -state.direction[1], state.direction[2]);
  if (direction.lengthSq() > 0) {
    direction.normalize();
    const target = options.target ?? defaultLightTargetScratch.set(0, 0, 0);
    light.target.position.copy(target);
    light.position.copy(target).addScaledVector(direction, options.distance ?? 5);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  }
  return light;
}
