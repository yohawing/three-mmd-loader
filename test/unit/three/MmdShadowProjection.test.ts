import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getMmdShadowProjection } from "../../../src/three/mmd-shadow-projection.js";

describe("Stable MMD self shadow", () => {
  it("fits bounds and light independently of shadow shading mode", () => {
    const light=new THREE.DirectionalLight();
    const p=getMmdShadowProjection(light);
    p.bounds.set(new THREE.Vector3(-5,0,-2),new THREE.Vector3(5,22,2));
    p.update();
    const expected=p.sampleMatrix.clone();
    for (const x of [-5,5]) for (const y of [0,22]) for (const z of [-2,2]) {
      const point = new THREE.Vector3(x,y,z).applyMatrix4(p.sampleMatrix);
      for (const value of point.toArray()) expect(value).toBeGreaterThanOrEqual(0);
      for (const value of point.toArray()) expect(value).toBeLessThanOrEqual(1);
    }
    for(const mode of [1,2]) {
      p.update(mode);
      expect(p.sampleMatrix.elements).toEqual(expected.elements);
    }
    p.bounds.translate(new THREE.Vector3(2,0,0));p.update();
    expect(p.sampleMatrix.elements).not.toEqual(expected.elements);
    const moved=p.sampleMatrix.clone();p.direction.set(1,-1,0.5);p.update();
    expect(p.sampleMatrix.elements).not.toEqual(moved.elements);
  });
  it("preserves a caller-configured light volume without Viewer bounds", () => {
    const light = new THREE.DirectionalLight();
    light.position.set(12,25,8);light.target.position.set(0,10,0);
    Object.assign(light.shadow.camera, {left:-30,right:30,top:40,bottom:-40,near:1,far:100});
    light.updateMatrixWorld();light.target.updateMatrixWorld();light.shadow.camera.updateProjectionMatrix();
    light.shadow.updateMatrices(light);
    const expected = light.shadow.matrix.clone();
    const p = getMmdShadowProjection(light);p.update();
    const point = new THREE.Vector3(3,12,2);
    const original = point.clone().applyMatrix4(expected);
    const actual = point.clone().applyMatrix4(p.sampleMatrix);
    expect(actual.x).toBeCloseTo(original.x,12);
    expect(actual.y).toBeCloseTo(1-original.y,12);
    expect(actual.z).toBeCloseTo(original.z,12);
  });
  it("restores the light camera after the last dedicated pass releases it", () => {
    const light = new THREE.DirectionalLight();
    light.shadow.camera.position.set(4, 5, 6);
    light.shadow.camera.updateMatrixWorld(true);
    const camera = light.shadow.camera.clone();
    const originalUpdate = light.shadow.updateMatrices;
    const originalProjectionUpdate = light.shadow.camera.updateProjectionMatrix;
    const projection = getMmdShadowProjection(light);
    projection.retain(); projection.retain();
    projection.update(2);
    projection.release();
    expect(light.userData.mmdShadowProjection).toBe(projection);
    (light.shadow.camera as unknown as { _reversedDepth: boolean })._reversedDepth = true;
    projection.release();
    expect(light.shadow.camera.reversedDepth).toBe(false);
    expect(light.userData.mmdShadowProjection).toBeUndefined();
    expect(light.shadow.updateMatrices).toBe(originalUpdate);
    expect(light.shadow.camera.updateProjectionMatrix).toBe(originalProjectionUpdate);
    expect(light.shadow.camera.matrixAutoUpdate).toBe(camera.matrixAutoUpdate);
    expect(light.shadow.camera.matrixWorldAutoUpdate).toBe(camera.matrixWorldAutoUpdate);
    expect(light.shadow.camera.matrixWorld.elements).toEqual(camera.matrixWorld.elements);
    expect(light.shadow.camera.projectionMatrix.elements).toEqual(camera.projectionMatrix.elements);
  });
  it("keeps receiver z/w invariant across OpenGL, WebGPU and reversed raster depth", () => {
    const light = new THREE.DirectionalLight();
    const projection = getMmdShadowProjection(light);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0,18,9); camera.updateMatrixWorld(true);
    let expected: THREE.Matrix4 | undefined;
    for (const coordinateSystem of [THREE.WebGLCoordinateSystem, THREE.WebGPUCoordinateSystem]) for (const reversed of [false,true]) {
      light.shadow.camera.coordinateSystem = coordinateSystem;
      (light.shadow.camera as unknown as { _reversedDepth: boolean })._reversedDepth = reversed;
      projection.update(2);
      expected ??= projection.sampleMatrix.clone();
      expect(projection.sampleMatrix.elements).toEqual(expected.elements);
      const point = new THREE.Vector4(0,18,0,1);
      const raw = point.clone().applyMatrix4(projection.matrix);
      const raster = point.applyMatrix4(light.shadow.camera.projectionMatrix);
      const depth = coordinateSystem === THREE.WebGLCoordinateSystem ? (raster.z/raster.w+1)/2 : raster.z/raster.w;
      expect(reversed ? 1-depth : depth).toBeCloseTo(raw.z/raw.w,12);
    }
  });
});
