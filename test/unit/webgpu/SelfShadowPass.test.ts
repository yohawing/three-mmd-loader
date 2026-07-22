import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("TSL dedicated self-shadow pass scaffold", () => {
  it("keeps the pass internal and preallocates its depth target", async () => {
    const source = await readFile("src/webgpu/self-shadow-pass.ts", "utf8");

    expect(source).toContain("export function createMmdTslSelfShadowPass");
    expect(source).toContain("Math.floor(light.shadow.mapSize.x)");
    expect(source).toContain("Math.floor(light.shadow.mapSize.y)");
    expect(source).toContain("new THREE.DepthTexture(targetWidth, targetHeight)");
    expect(source).toContain("depthTexture.compareFunction = null");
    expect(source).toContain("new THREE.RenderTarget(targetWidth, targetHeight");
    expect(source).toContain("const reversedDepth = renderer.reversedDepthBuffer === true;");
    expect(source).toContain("createMmdTslShadowVisibilityNode(light, depthTexture, { reversedDepth });");
    expect(source).toContain("setMode(mode: number): boolean;");
    expect(source).toContain("const nextMode = mode === 2 ? 2 : 1;");
    expect(source).toContain("shadowModeUniform.value = nextMode;");
    // T070-18: the pass used to bail out entirely under a reversed depth
    // buffer; now it syncs the shadow camera's reversedDepth flag proactively
    // (three only flips it lazily inside renderer.render(), which would
    // otherwise leave the very first frame's shadow.matrix stale -- see
    // node_modules/three/src/renderers/common/Renderer.js ~line 1516 and
    // node_modules/three/src/lights/LightShadow.js ~line 213) instead of
    // refusing to render.
    expect(source).not.toContain("currentRenderer.reversedDepthBuffer !== false");
    expect(source).toContain("const wantsReversedDepth = currentRenderer.reversedDepthBuffer === true;");
    expect(source).toContain("shadowCamera.reversedDepth !== wantsReversedDepth");
    expect(source).toContain("_reversedDepth: boolean");
    expect(source).toContain("setReceiverVisibilityDebug");
    expect(source).toContain("metadata?.flags?.selfShadow !== true");
    expect(source).toContain("mmdMaterial as {");
    expect(source).toContain("material.colorNode = sampleTarget ? vec3(visibilityNode) : vec3(1, 1, 1)");
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
