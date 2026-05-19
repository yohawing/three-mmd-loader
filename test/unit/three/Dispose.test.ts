import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { disposeMmdModel, type ThreeMmdModel } from "../../../src/three/index.js";

describe("disposeMmdModel", () => {
  it("disposes mesh, outline, render-order, skeleton, and texture resources once", () => {
    const geometry = new THREE.BufferGeometry();
    const outlineGeometry = new THREE.BufferGeometry();
    const renderOrderGeometry = new THREE.BufferGeometry();
    const texture = new THREE.Texture();
    const sphereTexture = new THREE.Texture();
    const uniformTexture = new THREE.Texture();
    const boneTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    const material = new THREE.MeshToonMaterial({ map: texture });
    material.userData.mmdSphereTexture = sphereTexture;
    material.userData.mmdShader = {
      uniforms: {
        toonMap: { value: uniformTexture }
      }
    };
    const outlineMaterial = material;
    const renderOrderMaterial = new THREE.MeshBasicMaterial();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const outlineMesh = new THREE.SkinnedMesh(outlineGeometry, outlineMaterial);
    const renderOrderMesh = new THREE.SkinnedMesh(renderOrderGeometry, renderOrderMaterial);
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    skeleton.boneTexture = boneTexture;
    mesh.bind(skeleton);
    const scene = new THREE.Scene();
    scene.add(mesh, outlineMesh, renderOrderMesh);

    const geometryDispose = vi.spyOn(geometry, "dispose");
    const outlineGeometryDispose = vi.spyOn(outlineGeometry, "dispose");
    const renderOrderGeometryDispose = vi.spyOn(renderOrderGeometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const renderOrderMaterialDispose = vi.spyOn(renderOrderMaterial, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const sphereTextureDispose = vi.spyOn(sphereTexture, "dispose");
    const uniformTextureDispose = vi.spyOn(uniformTexture, "dispose");
    const boneTextureDispose = vi.spyOn(boneTexture, "dispose");
    const skeletonDispose = vi.spyOn(skeleton, "dispose");

    disposeMmdModel({
      mesh,
      outlineMeshes: [outlineMesh],
      renderOrderMeshes: [renderOrderMesh],
      source: { kind: "bytes", byteLength: 0 },
      textureDiagnostics: []
    } satisfies ThreeMmdModel);

    expect(scene.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(outlineGeometryDispose).toHaveBeenCalledOnce();
    expect(renderOrderGeometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(renderOrderMaterialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(sphereTextureDispose).toHaveBeenCalledOnce();
    expect(uniformTextureDispose).toHaveBeenCalledOnce();
    expect(boneTextureDispose).toHaveBeenCalledOnce();
    expect(skeletonDispose).toHaveBeenCalledOnce();
  });
});
