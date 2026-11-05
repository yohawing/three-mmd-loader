import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getMmdShadowProjection } from "../../../src/three/mmd-shadow-projection.js";

// Literal matrix-operation oracle from MikuDanceStudio 0e969951,
// model_renderers.cpp:1543-1620. Deliberately does not use the expanded matrix.
function reference(camera: THREE.Camera, raw: THREE.Vector3, mode: number, base: number) {
  const flip = new THREE.Matrix4().makeScale(1, 1, -1);
  const frame = new THREE.Matrix4().multiplyMatrices(flip, camera.matrixWorldInverse);
  const direction = new THREE.Vector3(raw.x, raw.y, -raw.z).applyMatrix3(new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse));
  direction.z *= -1;
  // Nonzero eye verifies cancellation of MMD's separate frame/view translation.
  const target = new THREE.Vector3(3, -4, -9);
  frame.premultiply(new THREE.Matrix4().makeTranslation(...target.toArray()));
  const eye = target.clone().addScaledVector(direction, -50);
  const z = target.clone().sub(eye).normalize();
  const x = new THREE.Vector3(0, 0, 1).cross(z).normalize();
  const y = z.clone().cross(x);
  const view = new THREE.Matrix4().set(x.x,x.y,x.z,-x.dot(eye), y.x,y.y,y.z,-y.dot(eye), z.x,z.y,z.z,-z.dot(eye), 0,0,0,1);
  const slope = -direction.clone().normalize().z;
  const a = Math.abs(slope);
  let scale: number, positive: number, negative: number;
  if (a > 0.9) { scale = base; positive = 1-a; negative = a-1; }
  else if (a > 0.8) {
    scale = base * (mode === 1 ? 10-10*a : 19-20*a);
    positive = mode === 1 ? 3.7-4*a : 8.2-9*a;
    negative = 9*a-8.2;
  } else { scale = base*(mode === 1 ? 2 : 3); positive = mode === 1 ? 0.5 : 1; negative = -1; }
  const result = frame.premultiply(view);
  result.premultiply(new THREE.Matrix4().makeScale(scale,scale,base*0.15));
  result.premultiply(new THREE.Matrix4().makeScale(1,1,2));
  result.premultiply(new THREE.Matrix4().makeTranslation(0,0,-1));
  result.premultiply(new THREE.Matrix4().set(1,0,0,0, 0,1,0,negative, 0,0,1,0, 0,positive,0,1));
  result.premultiply(new THREE.Matrix4().makeTranslation(0,0,1));
  return result.premultiply(new THREE.Matrix4().makeScale(1,1,0.5));
}

describe("MMD projective self shadow", () => {
  it("keeps stable projection independent of view movement, but follows the model and light", () => {
    const light=new THREE.DirectionalLight();
    const p=getMmdShadowProjection(light);
    p.projectionMode="stable";
    p.bounds.set(new THREE.Vector3(-5,0,-2),new THREE.Vector3(5,22,2));
    const camera=new THREE.PerspectiveCamera();
    p.update(camera);
    const expected=p.sampleMatrix.clone();
    for(const sampling of [0,1,2,3]) for(const mode of [1,2]) {
      camera.position.set(50,-8,22);camera.rotation.set(0.2,1.5,0.8);
      p.sampling.value=sampling;p.update(camera,mode,0.025);
      expect(p.sampleMatrix.elements).toEqual(expected.elements);
    }
    p.bounds.translate(new THREE.Vector3(2,0,0));p.update(camera);
    expect(p.sampleMatrix.elements).not.toEqual(expected.elements);
    const moved=p.sampleMatrix.clone();p.direction.set(1,-1,0.5);p.update(camera);
    expect(p.sampleMatrix.elements).not.toEqual(moved.elements);
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
    projection.update(new THREE.PerspectiveCamera(), 2, 0.02);
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
  it("matches literal reference operations across camera angles, modes, distances and light magnitudes", () => {
    const light = new THREE.DirectionalLight();
    const projection = getMmdShadowProjection(light);
    const camera = new THREE.PerspectiveCamera();
    for (const yaw of [-2, -0.8, 0, 1.1]) for (const pitch of [-0.7, 0, 0.9]) {
      camera.position.set(3, 18, 9);
      camera.rotation.set(pitch, yaw, 0.2);
      camera.updateMatrixWorld(true);
      for (const mode of [1,2]) for (const distance of [0.003,0.01125,0.04]) for (const magnitude of [0.5,1,3]) {
        projection.direction.set(-0.5,-1,0.5).multiplyScalar(magnitude);
        projection.update(camera,mode,distance);
        const expected = reference(camera,projection.direction,mode,distance);
        projection.matrix.elements.forEach((value,i) => expect(value).toBeCloseTo(expected.elements[i],10));
      }
    }
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
      projection.update(camera,2,0.01125);
      expected ??= projection.sampleMatrix.clone();
      expect(projection.sampleMatrix.elements).toEqual(expected.elements);
      const point = new THREE.Vector4(0,18,0,1);
      const raw = point.clone().applyMatrix4(projection.matrix);
      const raster = point.applyMatrix4(light.shadow.camera.projectionMatrix);
      const depth = coordinateSystem === THREE.WebGLCoordinateSystem ? (raster.z/raster.w+1)/2 : raster.z/raster.w;
      expect(reversed ? 1-depth : depth).toBeCloseTo(raw.z/raw.w,12);
    }
  });
  it("matches both sides of every light-angle branch and stays finite at the poles", () => {
    const projection = getMmdShadowProjection(new THREE.DirectionalLight());
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld(true);
    for (const boundary of [-0.9,-0.8,0.8,0.9]) for (const offset of [-1e-8,0,1e-8]) {
      const slope = boundary + offset;
      projection.direction.set(Math.sqrt(1-slope*slope), 0, -slope);
      for (const mode of [1,2]) {
        projection.update(camera,mode,0.01125);
        const expected=reference(camera,projection.direction,mode,0.01125);
        projection.matrix.elements.forEach((v,i)=>expect(v).toBeCloseTo(expected.elements[i],10));
      }
    }
    for (const z of [-1,1]) {
      projection.direction.set(0,0,z);
      projection.update(camera);
      expect(projection.matrix.elements.every(Number.isFinite)).toBe(true);
    }
  });
});
