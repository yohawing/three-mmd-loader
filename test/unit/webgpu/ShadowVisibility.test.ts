import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("dedicated raw shadow visibility graph", () => {
  it("samples the independent depth target with directional receiver coordinates", async () => {
    const source = await readFile("src/webgpu/shadow-visibility.ts", "utf8");

    expect(source).toContain("createMmdTslShadowVisibilityNode");
    expect(source).toContain("lightShadowMatrix(light)");
    expect(source).toContain("positionWorld");
    expect(source).toContain("normalWorld.mul(normalBias)");
    expect(source).toContain("projected.y.oneMinus()");
    expect(source).toContain("texture(depthTexture, shadowCoord.xy).r");
    expect(source).toContain("shadowCoord.z.lessThanEqual(sampledDepth).select(float(1), float(0))");
    expect(source).not.toContain("occluderDepthDelta");
    expect(source).toContain("shadowCoord.x");
    expect(source).toContain(".greaterThanEqual(0)");
    expect(source).toContain("shadowCoord.z.greaterThanEqual(0)");
    expect(source).toContain('reference("bias", "float", light.shadow)');
    expect(source).toContain('reference("normalBias", "float", light.shadow)');
    expect(source).toContain("inFrustum.select(visibility, float(1))");
  });

  it("does not expose the visibility helper through the public WebGPU entry", async () => {
    const source = await readFile("src/webgpu/index.ts", "utf8");

    expect(source).not.toContain("shadow-visibility");
    expect(source).not.toContain("createMmdTslShadowVisibilityNode");
  });
});
