import { readFile } from "node:fs/promises";

import * as THREE from "three/webgpu";
import * as TSL from "three/tsl";
import { describe, expect, it, vi } from "vitest";

import {
  createMmdTslMaterialFromSource,
  replaceMmdModelMaterialsWithTsl
} from "../../../src/webgpu/material-assembly.js";

describe("TSL material assembly", () => {
  it("forwards legacySrgbFramebuffer into the material-core options", async () => {
    const source = await readFile("src/webgpu/material-assembly.ts", "utf8");
    const fromSourceStart = source.indexOf("export function createMmdTslMaterialFromSource");
    const fromSourceEnd = source.indexOf("export function replaceMmdModelMaterialsWithTsl");
    expect(fromSourceStart).toBeGreaterThanOrEqual(0);
    expect(fromSourceEnd).toBeGreaterThan(fromSourceStart);
    const fromSourceBody = source.slice(fromSourceStart, fromSourceEnd);

    expect(source).toContain("readonly legacySrgbFramebuffer?: boolean");
    expect(fromSourceBody).toContain("legacySrgbFramebuffer: options.legacySrgbFramebuffer === true");
  });

  it("forwards dedicated visibility only to PMX self-shadow receivers", async () => {
    const source = await readFile("src/webgpu/material-assembly.ts", "utf8");
    expect(source).toContain("metadata.flags?.selfShadow === true");
    expect(source).toContain("options.dedicatedShadowVisibilityNode");

    const receiverSource = createSourceMaterial({ edgeSize: 0 });
    receiverSource.userData.mmdMaterial.flags.selfShadow = true;
    const casterOnlySource = createSourceMaterial({ edgeSize: 0 });
    casterOnlySource.userData.mmdMaterial.flags.selfShadow = false;
    const visibilityNode = TSL.float(0);
    const receiver = createMmdTslMaterialFromSource(receiverSource, {
      dedicatedShadowVisibilityNode: visibilityNode
    });
    const casterOnly = createMmdTslMaterialFromSource(casterOnlySource, {
      dedicatedShadowVisibilityNode: visibilityNode
    });

    expect(receiver.colorNode).toBeDefined();
    expect(casterOnly.colorNode).toBeDefined();
    expect(receiver.userData.mmdTslMaterialUniforms.dedicatedShadowEnabled.value).toBe(0);
    expect(casterOnly.userData.mmdTslMaterialUniforms.dedicatedShadowEnabled.value).toBe(0);
  });

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

  it("releases replaced source materials while retaining texture references for disposal", () => {
    const diffuseMap = new THREE.Texture();
    const toonMap = new THREE.Texture();
    const sphereMap = new THREE.Texture();
    const sourceMaterial = createSourceMaterial({ edgeSize: 0 });
    sourceMaterial.map = diffuseMap;
    sourceMaterial.gradientMap = toonMap;
    sourceMaterial.userData.mmdSphereMap = { texture: sphereMap };
    const sourceDispose = vi.spyOn(sourceMaterial, "dispose");
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), sourceMaterial);

    replaceMmdModelMaterialsWithTsl(mesh);

    const nodeMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(nodeMaterial?.userData.mmdTslTextureReferences).toEqual({
      diffuseMap,
      toonMap,
      sphereMap
    });
  });

  it("preserves source render flags for non-MMD transparent materials", () => {
    const sourceMaterial = new THREE.MeshToonMaterial({
      transparent: true,
      opacity: 1,
      depthWrite: false
    });

    const nodeMaterial = createMmdTslMaterialFromSource(sourceMaterial);

    expect(nodeMaterial.opacity).toBe(1);
    expect(nodeMaterial.transparent).toBe(true);
    expect(nodeMaterial.depthWrite).toBe(false);
  });

  it("renders double-sided MMD alpha blend materials in one pass without changing opacity", () => {
    const sourceMaterial = new THREE.MeshToonMaterial({
      opacity: 0.36,
      transparent: true,
      side: THREE.DoubleSide
    });
    sourceMaterial.userData.mmdMaterial = {
      diffuse: [1, 1, 1, 0.36],
      transparencyMode: "alphaBlend",
      flags: { doubleSided: true }
    };

    const nodeMaterial = createMmdTslMaterialFromSource(sourceMaterial);

    expect(nodeMaterial.forceSinglePass).toBe(true);
    expect(nodeMaterial.opacity).toBeCloseTo(0.36);
  });

  it("keeps double-sided MMD materials single-pass across transparency changes", () => {
    const oneSided = new THREE.MeshToonMaterial({ transparent: true, side: THREE.FrontSide });
    oneSided.userData.mmdMaterial = {
      diffuse: [1, 1, 1, 0.5],
      transparencyMode: "alphaBlend",
      flags: { doubleSided: false }
    };
    const opaqueDoubleSided = new THREE.MeshToonMaterial({ side: THREE.DoubleSide });
    opaqueDoubleSided.userData.mmdMaterial = {
      diffuse: [1, 1, 1, 1],
      transparencyMode: "opaque",
      flags: { doubleSided: true }
    };

    expect(createMmdTslMaterialFromSource(oneSided).forceSinglePass).toBe(false);
    expect(createMmdTslMaterialFromSource(opaqueDoubleSided).forceSinglePass).toBe(true);
  });

  it("preserves the Three.js pass default for non-MMD double-sided materials", () => {
    const sourceMaterial = new THREE.MeshToonMaterial({
      transparent: true,
      side: THREE.DoubleSide
    });

    expect(createMmdTslMaterialFromSource(sourceMaterial).forceSinglePass).toBe(false);
  });

  it("applies MMD transparency metadata before the initial runtime state sync", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setIndex([0, 1, 2]);
    geometry.addGroup(0, 3, 0);
    const material = createSourceMaterial({ edgeSize: 0 });
    material.userData.mmdMaterial.diffuse = [1, 1, 1, 0];
    material.userData.mmdMaterial.flags.groundShadow = true;
    const mesh = new THREE.Mesh(geometry, material);

    replaceMmdModelMaterialsWithTsl(mesh);

    const [nodeMaterial] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    expect(nodeMaterial?.visible).toBe(true);
    expect(nodeMaterial?.colorWrite).toBe(false);
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
      sourceMaterialIndex: 0,
      sourceEdgeSize: 0.4,
      shaderApplied: true
    });
    expect(materials[2]?.userData.mmdTslOutlineMaterial.uniforms.width.value).toBe(0.4);
    expect(materials[2]?.vertexNode).toBeDefined();
    expect(materials[2]?.positionNode ?? null).toBeNull();
    expect(materials[3]?.userData.mmdTslOutlineMaterial).toMatchObject({
      sourceMaterialIndex: 1,
      sourceEdgeSize: 0.7,
      shaderApplied: true
    });
    expect(materials[3]?.userData.mmdTslOutlineMaterial.uniforms.opacity.value).toBe(0.8);
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
