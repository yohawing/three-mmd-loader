import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  MMD_TSL_DEFAULT_LIGHT_COLOR,
  MMD_TSL_DEFAULT_TOON_COORD_OFFSET,
  createMmdTslToonMaterial,
  syncMmdTslMaterialState
} from "../../../src/webgpu/material-core.js";

describe("TSL material core", () => {
  it("initializes MMD default light and toon uniforms", () => {
    const material = createMmdTslToonMaterial();
    const uniforms = material.userData.mmdTslMaterialUniforms;

    expect(uniforms.lightColor.toArray()).toEqual([
      MMD_TSL_DEFAULT_LIGHT_COLOR,
      MMD_TSL_DEFAULT_LIGHT_COLOR,
      MMD_TSL_DEFAULT_LIGHT_COLOR
    ]);
    expect(MMD_TSL_DEFAULT_TOON_COORD_OFFSET).toBe(0.45);
    expect(uniforms.toonCoordinateOffset.value).toBe(MMD_TSL_DEFAULT_TOON_COORD_OFFSET);
    expect(material.colorNode).toBeDefined();
    expect(material.receivedShadowNode).toBeDefined();
    expect(material.castShadowNode).toBeDefined();
  });

  it("syncs runtime state without replacing preallocated uniform containers", () => {
    const material = createMmdTslToonMaterial();
    const uniforms = material.userData.mmdTslMaterialUniforms;
    const originalDiffuse = uniforms.diffuse;
    const originalAmbient = uniforms.ambient;
    const originalSpecular = uniforms.specular;
    const originalSpecularPower = uniforms.specularPower;
    const originalToonCoordinateOffset = uniforms.toonCoordinateOffset;
    const originalTextureFactor = uniforms.textureFactor;
    const originalSphereTextureFactor = uniforms.sphereTextureFactor;
    const originalToonTextureFactor = uniforms.toonTextureFactor;

    syncMmdTslMaterialState(material, {
      diffuse: [0.25, 0.5, 0.75, 0.5],
      ambient: [0.1, 0.2, 0.3],
      specular: [0.4, 0.5, 0.6],
      specularPower: 16,
      textureFactor: [0.7, 0.8, 0.9, 1],
      sphereTextureFactor: [0.2, 0.3, 0.4, 0.5],
      toonTextureFactor: [0.6, 0.7, 0.8, 0.9]
    });

    expect(uniforms.diffuse).toBe(originalDiffuse);
    expect(uniforms.ambient).toBe(originalAmbient);
    expect(uniforms.specular).toBe(originalSpecular);
    expect(uniforms.specularPower).toBe(originalSpecularPower);
    expect(uniforms.toonCoordinateOffset).toBe(originalToonCoordinateOffset);
    expect(uniforms.textureFactor).toBe(originalTextureFactor);
    expect(uniforms.sphereTextureFactor).toBe(originalSphereTextureFactor);
    expect(uniforms.toonTextureFactor).toBe(originalToonTextureFactor);
    expect(uniforms.diffuse.toArray()).toEqual([0.25, 0.5, 0.75]);
    expect(uniforms.ambient.toArray()).toEqual([0.1, 0.2, 0.3]);
    expect(uniforms.specular.toArray()).toEqual([0.4, 0.5, 0.6]);
    expect(uniforms.specularPower.value).toBe(16);
    expect(uniforms.textureFactor.toArray()).toEqual([0.7, 0.8, 0.9, 1]);
    expect(uniforms.sphereTextureFactor.toArray()).toEqual([0.2, 0.3, 0.4, 0.5]);
    expect(uniforms.toonTextureFactor.toArray()).toEqual([0.6, 0.7, 0.8, 0.9]);
    expect(material.opacity).toBe(0.5);
    expect(material.transparent).toBe(true);
  });

  it("preserves alpha blend transparency semantics while syncing runtime state", () => {
    const material = createMmdTslToonMaterial();
    material.userData.mmdMaterial = {
      transparencyMode: "alphaBlend",
      flags: {}
    };
    const previousVersion = material.version;

    syncMmdTslMaterialState(material, {
      diffuse: [1, 1, 1, 1],
      ambient: [0, 0, 0],
      specular: [0, 0, 0],
      specularPower: 0,
      textureFactor: [1, 1, 1, 1],
      sphereTextureFactor: [0, 0, 0, 0],
      toonTextureFactor: [1, 1, 1, 1]
    });

    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.colorWrite).toBe(true);
    expect(material.version).toBeGreaterThan(previousVersion);

    const syncedVersion = material.version;
    syncMmdTslMaterialState(material, {
      diffuse: [1, 1, 1, 1],
      ambient: [0, 0, 0],
      specular: [0, 0, 0],
      specularPower: 0,
      textureFactor: [1, 1, 1, 1],
      sphereTextureFactor: [0, 0, 0, 0],
      toonTextureFactor: [1, 1, 1, 1]
    });
    expect(material.version).toBe(syncedVersion);
  });

  it("transforms the ToonRamp light direction into view space with matrix-first order", async () => {
    const source = await readFile("src/webgpu/material-core.ts", "utf8");

    expect(source).toContain("const normalView = TSL.normalize(TSL.normalView);");
    expect(source).toContain('transformDirection(direction: THREE.Node<"vec3">): THREE.Node<"vec3">;');
    expect(source).toContain('cameraViewMatrix.transformDirection(lightDirectionNode as unknown as THREE.Node<"vec3">)');
    expect(source).toContain("const lambert = TSL.max(0, TSL.dot(normalView, lightDirectionView));");
    expect(source).toContain("lambert.mul(0.5).add(toonCoordinateOffset)");
  });

  it("matches the GLSL MMD gamma-space color contract for sRGB maps and final EOTF", async () => {
    const source = await readFile("src/webgpu/material-core.ts", "utf8");
    const baseColorStart = source.indexOf("export function createMmdTslBaseColorNode");
    const baseColorEnd = source.indexOf("export function createMmdTslReceivedShadowNode");
    expect(baseColorStart).toBeGreaterThanOrEqual(0);
    expect(baseColorEnd).toBeGreaterThan(baseColorStart);
    const baseColorSource = source.slice(baseColorStart, baseColorEnd);

    // OETF is only applied to real sRGB color textures (diffuse / sphere), not to the
    // NoColorSpace toon ramp that is already authored in gamma space.
    expect(baseColorSource).toContain(
      "options.gammaSpaceComposite === true && options.diffuseMap"
    );
    expect(baseColorSource).toContain(
      "options.gammaSpaceComposite === true && options.sphereMap"
    );
    expect(baseColorSource).toMatch(
      /options\.gammaSpaceComposite === true && options\.diffuseMap\s*\n\s*\? TSL\.sRGBTransferOETF\(diffuseTexture\)/
    );
    expect(baseColorSource).toMatch(
      /options\.gammaSpaceComposite === true && options\.sphereMap\s*\n\s*\? TSL\.sRGBTransferOETF\(sampledSphere\)/
    );
    expect(baseColorSource).not.toMatch(/sRGBTransferOETF\(\s*sampledToon/);
    expect(baseColorSource).not.toMatch(/sRGBTransferOETF\(\s*toonMul/);

    // Final EOTF is tied to the completed gamma composite, not to texture presence.
    expect(baseColorSource).toContain("const gammaComposite = TSL.clamp(sphereComposite.add(specularComposite), 0, 1);");
    expect(baseColorSource).not.toContain("if (options.gammaSpaceComposite !== true) {");
    expect(baseColorSource).toContain("return TSL.sRGBTransferEOTF(gammaComposite)");
  });
});
