import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { describe, expect, it } from "vitest";

import { computeMmdMaterialRenderOrder } from "../../../src/three/material/material-metadata.js";
import { createMmdMaterialRenderOrderMeshes, createMmdOutlineMeshes } from "../../../src/three/outline.js";
import { MMD_SELF_SHADOW_LAYER } from "../../../src/three/index.js";
import type { MaterialInfo } from "../../../src/parser/model/modelTypes.js";

describe("MMD outline meshes", () => {
  it("uses PMX edge size as a CSS-pixel screen-space width", () => {
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
    // Depth-only compensation remains conservative and does not scale visible width.
    expect(material?.polygonOffsetFactor).toBeCloseTo(2.2);
    expect(material?.polygonOffsetUnits).toBe(1);
    expect(shader.uniforms.mmdOutlineViewport?.value).toBeInstanceOf(THREE.Vector2);
    expect(shader.uniforms.mmdOutlineViewport?.value).toEqual(new THREE.Vector2(512, 512));
    expect(shader.uniforms.mmdOutlinePixelRatio?.value).toBe(1);
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
    expect(shader.vertexShader).toContain("vec2( 2.0 * mmdOutlinePixelRatio ) / mmdOutlineViewport");
    expect(shader.vertexShader).toContain("gl_Position.xy += mmdOutlineScreenNormal");
    expect(shader.vertexShader).not.toContain("transformed += normal * mmdOutlineWidth");
  });

  it("converts CSS-pixel edge width to device pixels with the renderer pixel ratio", () => {
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

    // Device viewport and renderer pixel ratio remain separate shader inputs so
    // edgeSize maps to CSS pixels without a tuned resolution-dependent factor.
    material?.onBeforeCompile(shader, createRendererMock(1024, 1024, 2));
    expect(shader.uniforms.mmdOutlineViewport?.value).toEqual(new THREE.Vector2(1024, 1024));
    expect(shader.uniforms.mmdOutlinePixelRatio?.value).toBe(2);
    outline.onBeforeRender(
      createRendererMock(2048, 2048, 2),
      {} as THREE.Scene,
      {} as THREE.Camera,
      geometry,
      material ?? new THREE.Material(),
      null
    );
    expect(shader.uniforms.mmdOutlineViewport?.value).toEqual(new THREE.Vector2(2048, 2048));
    expect(shader.uniforms.mmdOutlinePixelRatio?.value).toBe(2);
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
    expect(outlines.every((outline) => outline.geometry === geometry)).toBe(true);
    expect(outlines[0]?.geometry.getAttribute("position")).toBe(positions);
    expect(
      outlines.map((outline) => ({
        start: outline.userData.mmdOutlineProxy.start,
        count: outline.userData.mmdOutlineProxy.count
      }))
    ).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 3 }
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
    expect(materialMeshes.every((proxy) => proxy.geometry === geometry)).toBe(true);
    expect(
      materialMeshes.map((proxy) => ({
        start: proxy.userData.mmdMaterialRenderProxy.start,
        count: proxy.userData.mmdMaterialRenderProxy.count
      }))
    ).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 3 }
    ]);
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

  it.each([
    ["resting (0, 0)", 0, 0],
    ["full", 0, Number.POSITIVE_INFINITY]
  ])(
    "narrows the shared drawRange to the proxy group only around draws and restores a %s range",
    (_label, restStart, restCount) => {
      const { geometry, mesh, materials } = createTwoMaterialQuad();
      geometry.setDrawRange(restStart, restCount);
      const proxies = [
        ...createMmdMaterialRenderOrderMeshes({ mesh, materials }),
        ...createMmdOutlineMeshes({ mesh, materials })
      ];
      expect(proxies).toHaveLength(4);
      const renderer = createRendererMock(64, 64);
      for (const proxy of proxies) {
        const metadata = (proxy.userData.mmdMaterialRenderProxy ?? proxy.userData.mmdOutlineProxy) as {
          start: number;
          count: number;
        };
        const material = proxy.material as THREE.Material;
        proxy.onBeforeRender(renderer, {} as THREE.Scene, {} as THREE.Camera, geometry, material, null);
        expect(geometry.drawRange).toEqual({ start: metadata.start, count: metadata.count });
        proxy.onAfterRender(renderer, {} as THREE.Scene, {} as THREE.Camera, geometry, material, null);
        expect(geometry.drawRange).toEqual({ start: restStart, count: restCount });

        const shadowCamera = new THREE.Camera();
        const shadowArgs = [
          renderer,
          {} as THREE.Scene,
          {} as THREE.Camera,
          shadowCamera,
          geometry,
          material,
          {} as THREE.Group
        ] as const;
        proxy.onBeforeShadow(...shadowArgs);
        expect(geometry.drawRange).toEqual({ start: metadata.start, count: metadata.count });
        proxy.onAfterShadow(...shadowArgs);
        expect(geometry.drawRange).toEqual({ start: restStart, count: restCount });
      }
    }
  );

  it("preserves proxy draw ranges, raycasts and shared morph geometry after SkeletonUtils.clone", () => {
    const { geometry, mesh, materials } = createTwoMaterialQuad();
    geometry.setDrawRange(0, 0);
    const root = new THREE.Group();
    root.add(mesh, ...createMmdMaterialRenderOrderMeshes({ mesh, materials }), ...createMmdOutlineMeshes({ mesh, materials }));
    const cloned = clone(root);
    cloned.updateMatrixWorld(true);
    const renderer = createRendererMock(64, 64);
    const ray = new THREE.Raycaster(new THREE.Vector3(0.25, 0.25, 5), new THREE.Vector3(0, 0, -1));
    expect(cloned.children).toHaveLength(5);
    for (const child of cloned.children) {
      const proxy = child as THREE.SkinnedMesh;
      expect(proxy.geometry).toBe(geometry);
      const group = proxy.userData.mmdMaterialRenderProxy ?? proxy.userData.mmdOutlineProxy;
      if (!group) continue;
      const args = [renderer, new THREE.Scene(), new THREE.Camera(), geometry, proxy.material as THREE.Material, null] as const;
      proxy.onBeforeRender(...args);
      expect(geometry.drawRange).toEqual({ start: group.start, count: group.count });
      proxy.onAfterRender(...args);
      expect(geometry.drawRange).toEqual({ start: 0, count: 0 });
      if (proxy.userData.mmdMaterialRenderProxy) {
        expect(ray.intersectObject(proxy, false).map(hit => hit.faceIndex)).toEqual(group.start === 0 ? [0] : []);
        expect(geometry.drawRange).toEqual({ start: 0, count: 0 });
      }
    }
  });

  it("keeps the outline viewport sync chained with the draw-range hook", () => {
    const { geometry, mesh, materials } = createTwoMaterialQuad();
    geometry.setDrawRange(0, 0);
    const [outline] = createMmdOutlineMeshes({ mesh, materials });
    const material = outline?.material as THREE.Material;
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: ["#include <common>", "#include <project_vertex>"].join("\n"),
      fragmentShader: ""
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, createRendererMock(512, 512));

    outline?.onBeforeRender(createRendererMock(300, 200), {} as THREE.Scene, {} as THREE.Camera, geometry, material, null);

    expect(shader.uniforms.mmdOutlineViewport?.value).toEqual(new THREE.Vector2(300, 200));
    expect(geometry.drawRange).toEqual({ start: 0, count: 3 });
  });

  it("raycasts only the proxy group triangles and restores the shared drawRange", () => {
    const { geometry, mesh, materials } = createTwoMaterialQuad();
    geometry.setDrawRange(0, 0);
    const proxies = createMmdMaterialRenderOrderMeshes({ mesh, materials });
    const root = new THREE.Group();
    root.add(mesh, ...proxies);
    root.updateMatrixWorld(true);
    mesh.skeleton.update();

    // Ray through (0.25, 0.25) hits only triangle 0 (vertices 0, 1, 2); (0.75, 0.75)
    // hits only triangle 1 (vertices 1, 3, 2).
    const raycaster = new THREE.Raycaster();
    const hitsFor = (x: number, y: number) =>
      proxies.map((proxy) => {
        raycaster.set(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));
        const intersects: THREE.Intersection[] = [];
        proxy.raycast(raycaster, intersects);
        expect(geometry.drawRange).toEqual({ start: 0, count: 0 });
        return intersects.map((hit) => hit.faceIndex);
      });

    expect(hitsFor(0.25, 0.25)).toEqual([[0], []]);
    expect(hitsFor(0.75, 0.75)).toEqual([[], [1]]);
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

  it("draws a flat texture-independent edge even for alphaTest (cutout) source materials", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);

    const sourceMap = new THREE.Texture();
    const sourceMaterial = new THREE.MeshToonMaterial({ map: sourceMap, alphaTest: 0.35 });
    // Real MMD draws a flat, texture-independent edge (shading-note §12); even a cutout
    // (alphaTest) body's edge is a solid silhouette that shows through the body's holes.
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

    expect(material?.map ?? null).toBeNull();
    expect(material?.alphaTest).toBe(0);
    expect(material?.userData.mmdOutlineMaterial.alphaCutout).toBe(false);
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

function createTwoMaterialQuad(): {
  geometry: THREE.BufferGeometry;
  mesh: THREE.SkinnedMesh;
  materials: MaterialInfo[];
} {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(16).fill(0), 4));
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
  );
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(new Array(12).fill(0), 3)
  ];
  const mesh = new THREE.SkinnedMesh(geometry, [
    new THREE.MeshToonMaterial({ side: THREE.DoubleSide }),
    new THREE.MeshToonMaterial({ side: THREE.DoubleSide })
  ]);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  return {
    geometry,
    mesh,
    materials: [createMaterialInfo({ name: "first" }), createMaterialInfo({ name: "second" })]
  };
}

function createRendererMock(width: number, height: number, pixelRatio?: number): THREE.WebGLRenderer {
  return {
    getCurrentViewport(target: THREE.Vector4) {
      return target.set(0, 0, width, height);
    },
    ...(pixelRatio === undefined ? {} : { getPixelRatio: () => pixelRatio })
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
