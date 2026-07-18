import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("TSL dedicated self-shadow pass scaffold", () => {
  it("keeps the pass internal and preallocates its depth target", async () => {
    const source = await readFile("src/webgpu/self-shadow-pass.ts", "utf8");

    expect(source).toContain("export function createMmdTslSelfShadowPass");
    expect(source).toContain("new THREE.DepthTexture(SHADOW_TARGET_SIZE, SHADOW_TARGET_SIZE)");
    expect(source).toContain("const SHADOW_TARGET_SIZE = 1024;");
    expect(source).toContain("new THREE.RenderTarget(SHADOW_TARGET_SIZE, SHADOW_TARGET_SIZE");
    expect(source).toContain("createMmdTslShadowVisibilityNode(light, depthTexture)");
    expect(source).toContain("setReceiverVisibilityDebug");
    expect(source).toContain("material.colorNode = sampleTarget ? vec3(visibilityNode) : vec3(1, 1, 1)");
    expect(source).toContain("material.receivedShadowNode = null");
    expect(source).toContain("material.lights = false");
    expect(source).toContain("MMD_SELF_SHADOW_LAYER");
    expect(source).toContain("getShadowMaterial(light)");
    expect(source).toContain("getShadowRenderObjectFunction(");
    expect(source).toContain("THREE.RendererUtils.resetRendererAndSceneState");
    expect(source).toContain("THREE.RendererUtils.restoreRendererAndSceneState");
    expect(source).toContain("shadowCamera.layers.mask = 1 << MMD_SELF_SHADOW_LAYER;");
    expect(source).toContain("currentRenderer.render(scene, shadowCamera);");
    expect(source).toContain("renderTarget.dispose();");
  });

  it("does not expose the scaffold through the public WebGPU entry", async () => {
    const source = await readFile("src/webgpu/index.ts", "utf8");

    expect(source).not.toContain("self-shadow-pass");
    expect(source).not.toContain("createMmdTslSelfShadowPass");
  });
});
