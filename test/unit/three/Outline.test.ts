import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  computeMmdMaterialRenderOrder,
  createMmdMaterialRenderOrderMeshes,
  createMmdOutlineMeshes,
  MMD_SELF_SHADOW_LAYER
} from "../../../src/three/index.js";
import type { MaterialInfo } from "../../../src/parser/model/modelTypes.js";

describe("MMD outline meshes", () => {
  it("uses PMX edge size with babylon-mmd compatible screen-space expansion", () => {
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

    material?.onBeforeCompile(shader, createRendererMock(512, 512));

    expect(material?.userData.mmdOutlineMaterial.outlineWidth).toBeCloseTo(0.6);
    expect(material?.side).toBe(THREE.BackSide);
    expect(material?.transparent).toBe(true);
    expect(material?.depthTest).toBe(true);
    expect(material?.depthWrite).toBe(true);
    expect(material?.polygonOffset).toBe(true);
    expect(material?.polygonOffsetFactor).toBe(1);
    expect(material?.polygonOffsetUnits).toBe(1);
    expect(shader.uniforms.mmdOutlineViewport?.value).toBeInstanceOf(THREE.Vector2);
    expect(shader.uniforms.mmdOutlineViewport?.value).toEqual(new THREE.Vector2(512, 512));
    outline.onBeforeRender(
      createRendererMock(256, 128),
      {} as THREE.Scene,
      {} as THREE.Camera,
      geometry,
      material ?? new THREE.Material(),
      null
    );
    expect(shader.uniforms.mmdOutlineViewport?.value).toEqual(new THREE.Vector2(256, 128));
    expect(shader.vertexShader).toContain("vec3 mmdOutlineViewNormal = mat3( modelViewMatrix ) * objectNormal;");
    expect(shader.vertexShader).toContain("vec2 mmdOutlineScreenNormal = mmdOutlineViewNormal.xy;");
    expect(shader.vertexShader).toContain("mmdOutlineScreenNormalLength > 0.0");
    expect(shader.vertexShader).toContain("mmdOutlineViewport * 0.25");
    expect(shader.vertexShader).toContain("gl_Position.xy += mmdOutlineScreenNormal");
    expect(shader.vertexShader).not.toContain("transformed += normal * mmdOutlineWidth");
  });

  it("preserves PMX outline edge size without a library clamp", () => {
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
      materials: [createMaterialInfo({ edgeSize: 8 })]
    });
    const material = outline?.material as THREE.Material | undefined;

    expect(material?.userData.mmdOutlineMaterial.outlineWidth).toBeCloseTo(8);
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

    const sourceMaterials = [
      new THREE.MeshToonMaterial(),
      new THREE.MeshToonMaterial()
    ];
    const mesh = new THREE.SkinnedMesh(geometry, sourceMaterials);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const outlines = createMmdOutlineMeshes({
      mesh,
      materials: [
        createMaterialInfo({ name: "first", edgeSize: 0.4, flags: { ...createMaterialInfo().flags, selfShadowMap: true } }),
        createMaterialInfo({ name: "second", edgeSize: 0.6, flags: { ...createMaterialInfo().flags, selfShadowMap: true } })
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

    const secondMaterial = sourceMaterials[1];
    expect(secondMaterial).toBeDefined();
    if (!secondMaterial) {
      throw new Error("missing second source material");
    }
    secondMaterial.side = THREE.DoubleSide;
    const materialMeshes = createMmdMaterialRenderOrderMeshes({
      mesh,
      materials: [
        createMaterialInfo({ name: "first", edgeSize: 0.4, flags: { ...createMaterialInfo().flags, selfShadowMap: true } }),
        createMaterialInfo({ name: "second", edgeSize: 0.6, flags: { ...createMaterialInfo().flags, selfShadowMap: true } })
      ]
    });
    expect(materialMeshes.map((proxy) => proxy.renderOrder)).toEqual([0, 1]);
    expect(materialMeshes.map((proxy) => !Array.isArray(proxy.material) && proxy.material.transparent)).toEqual([
      false,
      false
    ]);
    expect(materialMeshes.every((proxy) => proxy.customDepthMaterial?.userData.mmdShadowDepthMaterial)).toBe(true);
    expect(materialMeshes.map((proxy) => proxy.customDepthMaterial?.side)).toEqual([
      THREE.FrontSide,
      THREE.DoubleSide
    ]);
    expect(outlines.map((outline) => outline.renderOrder)).toEqual([2, 3]);
    expect(Math.max(...materialMeshes.map((proxy) => proxy.renderOrder))).toBeLessThan(
      Math.min(...outlines.map((outline) => outline.renderOrder))
    );
  });

  it("does not force opaque source materials into transparent sorting for render-order proxies", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);
    const material = new THREE.MeshToonMaterial({ transparent: false, opacity: 1 });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const [proxy] = createMmdMaterialRenderOrderMeshes({
      mesh,
      materials: [createMaterialInfo({ name: "opaque skin", edgeSize: 0.4 })]
    });

    expect(proxy?.material).toBe(material);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
  });

  it("uses the PMX self-shadow-map flag for render-order proxy self-shadow layers", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
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

    const materialMeshes = createMmdMaterialRenderOrderMeshes({
      mesh,
      materials: [
        createMaterialInfo({ flags: { ...createMaterialInfo().flags, groundShadow: true } }),
        createMaterialInfo({ flags: { ...createMaterialInfo().flags, selfShadowMap: true } })
      ]
    });

    expect(materialMeshes.map((proxy) => proxy.castShadow)).toEqual([true, true]);
    expect(materialMeshes.map((proxy) => !!proxy.customDepthMaterial)).toEqual([true, true]);
    expect(materialMeshes.map((proxy) => proxy.layers.mask & (1 << MMD_SELF_SHADOW_LAYER))).toEqual([
      0,
      1 << MMD_SELF_SHADOW_LAYER
    ]);
  });

  it("keeps PMX material definition order even when transparency buckets differ", () => {
    expect(
      computeMmdMaterialRenderOrder([
        { materialIndex: 2, transparencyMode: "alphaBlend" },
        { materialIndex: 0, transparencyMode: "opaque" },
        { materialIndex: 1, transparencyMode: "alphaTest" }
      ])
    ).toEqual([
      { materialIndex: 0, bucket: "opaque", renderOrder: 0 },
      { materialIndex: 1, bucket: "alphaTest", renderOrder: 1 },
      { materialIndex: 2, bucket: "alphaBlend", renderOrder: 2 }
    ]);
  });

  it("carries source texture alpha testing onto outline materials without scanning texture pixels", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);

    const sourceMap = new THREE.Texture();
    const sourceMaterial = new THREE.MeshToonMaterial({ map: sourceMap, alphaTest: 0.35 });
    // Only alphaTest-classified materials clip the inverted-hull edge to the cutout shape
    // (shading-note §12); mark the source accordingly.
    sourceMaterial.userData.mmdMaterial = { transparencyMode: "alphaTest" };
    const mesh = new THREE.SkinnedMesh(geometry, sourceMaterial);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const [outline] = createMmdOutlineMeshes({
      mesh,
      materials: [createMaterialInfo({ edgeSize: 0.6 })]
    });
    const material = outline?.material as THREE.MeshBasicMaterial | undefined;
    const shader = {
      uniforms: {},
      vertexShader: ["#include <common>", "#include <project_vertex>"].join("\n"),
      fragmentShader: "#include <alphatest_fragment>"
    };

    material?.onBeforeCompile(shader, createRendererMock(512, 512));

    expect(material?.map).toBe(sourceMap);
    expect(material?.alphaTest).toBe(0.35);
    expect(material?.userData.mmdOutlineMaterial.alphaCutout).toBe(true);
    expect(shader.fragmentShader).toContain("#include <alphatest_fragment>");
  });

  it("keeps a flat silhouette edge for alphaBlend materials instead of clipping by texture", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);

    const sourceMap = new THREE.Texture();
    const sourceMaterial = new THREE.MeshToonMaterial({ map: sourceMap, alphaTest: 0.01 });
    sourceMaterial.userData.mmdMaterial = { transparencyMode: "alphaBlend" };
    const mesh = new THREE.SkinnedMesh(geometry, sourceMaterial);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));

    const [outline] = createMmdOutlineMeshes({
      mesh,
      materials: [createMaterialInfo({ edgeSize: 0.6 })]
    });
    const material = outline?.material as THREE.MeshBasicMaterial | undefined;

    // alphaBlend source: the edge must NOT bind the body map (which would tint the rim)
    // nor clip the silhouette by texture alpha.
    expect(material?.map ?? null).toBeNull();
    expect(material?.alphaTest).toBe(0);
    expect(material?.userData.mmdOutlineMaterial.alphaCutout).toBe(false);
  });
});

function createRendererMock(width: number, height: number): THREE.WebGLRenderer {
  return {
    getCurrentViewport(target: THREE.Vector4) {
      return target.set(0, 0, width, height);
    }
  } as THREE.WebGLRenderer;
}

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
