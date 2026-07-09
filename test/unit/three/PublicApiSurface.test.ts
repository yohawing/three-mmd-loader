import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("public API surface", () => {
  it("exports only the experimental WebGPU TSL entrypoint, not internal subpaths", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      exports?: Record<string, unknown>;
    };
    const publicThreeIndex = await readFile("src/three/index.ts", "utf8");
    const publicRootIndex = await readFile("src/index.ts", "utf8");

    expect(packageJson.exports).toHaveProperty("./webgpu");
    expect(packageJson.exports).not.toHaveProperty("./webgpu/material-core");
    expect(packageJson.exports).not.toHaveProperty("./webgpu/material-assembly");
    expect(publicThreeIndex).not.toContain("../webgpu/");
    expect(publicRootIndex).not.toContain("./webgpu/");
  });
});
