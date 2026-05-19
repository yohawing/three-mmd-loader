import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createMmdMaterialRenderOrderMeshes,
  createMmdOutlineMeshes
} from "../../../src/three/index.js";
import type { MaterialInfo } from "../../../src/parser/model/modelTypes.js";

describe("MMD outline meshes", () => {
  it("uses screen-space outline width and projection-space expansion like three.js OutlineEffect", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);

    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshToonMaterial());
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const [outline] = createMmdOutlineMeshes({
      mesh,
      materials: [createMaterialInfo({ edgeSize: 0.6 })]
    });
    const material = outline?.material as THREE.Material | undefined;
    const shader = {
      uniforms: {},
      vertexShader: ["#include <common>", "#include <project_vertex>"].join("\n"),
      fragmentShader: ""
    };

    material?.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(material?.userData.mmdOutlineMaterial.outlineWidth).toBeCloseTo(0.6 / 300);
    expect(material?.side).toBe(THREE.BackSide);
    expect(material?.transparent).toBe(true);
    expect(material?.depthTest).toBe(true);
    expect(material?.depthWrite).toBe(false);
    expect(material?.polygonOffset).toBe(true);
    expect(material?.polygonOffsetFactor).toBe(1);
    expect(material?.polygonOffsetUnits).toBe(1);
    expect(shader.vertexShader).toContain("vec4 mmdOutlineDirection = normalize( gl_Position - mmdOutlineOffsetPosition );");
    expect(shader.vertexShader).toContain("gl_Position += mmdOutlineDirection * mmdOutlineWidth * gl_Position.w");
    expect(shader.vertexShader).not.toContain("transformed += normal * mmdOutlineWidth");
  });

  it("creates material-scoped outline proxies with shared geometry buffers and stable order", () => {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
      3
    );
    geometry.setAttribute("position", positions);
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
    );
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
    );
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);

    const mesh = new THREE.SkinnedMesh(geometry, [
      new THREE.MeshToonMaterial(),
      new THREE.MeshToonMaterial()
    ]);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const outlines = createMmdOutlineMeshes({
      mesh,
      materials: [
        createMaterialInfo({ name: "first", edgeSize: 0.4 }),
        createMaterialInfo({ name: "second", edgeSize: 0.6 })
      ]
    });

    expect(outlines).toHaveLength(2);
    expect(outlines[0]?.geometry).not.toBe(geometry);
    expect(outlines[0]?.geometry.getAttribute("position")).toBe(positions);
    expect(outlines[0]?.geometry.index).toBe(geometry.index);
    expect(outlines.map((outline) => outline.geometry.groups)).toEqual([
      [{ start: 0, count: 3, materialIndex: 0 }],
      [{ start: 3, count: 3, materialIndex: 0 }]
    ]);
    expect(outlines.map((outline) => outline.userData.mmdOutlineProxy.sourceMaterialIndex)).toEqual([
      0,
      1
    ]);
    expect(outlines[0]?.renderOrder).toBeLessThan(outlines[1]?.renderOrder ?? 0);

    const materialMeshes = createMmdMaterialRenderOrderMeshes({
      mesh,
      materials: [
        createMaterialInfo({ name: "first", edgeSize: 0.4 }),
        createMaterialInfo({ name: "second", edgeSize: 0.6 })
      ]
    });
    expect(materialMeshes.map((proxy) => proxy.renderOrder)).toEqual([0, 2]);
    expect(materialMeshes.every((proxy) => !Array.isArray(proxy.material) && proxy.material.transparent)).toBe(true);
    expect(outlines.map((outline) => outline.renderOrder)).toEqual([1, 3]);
  });
});

function createMaterialInfo(overrides: Partial<MaterialInfo> = {}): MaterialInfo {
  return {
    name: "mat",
    englishName: "mat",
    texturePath: "",
    sphereTexturePath: "",
    sphereMode: "none",
    toonTexturePath: "",
    sharedToonIndex: undefined,
    diffuse: [0.5, 0.6, 0.7, 1],
    specular: [0.1, 0.2, 0.3],
    specularPower: 4,
    ambient: [0.2, 0.2, 0.2],
    edgeColor: [0, 0, 0, 1],
    edgeSize: 1,
    flags: {
      doubleSided: false,
      groundShadow: false,
      selfShadowMap: false,
      selfShadow: false,
      edge: true,
      vertexColor: false,
      pointDraw: false,
      lineDraw: false
    },
    faceCount: 1,
    ...overrides
  };
}
