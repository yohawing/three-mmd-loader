import * as THREE from "three/webgpu";
import { describe, expect, it, vi } from "vitest";

import { MMD_SELF_SHADOW_LAYER } from "../../../src/three/index.js";
import {
  createMmdTslShadowCaster,
  disposeMmdTslShadowCaster
} from "../../../src/webgpu/shadow-caster.js";

describe("TSL shadow caster", () => {
  it("combines opaque caster groups into one shadow-only draw", () => {
    const geometry = createGeometry();
    const casterA = createMaterial("opaque", true);
    const excluded = createMaterial("opaque", false);
    const casterB = createMaterial("alphaBlend", true);
    const outline = createMaterial("opaque", true);
    outline.userData.mmdTslOutlineMaterial = { sourceMaterialIndex: 0 };
    const mesh = createSkinnedMesh(geometry, [casterA, excluded, casterB, outline]);
    mesh.castShadow = true;
    mesh.layers.enable(MMD_SELF_SHADOW_LAYER);

    const proxy = createMmdTslShadowCaster(mesh);

    expect(proxy).not.toBeNull();
    expect(proxy?.geometry.groups).toEqual([{ start: 0, count: 6, materialIndex: 0 }]);
    expect(Array.from(proxy?.geometry.index?.array ?? [])).toEqual([0, 1, 2, 2, 1, 3]);
    expect(proxy?.geometry.getAttribute("position")).toBe(geometry.getAttribute("position"));
    expect(proxy?.geometry.getAttribute("skinIndex")).toBe(geometry.getAttribute("skinIndex"));
    expect(proxy?.skeleton).toBe(mesh.skeleton);
    expect(proxy?.morphTargetInfluences).toBe(mesh.morphTargetInfluences);
    expect(proxy?.layers.mask).toBe(1 << MMD_SELF_SHADOW_LAYER);
    expect(proxy?.castShadow).toBe(true);
    expect(proxy?.receiveShadow).toBe(false);
    expect(proxy?.parent).toBe(mesh);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.layers.mask & (1 << MMD_SELF_SHADOW_LAYER)).toBe(0);
    expect(proxy?.userData.mmdTslShadowCaster).toEqual({
      opaqueDraws: 1,
      alphaTestDraws: 0,
      sourceGroupCount: 4
    });
  });

  it("allows the fast opaque path without changing the default alpha cutouts", () => {
    const geometry = createGeometry();
    const texture = new THREE.Texture();
    const alphaA = createMaterial("alphaTest", true, texture);
    const opaque = createMaterial("opaque", true);
    const alphaB = createMaterial("alphaBlend", true, texture);
    alphaB.alphaTest = alphaA.alphaTest;
    const excluded = createMaterial("opaque", false);
    const mesh = createSkinnedMesh(geometry, [alphaA, opaque, alphaB, excluded]);

    const opaqueProxy = createMmdTslShadowCaster(mesh, { alphaTest: false });

    expect(opaqueProxy?.geometry.groups).toEqual([{ start: 0, count: 9, materialIndex: 0 }]);
    expect(opaqueProxy?.userData.mmdTslShadowCaster).toMatchObject({
      opaqueDraws: 1,
      alphaTestDraws: 0
    });

    disposeMmdTslShadowCaster(mesh);
    const proxy = createMmdTslShadowCaster(mesh);
    const materials = Array.isArray(proxy?.material) ? proxy.material : [proxy?.material];

    expect(proxy?.geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 6, materialIndex: 1 }
    ]);
    expect(Array.from(proxy?.geometry.index?.array ?? [])).toEqual([1, 3, 2, 0, 1, 2, 2, 1, 3]);
    expect(materials).toHaveLength(2);
    expect(materials[0]?.userData.mmdTslShadowCasterMaterial).toEqual({ alphaTest: false });
    expect(materials[1]?.userData.mmdTslShadowCasterMaterial).toMatchObject({ alphaTest: true });
    expect((materials[1] as THREE.MeshBasicNodeMaterial | undefined)?.map).toBe(texture);
    expect(proxy?.userData.mmdTslShadowCaster).toMatchObject({ opaqueDraws: 1, alphaTestDraws: 1 });
  });

  it("preserves opaque culling buckets and detached skeleton binding", () => {
    const geometry = createGeometry();
    geometry.clearGroups();
    geometry.setDrawRange(3, 6);
    const front = createMaterial("opaque", true);
    const mesh = createSkinnedMesh(geometry, [front]);
    mesh.bindMode = THREE.DetachedBindMode;

    const proxy = createMmdTslShadowCaster(mesh);

    expect(proxy?.bindMode).toBe(THREE.DetachedBindMode);
    expect(proxy?.geometry.groups).toEqual([{ start: 0, count: 6, materialIndex: 0 }]);
    expect(Array.from(proxy?.geometry.index?.array ?? [])).toEqual([1, 3, 2, 2, 1, 3]);
    expect(proxy?.userData.mmdTslShadowCaster).toMatchObject({
      opaqueDraws: 1,
      sourceGroupCount: 1
    });

    disposeMmdTslShadowCaster(mesh);
    geometry.clearGroups();
    geometry.setDrawRange(0, Infinity);
    const doubleSided = createMaterial("opaque", true);
    doubleSided.side = THREE.DoubleSide;
    mesh.material = [front, doubleSided];
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);

    const splitProxy = createMmdTslShadowCaster(mesh);

    expect(splitProxy?.geometry.groups).toHaveLength(2);
    expect(splitProxy?.userData.mmdTslShadowCaster).toMatchObject({ opaqueDraws: 2 });
  });

  it("disposes owned proxy resources and restores source shadow state", () => {
    const geometry = createGeometry();
    const mesh = createSkinnedMesh(geometry, [
      createMaterial("opaque", true),
      createMaterial("opaque", false),
      createMaterial("opaque", true),
      createMaterial("opaque", false)
    ]);
    mesh.castShadow = true;
    mesh.layers.enable(MMD_SELF_SHADOW_LAYER);
    const proxy = createMmdTslShadowCaster(mesh);
    if (!proxy) throw new Error("Expected a TSL shadow caster proxy");
    const geometryDispose = vi.spyOn(proxy.geometry, "dispose");
    const material = Array.isArray(proxy.material) ? proxy.material[0] : proxy.material;
    if (!material) throw new Error("Expected a TSL shadow caster material");
    const materialDispose = vi.spyOn(material, "dispose");

    expect(disposeMmdTslShadowCaster(mesh)).toBe(true);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(proxy?.parent).toBeNull();
    expect(mesh.castShadow).toBe(true);
    expect(mesh.layers.mask & (1 << MMD_SELF_SHADOW_LAYER)).toBe(1 << MMD_SELF_SHADOW_LAYER);
    expect(disposeMmdTslShadowCaster(mesh)).toBe(false);
  });
});

function createGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3)
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
  );
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 1, 3, 0, 2, 3]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  geometry.addGroup(6, 3, 2);
  geometry.addGroup(9, 3, 3);
  return geometry;
}

function createSkinnedMesh(
  geometry: THREE.BufferGeometry,
  materials: THREE.Material[]
): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(geometry, materials);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.morphTargetDictionary = { test: 0 };
  mesh.morphTargetInfluences = [0];
  return mesh;
}

function createMaterial(
  transparencyMode: "opaque" | "alphaTest" | "alphaBlend",
  castsShadow: boolean,
  diffuseMap?: THREE.Texture
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({
    alphaTest: transparencyMode === "alphaTest" ? 0.01 : 0
  });
  material.userData.mmdMaterial = {
    transparencyMode,
    flags: {
      groundShadow: castsShadow,
      selfShadowMap: castsShadow
    }
  };
  material.userData.mmdTslTextureReferences = { diffuseMap };
  return material;
}
