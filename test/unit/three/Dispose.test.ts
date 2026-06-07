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
    const root = new THREE.Group();
    root.add(mesh, outlineMesh, renderOrderMesh);
    const scene = new THREE.Scene();
    scene.add(root);

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
      root,
      object: root,
      mesh,
      outlineMeshes: [outlineMesh],
      renderOrderMeshes: [renderOrderMesh],
      runtime: undefined as never,
      source: { kind: "bytes", byteLength: 0 },
      diagnostics: {
        core: { kind: "provided" },
        source: { kind: "bytes", byteLength: 0 },
        textures: [],
        materials: [],
        performance: []
      },
      textureDiagnostics: [],
      setAnimation() {},
      update() {
        return { seconds: 0, frame: 0, frameRate: 30 };
      }
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

  it("can preserve externally shared textures during model disposal", () => {
    const geometry = new THREE.BufferGeometry();
    const sharedTexture = new THREE.Texture();
    const ownedTexture = new THREE.Texture();
    ownedTexture.userData.mmdTextureOwnership = "loader";
    const material = new THREE.MeshToonMaterial({ map: sharedTexture });
    material.userData.ownedTexture = ownedTexture;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const root = new THREE.Group();
    root.add(mesh);
    const sharedTextureDispose = vi.spyOn(sharedTexture, "dispose");
    const ownedTextureDispose = vi.spyOn(ownedTexture, "dispose");

    disposeMmdModel(
      {
        root,
        object: root,
        mesh,
        outlineMeshes: [],
        renderOrderMeshes: [],
        runtime: undefined as never,
        source: { kind: "bytes", byteLength: 0 },
        diagnostics: {
          core: { kind: "provided" },
          source: { kind: "bytes", byteLength: 0 },
          textures: [],
          materials: [],
          performance: []
        },
        textureDiagnostics: [],
        setAnimation() {},
        update() {
          return { seconds: 0, frame: 0, frameRate: 30 };
        }
      } satisfies ThreeMmdModel,
      { textures: "owned" }
    );

    expect(sharedTextureDispose).not.toHaveBeenCalled();
    expect(ownedTextureDispose).toHaveBeenCalledOnce();
  });

  it("preserves the shared fallback toon gradient even in all-textures disposal mode", () => {
    const geometry = new THREE.BufferGeometry();
    const fallbackGradient = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallbackGradient.userData.mmdFallbackToonGradient = true;
    const ownedTexture = new THREE.Texture();
    const material = new THREE.MeshToonMaterial({ map: ownedTexture });
    material.gradientMap = fallbackGradient;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const root = new THREE.Group();
    root.add(mesh);
    const fallbackGradientDispose = vi.spyOn(fallbackGradient, "dispose");
    const ownedTextureDispose = vi.spyOn(ownedTexture, "dispose");

    disposeMmdModel({
      root,
      object: root,
      mesh,
      outlineMeshes: [],
      renderOrderMeshes: [],
      runtime: undefined as never,
      source: { kind: "bytes", byteLength: 0 },
      diagnostics: {
        core: { kind: "provided" },
        source: { kind: "bytes", byteLength: 0 },
        textures: [],
        materials: [],
        performance: []
      },
      textureDiagnostics: [],
      setAnimation() {},
      update() {
        return { seconds: 0, frame: 0, frameRate: 30 };
      }
    } satisfies ThreeMmdModel);

    expect(ownedTextureDispose).toHaveBeenCalledOnce();
    expect(fallbackGradientDispose).not.toHaveBeenCalled();
  });

  it("disposes runtime resources when the runtime exposes a disposer", () => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const root = new THREE.Group();
    root.add(mesh);
    const runtimeDispose = vi.fn();

    disposeMmdModel({
      root,
      object: root,
      mesh,
      outlineMeshes: [],
      renderOrderMeshes: [],
      runtime: { dispose: runtimeDispose } as unknown as ThreeMmdModel["runtime"],
      source: { kind: "bytes", byteLength: 0 },
      diagnostics: {
        core: { kind: "provided" },
        source: { kind: "bytes", byteLength: 0 },
        textures: [],
        materials: [],
        performance: []
      },
      textureDiagnostics: [],
      setAnimation() {},
      update() {
        return { seconds: 0, frame: 0, frameRate: 30 };
      }
    } satisfies ThreeMmdModel);

    expect(runtimeDispose).toHaveBeenCalledOnce();
  });

  it("disposes split morph body meshes from the model root object", () => {
    const geometry = new THREE.BufferGeometry();
    const bodyGeometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const bodyMesh = new THREE.SkinnedMesh(bodyGeometry, material);
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    mesh.bind(skeleton);
    bodyMesh.bind(skeleton);
    mesh.userData.mmdMorphSplitBodyMeshes = [bodyMesh];

    const root = new THREE.Group();
    root.add(mesh, bodyMesh);
    const scene = new THREE.Scene();
    scene.add(root);

    const geometryDispose = vi.spyOn(geometry, "dispose");
    const bodyGeometryDispose = vi.spyOn(bodyGeometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const skeletonDispose = vi.spyOn(skeleton, "dispose");

    disposeMmdModel({
      root,
      object: root,
      mesh,
      outlineMeshes: [],
      renderOrderMeshes: [],
      runtime: undefined as never,
      source: { kind: "bytes", byteLength: 0 },
      diagnostics: {
        core: { kind: "provided" },
        source: { kind: "bytes", byteLength: 0 },
        textures: [],
        materials: [],
        performance: []
      },
      textureDiagnostics: [],
      setAnimation() {},
      update() {
        return { seconds: 0, frame: 0, frameRate: 30 };
      }
    } satisfies ThreeMmdModel);

    expect(scene.children).toHaveLength(0);
    expect(root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(bodyGeometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(skeletonDispose).toHaveBeenCalledOnce();
  });
});
