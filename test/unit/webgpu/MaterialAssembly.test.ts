import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";

import {
  replaceMmdModelMaterialsWithTsl
} from "../../../src/webgpu/material-assembly.js";

describe("TSL material assembly", () => {
  it("copies specular metadata into TSL material uniforms", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);
    const mesh = new THREE.Mesh(geometry, createSourceMaterial({
      edgeSize: 0,
      specular: [0.25, 0.5, 0.75],
      specularPower: 8
    }));

    replaceMmdModelMaterialsWithTsl(mesh);

    const [nodeMaterial] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const uniforms = nodeMaterial?.userData.mmdTslMaterialUniforms;
    expect(uniforms?.specular.toArray()).toEqual([0.25, 0.5, 0.75]);
    expect(uniforms?.specularPower.value).toBe(8);
  });

  it("connects diffuse texture alpha to the TSL opacity node", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);
    const material = createSourceMaterial({ edgeSize: 0 });
    material.map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 128]), 1, 1, THREE.RGBAFormat);
    material.alphaTest = 0.5 / 255;
    const mesh = new THREE.Mesh(geometry, material);

    replaceMmdModelMaterialsWithTsl(mesh);

    const [nodeMaterial] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    expect(nodeMaterial?.opacityNode).toBeDefined();
    expect(nodeMaterial?.alphaTest).toBeCloseTo(0.5 / 255);
  });

  it("appends outline groups after PMX body material groups on one mesh", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3)
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
    );
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new THREE.Mesh(geometry, [
      createSourceMaterial({ edgeSize: 0.4, edgeColor: [0, 0, 0, 1] }),
      createSourceMaterial({ edgeSize: 0.7, edgeColor: [0.1, 0.2, 0.3, 0.8] })
    ]);

    replaceMmdModelMaterialsWithTsl(mesh, { appendOutlineGroups: true });

    expect(mesh.geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
      { start: 0, count: 3, materialIndex: 2 },
      { start: 3, count: 3, materialIndex: 3 }
    ]);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    expect(materials).toHaveLength(4);
    expect(materials[2]?.userData.mmdTslOutlineMaterial).toMatchObject({
      sourceEdgeSize: 0.4,
      shaderApplied: true
    });
    expect(materials[2]?.vertexNode).toBeDefined();
    expect(materials[2]?.positionNode ?? null).toBeNull();
    expect(materials[3]?.userData.mmdTslOutlineMaterial).toMatchObject({
      sourceEdgeSize: 0.7,
      shaderApplied: true
    });
  });

  it("can force fallback outline groups for edge-less PoC fixtures", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);
    const mesh = new THREE.Mesh(geometry, createSourceMaterial({
      edgeSize: 0,
      edge: false,
      edgeColor: [0, 0, 0, 0]
    }));

    replaceMmdModelMaterialsWithTsl(mesh, {
      appendOutlineGroups: true,
      forceOutlineGroups: true
    });

    expect(mesh.geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 0, count: 3, materialIndex: 1 }
    ]);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    expect(materials[1]?.userData.mmdTslOutlineMaterial).toMatchObject({
      sourceEdgeSize: 0,
      shaderApplied: true
    });
    expect(materials[1]?.opacity).toBe(1);
  });
});

function createSourceMaterial(options: {
  readonly edgeSize: number;
  readonly edgeColor?: readonly [number, number, number, number];
  readonly edge?: boolean;
  readonly specular?: readonly [number, number, number];
  readonly specularPower?: number;
}): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial();
  material.userData.mmdMaterial = {
    diffuse: [1, 1, 1, 1],
    ambient: [0, 0, 0],
    specular: options.specular ?? [0, 0, 0],
    specularPower: options.specularPower ?? 0,
    edgeColor: options.edgeColor ?? [0, 0, 0, 1],
    edgeSize: options.edgeSize,
    sphereMode: "none",
    flags: {
      edge: options.edge ?? true,
      groundShadow: true,
      selfShadowMap: true
    }
  };
  return material;
}
