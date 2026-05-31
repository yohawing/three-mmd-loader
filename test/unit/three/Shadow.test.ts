import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyMmdSelfShadowStateToThreeDirectionalLight,
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox,
  MMD_SELF_SHADOW_LAYER
} from "../../../src/three/index.js";

describe("applyMmdSelfShadowStateToThreeDirectionalLight", () => {
  it("disables directional shadow casting for mode 0", () => {
    const light = new THREE.DirectionalLight();
    light.castShadow = true;

    applyMmdSelfShadowStateToThreeDirectionalLight(light, { mode: 0, distance: 0.4 });

    expect(light.castShadow).toBe(false);
  });

  it("enables directional shadow casting and clamps far distance for enabled modes", () => {
    const light = new THREE.DirectionalLight();

    applyMmdSelfShadowStateToThreeDirectionalLight(light, { mode: 1, distance: 0.4 }, {
      distanceScale: 100,
      minFar: 1,
      maxFar: 20
    });

    expect(light.castShadow).toBe(true);
    expect(light.shadow.camera.far).toBe(20);
    expect(light.shadow.intensity).toBeCloseTo(1);
  });

  it("allows callers to tune shadow intensity for toon self-shadow blending", () => {
    const light = new THREE.DirectionalLight();

    applyMmdSelfShadowStateToThreeDirectionalLight(light, { mode: 1, distance: 0.4 }, {
      shadowIntensity: 0.4
    });

    expect(light.shadow.intensity).toBeCloseTo(0.4);
  });

  it("configures directional self-shadow quality without replacing the light", () => {
    const light = new THREE.DirectionalLight();

    const result = configureMmdSelfShadowDirectionalLight(light, {
      mapSize: 4096,
      bias: -0.00035,
      normalBias: 0.006,
      shadowIntensity: 0.75,
      cameraLeft: -1.2,
      cameraRight: 1.3,
      cameraTop: 1.4,
      cameraBottom: -1.5,
      cameraNear: 0.02,
      cameraFar: 12
    });

    expect(result).toBe(light);
    expect(light.shadow.mapSize.x).toBe(4096);
    expect(light.shadow.mapSize.y).toBe(4096);
    expect(light.shadow.bias).toBeCloseTo(-0.00035);
    expect(light.shadow.normalBias).toBeCloseTo(0.006);
    expect(light.shadow.intensity).toBeCloseTo(0.75);
    expect(light.shadow.camera.layers.mask).toBe(1 << MMD_SELF_SHADOW_LAYER);
    expect(light.shadow.camera.left).toBeCloseTo(-1.2);
    expect(light.shadow.camera.right).toBeCloseTo(1.3);
    expect(light.shadow.camera.top).toBeCloseTo(1.4);
    expect(light.shadow.camera.bottom).toBeCloseTo(-1.5);
    expect(light.shadow.camera.near).toBeCloseTo(0.02);
    expect(light.shadow.camera.far).toBeCloseTo(12);
  });

  it("fits the directional shadow camera to a world-space bounding box in light space", () => {
    const light = new THREE.DirectionalLight();
    light.position.set(0, 0, 10);
    light.target.position.set(0, 0, 0);

    fitMmdSelfShadowDirectionalLightToBox(
      light,
      new THREE.Box3(new THREE.Vector3(-1, -2, -0.5), new THREE.Vector3(3, 4, 0.5)),
      {
        margin: 0.25,
        depthMargin: 0.5,
        minNear: 0.01,
        minFarSpan: 1,
        updateTarget: false
      }
    );

    expect(light.target.position.toArray()).toEqual([0, 0, 0]);
    expect(light.shadow.camera.left).toBeCloseTo(-1.25);
    expect(light.shadow.camera.right).toBeCloseTo(3.25);
    expect(light.shadow.camera.bottom).toBeCloseTo(-2.25);
    expect(light.shadow.camera.top).toBeCloseTo(4.25);
    expect(light.shadow.camera.near).toBeCloseTo(9.0);
    expect(light.shadow.camera.far).toBeCloseTo(11.0);
  });

  it("preserves directional light orientation while fitting around a translated model", () => {
    const light = new THREE.DirectionalLight();
    light.position.set(3, 4, 5);
    light.target.position.set(0, 1, 0);
    const originalDirection = new THREE.Vector3()
      .subVectors(light.position, light.target.position)
      .normalize();

    fitMmdSelfShadowDirectionalLightToBox(
      light,
      new THREE.Box3(new THREE.Vector3(9, 1, -8), new THREE.Vector3(11, 3, -6))
    );

    const fittedDirection = new THREE.Vector3()
      .subVectors(light.position, light.target.position)
      .normalize();
    expect(light.target.position.toArray()).toEqual([10, 2, -7]);
    expect(fittedDirection.x).toBeCloseTo(originalDirection.x);
    expect(fittedDirection.y).toBeCloseTo(originalDirection.y);
    expect(fittedDirection.z).toBeCloseTo(originalDirection.z);
  });
});
