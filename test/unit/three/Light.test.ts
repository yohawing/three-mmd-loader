import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyMmdLightStateToThreeDirectionalLight } from "../../../src/three/index.js";

describe("applyMmdLightStateToThreeDirectionalLight", () => {
  it("applies VMD light color and direction to a directional light", () => {
    const light = new THREE.DirectionalLight();
    const target = new THREE.Vector3(1, 2, 3);
    const directionScratch = new THREE.Vector3();

    const result = applyMmdLightStateToThreeDirectionalLight(
      light,
      {
        color: [0.25, 0.5, 0.75],
        direction: [0, -1, -1]
      },
      {
        target,
        directionScratch,
        distance: 10
      }
    );

    expect(result).toBe(light);
    expect(light.color.r).toBeCloseTo(0.25);
    expect(light.color.g).toBeCloseTo(0.5);
    expect(light.color.b).toBeCloseTo(0.75);
    expect(light.target.position.toArray()).toEqual([1, 2, 3]);
    expect(light.position.x).toBeCloseTo(1);
    expect(light.position.y).toBeCloseTo(2 - Math.SQRT1_2 * 10);
    expect(light.position.z).toBeCloseTo(3 + Math.SQRT1_2 * 10);
  });

  it("scales color without moving the light for a zero direction", () => {
    const light = new THREE.DirectionalLight();
    light.position.set(3, 4, 5);

    applyMmdLightStateToThreeDirectionalLight(
      light,
      {
        color: [0.2, 0.3, 0.4],
        direction: [0, 0, 0]
      },
      {
        colorScale: 2
      }
    );

    expect(light.color.r).toBeCloseTo(0.4);
    expect(light.color.g).toBeCloseTo(0.6);
    expect(light.color.b).toBeCloseTo(0.8);
    expect(light.position.toArray()).toEqual([3, 4, 5]);
  });

  it("ignores missing light state", () => {
    const light = new THREE.DirectionalLight();
    light.position.set(3, 4, 5);

    expect(applyMmdLightStateToThreeDirectionalLight(light, undefined)).toBe(light);
    expect(light.position.toArray()).toEqual([3, 4, 5]);
  });
});
