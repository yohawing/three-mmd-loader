import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { characterFramingBounds, copyCharacterBounds } from "../../../examples/viewer/lib/character-framing.js";

function character(outlier: boolean) {
  const points = [];
  for (let i = 0; i < 300; i++) points.push(i % 3 - 1, i % 21, i % 5 - 2);
  if (outlier) points.push(0, -30000, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const count = points.length / 3;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.skeleton.update();
  return mesh;
}

describe("character camera framing", () => {
  it("excludes remote hidden vertices without modifying model geometry", () => {
    const mesh = character(true);
    mesh.position.set(5, 10, 0);
    const bounds = characterFramingBounds(mesh);
    expect(bounds.min.toArray()).toEqual([4, 10, -2]);
    expect(bounds.max.toArray()).toEqual([6, 30, 2]);
    expect(mesh.geometry.getAttribute("position").getY(300)).toBe(-30000);
    mesh.position.x = 15;
    mesh.updateMatrixWorld(true);
    const shadowBounds = new THREE.Box3();
    expect(copyCharacterBounds(mesh, shadowBounds)).toBe(shadowBounds);
    expect(shadowBounds.min.toArray()).toEqual([14, 10, -2]);
    expect(shadowBounds.max.toArray()).toEqual([16, 30, 2]);
  });
  it("preserves ordinary character bounds", () => {
    const mesh = character(false);
    expect(characterFramingBounds(mesh)).toEqual(new THREE.Box3().setFromObject(mesh));
  });
  it("retains shadow and framing bounds after GPU morph positions replace CPU positions", () => {
    const mesh = character(true);
    const expected = characterFramingBounds(mesh);
    mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(301 * 3), 3));
    expect(characterFramingBounds(mesh)).toEqual(expected);
    expect(copyCharacterBounds(mesh, new THREE.Box3())).toEqual(expected);
  });
  it("retains full bounds for static backgrounds", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100000, 2, 5));
    expect(characterFramingBounds(mesh)).toEqual(new THREE.Box3().setFromObject(mesh));
  });
});
