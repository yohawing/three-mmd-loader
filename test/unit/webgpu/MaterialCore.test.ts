import { readFile } from "node:fs/promises";

import * as TSL from "three/tsl";
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
    expect(material.setupLightingModel().constructor.name).toBe("MmdTslLightingModel");
  });

  it("uses Three's standard view-space material normal path", () => {
    const material = createMmdTslToonMaterial();

    expect(material.normalNode).toBeNull();
    expect(material.setupNormal()).toBe(TSL.materialNormal);
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
    expect(source).toContain("const signedDot = TSL.dot(normalView, lightDirectionView);");
    expect(source).toContain("const lambert = TSL.max(0, signedDot);");
    expect(source).toContain("signedDot.mul(0.5).add(toonCoordinateOffset)");
    expect(source).not.toContain("lambert.mul(0.5).add(toonCoordinateOffset)");
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
    // Default experimental path stays linear for SRGBColorSpace output encode.
    expect(baseColorSource).toContain("TSL.sRGBTransferEOTF(gammaComposite)");
    // Explicit legacy path skips EOTF so blending can match the gamma-space framebuffer.
    expect(baseColorSource).toContain("options.legacySrgbFramebuffer === true");
    expect(baseColorSource).toContain("? gammaComposite as ReturnType<typeof TSL.vec3>");
    expect(source).toContain("legacySrgbFramebuffer?: boolean");
  });

  it("keeps the dedicated self-shadow branch opt-in and uniform-gated", async () => {
    const source = await readFile("src/webgpu/material-core.ts", "utf8");
    expect(source).toContain("dedicatedShadowVisibilityNode?: THREE.Node<\"float\">");
    expect(source).toContain("TSL.texture(options.toonMap).sample(TSL.vec2(0, 0))");
    expect(source).toContain("uniforms.dedicatedShadowEnabled");

    // Real MMD 9.32 (mmd-shading-notes.md §10.2) always applies the dual-lerp when
    // self-shadow is enabled -- no per-pixel `< 0.999` hybrid that mixes the toon
    // ramp back in for lightly-shadowed pixels.
    expect(source).not.toContain("dedicatedShadowFactor.lessThan(0.999)");
    expect(source).toContain(
      "options.toonMap ? TSL.min(dedicatedNLGrade, dedicatedShadowFactor) : dedicatedShadowFactor"
    );
    expect(source).toContain("const dedicatedShadowColor = dedicatedLitNoSpec.mul(dedicatedSelfShadowToon);");
    expect(source).toContain("const dedicatedLitColor = dedicatedLitNoSpec.add(dedicatedSpecularComposite);");
    expect(source).toContain(
      "TSL.mix(dedicatedShadowColor, dedicatedLitColor, dedicatedVis)"
    );
    // Specular is gated unconditionally by the combined visibility (no ternary).
    expect(source).toMatch(
      /const dedicatedSpecularComposite = [\s\S]*?\.mul\(dedicatedVis\)\r?\n\s*\.mul\(specularGate\);/
    );

    const material = createMmdTslToonMaterial({ dedicatedShadowVisibilityNode: TSL.float(0) });
    const uniforms = material.userData.mmdTslMaterialUniforms;
    expect(uniforms.dedicatedShadowEnabled.value).toBe(0);
    expect(material.colorNode).toBeDefined();
  });

  it("adds the additive sphere sample once for GoldenOracle parity", async () => {
    const source = await readFile("src/webgpu/material-core.ts", "utf8");
    const addStart = source.indexOf('options.sphereMode === "add"');
    const addEnd = source.indexOf('options.sphereMode === "subTexture"');
    expect(addStart).toBeGreaterThanOrEqual(0);
    expect(addEnd).toBeGreaterThan(addStart);
    const addBranch = source.slice(addStart, addEnd);

    expect(addBranch).toContain(
      "baseComposite.add(compositeSphere.mul(sphereTextureFactor.rgb).mul(sphereTextureFactor.a))"
    );
    expect(addBranch).not.toContain(".mul(2)");
  });
});
